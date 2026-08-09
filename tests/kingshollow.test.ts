import { describe, expect, it } from 'vitest';
import {
  AIR,
  AGED_MASONRY,
  CLAY_ROOF,
  COBBLESTONE,
  CRYSTAL,
  GRAVEL,
  LAVA,
  OBSIDIAN,
  PLANKS,
  STONE_SLAB,
  WATER,
  WARM_MASONRY,
  WOOD,
} from '../src/blocks/blocks';
import { KINGSHOLLOW, kingshollowSurfaceAt } from '../src/worldgen/KingshollowGenerator';
import { createGenerator, isWorldPreset } from '../src/worldgen/Presets';
import { curatedPresetMeta } from '../src/app/curatedPreset';

describe('Kingshollow showcase', () => {
  it('is a recognized authored preset with a village and castle overlay', () => {
    expect(isWorldPreset('kingshollow')).toBe(true);
    expect(createGenerator('kingshollow').overlays).toHaveLength(5);
  });

  it('levels the village and raises the castle motte', () => {
    expect(Math.round(kingshollowSurfaceAt(1337, 40, 20))).toBe(KINGSHOLLOW.villageY);
    expect(Math.round(kingshollowSurfaceAt(1337, 0, -45))).toBe(KINGSHOLLOW.castleY);
  });

  it('stamps a market road, cottage, and masonry keep', () => {
    const { generator, overlays } = createGenerator('kingshollow');
    const chunk = generator.generateBaseChunk(1337, 0, 0);
    for (const overlay of overlays) overlay(chunk, 0, 0, 1337);
    expect([COBBLESTONE, GRAVEL]).toContain(chunk.get(0, KINGSHOLLOW.villageY, 2));
    expect(chunk.data.some((block) => block === CLAY_ROOF)).toBe(true);

    const castleChunk = generator.generateBaseChunk(1337, 0, -3);
    for (const overlay of overlays) overlay(castleChunk, 0, -3, 1337);
    expect(castleChunk.data.some((block) => block === WARM_MASONRY)).toBe(true);
    expect(castleChunk.data.some((block) => block !== AIR)).toBe(true);
  });

  it('has an authored arrival and tour', () => {
    const meta = curatedPresetMeta('kingshollow', 1337, 1);
    expect(meta?.title).toBe('Kingshollow Village');
    expect(meta?.tour?.length).toBeGreaterThanOrEqual(10);
  });
});

describe('Kingshollow district expansion', () => {
  const at = (wx: number, wy: number, wz: number): number => {
    const cx = Math.floor(wx / 16),
      cz = Math.floor(wz / 16);
    const { generator, overlays } = createGenerator('kingshollow');
    const chunk = generator.generateBaseChunk(1337, cx, cz);
    for (const overlay of overlays) overlay(chunk, cx, cz, 1337);
    return chunk.get(((wx % 16) + 16) % 16, wy, ((wz % 16) + 16) % 16);
  };

  it('reserves level benches for all four districts and carves the eastern river', () => {
    expect(Math.round(kingshollowSurfaceAt(1337, 0, 130))).toBe(KINGSHOLLOW.villageY);
    expect(Math.round(kingshollowSurfaceAt(1337, -128, 42))).toBe(KINGSHOLLOW.villageY);
    expect(Math.round(kingshollowSurfaceAt(1337, 137, 20))).toBe(KINGSHOLLOW.villageY);
    expect(Math.round(kingshollowSurfaceAt(1337, 0, -137))).toBe(KINGSHOLLOW.abbeyY);
    expect(Math.round(kingshollowSurfaceAt(1337, KINGSHOLLOW.riverX, 0))).toBeLessThanOrEqual(61);
  });

  it('builds the southern gate and eastern river bridge', () => {
    expect(at(-9, KINGSHOLLOW.villageY + 5, 90)).toBe(AGED_MASONRY);
    expect(at(100, KINGSHOLLOW.villageY + 1, 2)).toBe(STONE_SLAB);
  });

  it('builds the western windmill and northern abbey', () => {
    expect(at(-145, KINGSHOLLOW.villageY + 10, 12)).toBe(WOOD);
    expect(at(-23, KINGSHOLLOW.abbeyY + 6, -141)).toBe(AGED_MASONRY);
  });
});

describe('The Hollow Below', () => {
  const at = (wx: number, wy: number, wz: number): number => {
    const cx = Math.floor(wx / 16);
    const cz = Math.floor(wz / 16);
    const { generator, overlays } = createGenerator('kingshollow');
    const chunk = generator.generateBaseChunk(1337, cx, cz);
    for (const overlay of overlays) overlay(chunk, cx, cz, 1337);
    return chunk.get(((wx % 16) + 16) % 16, wy, ((wz % 16) + 16) % 16);
  };

  it('connects the castle well to open upper works', () => {
    expect(at(-13, 58, -49)).toBe(AIR);
    expect(at(-4, 49, -18)).toBe(AIR);
  });

  it('connects the northern abbey crypt to the old works branch', () => {
    expect(at(-33, 47, -140)).toBe(AIR);
    expect(at(-49, 46, -86)).toBe(AIR);
  });

  it('builds water features in the reservoir and Great Rift', () => {
    expect(at(13, 35, 12)).toBe(WATER);
    expect(at(5, 30, 49)).toBe(WATER);
  });

  it('builds the traversable crystal bridge', () => {
    expect(at(47, 35, 18)).toBe(PLANKS);
    expect(at(47, 36, 18)).toBe(AIR);
  });

  it('transitions through lava and obsidian before the Heartforge', () => {
    expect(at(-51, 20, 6)).toBe(LAVA);
    expect(at(-29, 11, -5)).toBe(OBSIDIAN);
    expect(at(2, 9, -48)).toBe(CRYSTAL);
  });
});
