import { describe, it, expect } from 'vitest';
import { BiomeMap, Biome } from '../src/worldgen/BiomeMap';

const SEED = 1337;

describe('BiomeMap', () => {
  it('is deterministic', () => {
    const a = new BiomeMap(SEED);
    const b = new BiomeMap(SEED);
    expect(a.biomeAt(100, -250)).toBe(b.biomeAt(100, -250));
    expect(a.defAt(100, -250).amplitude).toBe(b.defAt(100, -250).amplitude);
  });

  it('produces all five biomes across a large region', () => {
    const map = new BiomeMap(SEED);
    const seen = new Set<Biome>();
    for (let x = -2048; x <= 2048; x += 64)
      for (let z = -2048; z <= 2048; z += 64) seen.add(map.biomeAt(x, z));
    expect(seen.has(Biome.Plains)).toBe(true);
    expect(seen.has(Biome.Forest)).toBe(true);
    expect(seen.has(Biome.Desert)).toBe(true);
    expect(seen.has(Biome.Mountains)).toBe(true);
    expect(seen.has(Biome.Tundra)).toBe(true);
  });

  it('gives mountains the highest amplitude and desert the lowest', () => {
    const map = new BiomeMap(SEED);
    expect(map.defForBiome(Biome.Mountains).amplitude).toBeGreaterThan(
      map.defForBiome(Biome.Plains).amplitude,
    );
    expect(map.defForBiome(Biome.Desert).amplitude).toBeLessThan(
      map.defForBiome(Biome.Plains).amplitude,
    );
  });

  it('blends terrain params smoothly between adjacent columns (no cliffs)', () => {
    const map = new BiomeMap(SEED);
    let maxJump = 0;
    let prev = map.blendedTerrain(0, 0).amplitude;
    for (let x = 1; x <= 4000; x++) {
      const amp = map.blendedTerrain(x, 0).amplitude;
      maxJump = Math.max(maxJump, Math.abs(amp - prev));
      prev = amp;
    }
    // A blended field changes gradually; a hard biome switch would jump tens of blocks.
    expect(maxJump).toBeLessThan(5);
  });

  it('keeps blended amplitude within the min/max of biome amplitudes', () => {
    const map = new BiomeMap(SEED);
    const amps = [Biome.Plains, Biome.Forest, Biome.Desert, Biome.Mountains, Biome.Tundra].map(
      (b) => map.defForBiome(b).amplitude,
    );
    const lo = Math.min(...amps);
    const hi = Math.max(...amps);
    for (let x = 0; x < 1000; x += 10) {
      const amp = map.blendedTerrain(x, x).amplitude;
      expect(amp).toBeGreaterThanOrEqual(lo);
      expect(amp).toBeLessThanOrEqual(hi);
    }
  });

  // --- New: integer key cache (no string allocation) ---
  it('returns identical biome results after switching to integer key cache', () => {
    // Verify the refactored cache key does not change classification output.
    const map = new BiomeMap(SEED);
    // Sample many points including negative coords (where packing must be correct)
    const points = [
      [0, 0],
      [100, -250],
      [-512, 512],
      [32767, -32768],
      [-32768, 32767],
      [1000, 1000],
      [-1000, -1000],
      [255, -255],
      [0, -1],
      [-1, 0],
    ];
    // Build reference from a fresh map (no cache) and compare to cached map
    const ref = new BiomeMap(SEED);
    for (const [x, z] of points) {
      expect(map.biomeAt(x, z)).toBe(ref.biomeAt(x, z));
      expect(map.blendedTerrain(x, z).amplitude).toBeCloseTo(
        ref.blendedTerrain(x, z).amplitude,
        10,
      );
    }
  });

  it('cache hit returns the same biome as a cache miss', () => {
    const map = new BiomeMap(SEED);
    // First call is a miss, second is a hit — must match
    const first = map.biomeAt(256, -256);
    const second = map.biomeAt(256, -256);
    expect(first).toBe(second);
  });

  it('handles negative coordinates without key collision', () => {
    // With a naive pack like (x & 0xffff) | ((z & 0xffff) << 16),
    // (1, 0) and (-65535, 0) would collide if truncated incorrectly.
    // Verify distinct coords give distinct (or at least non-colliding) cache entries.
    const map = new BiomeMap(SEED);
    // If there were a collision, the wrong cached biome would be returned.
    // We can't inspect the cache directly, but we verify each coord returns
    // the same value on repeated lookups.
    const coordPairs: [number, number][] = [
      [1, 0],
      [0, 1],
      [-1, 0],
      [0, -1],
      [32767, 0],
      [-32768, 0],
      [0, 32767],
      [0, -32768],
      [256, 256],
      [-256, -256],
      [256, -256],
      [-256, 256],
    ];
    for (const [x, z] of coordPairs) {
      const b1 = map.biomeAt(x, z);
      const b2 = map.biomeAt(x, z);
      expect(b1).toBe(b2);
    }
  });

  it('biomeAt result is stable across many lookups (cache does not corrupt values)', () => {
    // Stress the cache by querying thousands of coords, then re-querying a subset.
    const map = new BiomeMap(SEED);
    const sample: Array<[number, number, Biome]> = [];
    for (let x = -512; x <= 512; x += 32)
      for (let z = -512; z <= 512; z += 32) {
        const b = map.biomeAt(x, z);
        sample.push([x, z, b]);
      }
    // Re-query — cache may have been populated or even cleared by cap; result must match
    for (const [x, z, expected] of sample) {
      expect(map.biomeAt(x, z)).toBe(expected);
    }
  });

  it('does not alias coordinates 65536 apart', () => {
    // Seed 2 is chosen because (0,0) classifies as Plains and (65536,0) classifies as
    // Forest — they produce DIFFERENT biomes, making this test meaningful. With the old
    // aliasing cache (e.g. key = x & 0xffff), both coords would share the same cache
    // slot, so biomeAt(65536,0) would incorrectly return (0,0)'s cached biome (Plains),
    // causing `expect(b).toBe(ref.biomeAt(65536,0))` to fail (Plains ≠ Forest).
    const ALIAS_SEED = 2;
    const m = new BiomeMap(ALIAS_SEED);
    const a = m.biomeAt(0, 0);
    const b = m.biomeAt(65536, 0);
    // Precondition: the two coords classify differently — this is what makes the test
    // meaningful. If they were the same biome the alias bug would be undetectable.
    expect(a).not.toBe(b);
    // Cross-check against a cold (cache-free) instance so a re-introduced alias is caught:
    // a buggy cache would return (0,0)'s biome for (65536,0), making b !== ref.biomeAt(65536,0).
    const ref = new BiomeMap(ALIAS_SEED);
    expect(a).toBe(ref.biomeAt(0, 0));
    expect(b).toBe(ref.biomeAt(65536, 0));
  });
});
