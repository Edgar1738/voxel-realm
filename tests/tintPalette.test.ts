import { describe, it, expect } from 'vitest';
import { WHITE, TINT_PALETTE, tintIndexFor } from '../src/mesh/Tint';
import { Biome } from '../src/worldgen/BiomeMap';

describe('tint palette', () => {
  it('index 0 is white; palette has 1 + 6 + 6 = 13 entries', () => {
    expect(WHITE).toEqual([1, 1, 1]);
    expect(TINT_PALETTE.length).toBe(13);
    expect(TINT_PALETTE[0]).toEqual([1, 1, 1]);
  });
  it('Plains grass is the identity multiplier', () => {
    const i = tintIndexFor(Biome.Plains, 'grass');
    expect(i).toBe(1);
    expect(TINT_PALETTE[i]).toEqual([1, 1, 1]);
  });
  it('grass and foliage map to distinct index ranges; Swamp differs from Plains', () => {
    expect(tintIndexFor(Biome.Plains, 'foliage')).toBe(7);
    expect(tintIndexFor(Biome.Swamp, 'grass')).toBe(6);
    expect(TINT_PALETTE[tintIndexFor(Biome.Swamp, 'grass')]).not.toEqual([1, 1, 1]);
  });
  it('an out-of-range biome clamps to Plains (no out-of-bounds index)', () => {
    expect(tintIndexFor(99, 'grass')).toBe(1);
  });
});
