import { describe, it, expect } from 'vitest';
import { CaveThemeStage, caveThemeAt } from '../src/worldgen/CaveThemes';
import { ChunkData } from '../src/world/ChunkData';
import { CHUNK_AREA, CHUNK_SIZE_X, CHUNK_SIZE_Z, SEA_LEVEL } from '../src/core/constants';
import { AIR, STONE, CRYSTAL, MOSS, MUSHROOM } from '../src/blocks/blocks';
import { Biome, type BiomeSource } from '../src/worldgen/BiomeMap';
import type { GenContext } from '../src/worldgen/TerrainStage';

const source: BiomeSource = {
  biomeAt: () => Biome.Plains,
  blendedTerrain: () => ({ amplitude: 8, baseOffset: 0 }),
};

/** A stone slab world with a flat cave gallery carved from y=20..24 across the chunk. */
function cavedChunk(cx: number, cz: number, height: number): ChunkData {
  const c = new ChunkData(cx, cz);
  for (let x = 0; x < CHUNK_SIZE_X; x++) {
    for (let z = 0; z < CHUNK_SIZE_Z; z++) {
      for (let y = 0; y <= height; y++) c.set(x, y, z, STONE);
      for (let y = 20; y <= 24; y++) c.set(x, y, z, AIR);
    }
  }
  return c;
}

function ctxFor(cx: number, cz: number, seed: number, height: number): GenContext {
  return {
    seed,
    cx,
    cz,
    heights: new Int16Array(CHUNK_AREA).fill(height),
    seaLevel: SEA_LEVEL,
    biomes: source,
  };
}

function accents(c: ChunkData): { crystal: number; moss: number; mushroom: number } {
  let crystal = 0;
  let moss = 0;
  let mushroom = 0;
  for (const v of c.data) {
    if (v === CRYSTAL) crystal++;
    else if (v === MOSS) moss++;
    else if (v === MUSHROOM) mushroom++;
  }
  return { crystal, moss, mushroom };
}

describe('caveThemeAt', () => {
  it('is deterministic and constant within a 128-block cell', () => {
    const t = caveThemeAt(1337, 300, 300);
    expect(caveThemeAt(1337, 300, 300)).toBe(t);
    expect(caveThemeAt(1337, 300 + 60, 300 + 60)).toBe(caveThemeAt(1337, 256, 256));
  });

  it('assigns all three themes somewhere, with none dominating everywhere', () => {
    const seen = new Set<string>();
    for (let gx = 0; gx < 30; gx++)
      for (let gz = 0; gz < 30; gz++) seen.add(caveThemeAt(42, gx * 128, gz * 128));
    expect(seen).toContain('none');
    expect(seen).toContain('crystal');
    expect(seen).toContain('fungal');
  });
});

describe('CaveThemeStage', () => {
  const stage = new CaveThemeStage();

  it('decorates a themed deep gallery deterministically with only its own accents', () => {
    // Find a crystal cell and a fungal cell.
    const find = (theme: string): [number, number] => {
      for (let gx = 0; gx < 200; gx++) {
        if (caveThemeAt(7, gx * 128, 0) === theme) return [(gx * 128) / CHUNK_SIZE_X, 0];
      }
      throw new Error(`no ${theme} cell found`);
    };
    const [ccx] = find('crystal');
    const a = cavedChunk(ccx, 0, 80);
    const b = cavedChunk(ccx, 0, 80);
    stage.apply(a, ctxFor(ccx, 0, 7, 80));
    stage.apply(b, ctxFor(ccx, 0, 7, 80));
    expect(Array.from(a.data)).toEqual(Array.from(b.data));
    const ca = accents(a);
    expect(ca.crystal).toBeGreaterThan(0);
    expect(ca.moss + ca.mushroom).toBe(0);

    const [fcx] = find('fungal');
    const f = cavedChunk(fcx, 0, 80);
    stage.apply(f, ctxFor(fcx, 0, 7, 80));
    const cf = accents(f);
    expect(cf.moss).toBeGreaterThan(0);
    expect(cf.crystal).toBe(0);
  });

  it('never touches shallow galleries (insufficient cover) or non-air/non-floor voxels', () => {
    // Height 30 -> top = min(52, 30-12) = 18 < gallery at 20..24, so nothing changes.
    for (let cx = 0; cx < 50; cx++) {
      const c = cavedChunk(cx, 3, 30);
      const before = Array.from(c.data);
      stage.apply(c, ctxFor(cx, 3, 7, 30));
      expect(Array.from(c.data)).toEqual(before);
    }
  });
});
