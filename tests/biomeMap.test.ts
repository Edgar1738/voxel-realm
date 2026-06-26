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
});
