import { describe, it, expect } from 'vitest';
import { CaveCarver } from '../src/worldgen/CaveCarver';
import { SurfacePainter } from '../src/worldgen/SurfacePainter';
import { ChunkData } from '../src/world/ChunkData';
import { CHUNK_SIZE_X, CHUNK_SIZE_Z, CHUNK_AREA, SEA_LEVEL } from '../src/core/constants';
import { AIR } from '../src/blocks/blocks';
import type { GenContext } from '../src/worldgen/TerrainStage';

const FLAT = 80;

function paintedChunk(cx: number, cz: number): { chunk: ChunkData; ctx: GenContext } {
  const ctx: GenContext = {
    seed: 1337,
    cx,
    cz,
    heights: new Int16Array(CHUNK_AREA).fill(FLAT),
    seaLevel: SEA_LEVEL,
  };
  const chunk = new ChunkData(cx, cz);
  new SurfacePainter().apply(chunk, ctx);
  return { chunk, ctx };
}

describe('CaveCarver', () => {
  const carver = new CaveCarver();

  it('carves at least some air pockets below the surface across a region', () => {
    let carved = 0;
    for (let cx = -5; cx < 5; cx++) {
      for (let cz = -5; cz < 5; cz++) {
        const { chunk, ctx } = paintedChunk(cx, cz);
        carver.apply(chunk, ctx);
        for (let x = 0; x < CHUNK_SIZE_X; x++)
          for (let z = 0; z < CHUNK_SIZE_Z; z++)
            for (let y = 5; y < FLAT; y++) if (chunk.get(x, y, z) === AIR) carved++;
      }
    }
    expect(carved).toBeGreaterThan(0);
  });

  it('never carves the world floor (y < 4) or the grass cap (y = surface)', () => {
    for (let cx = -3; cx < 3; cx++) {
      for (let cz = -3; cz < 3; cz++) {
        const { chunk, ctx } = paintedChunk(cx, cz);
        carver.apply(chunk, ctx);
        for (let x = 0; x < CHUNK_SIZE_X; x++) {
          for (let z = 0; z < CHUNK_SIZE_Z; z++) {
            for (let y = 0; y < 4; y++) expect(chunk.get(x, y, z)).not.toBe(AIR);
            expect(chunk.get(x, FLAT, z)).not.toBe(AIR); // grass cap intact
          }
        }
      }
    }
  });

  it('is deterministic for the same seed/coords', () => {
    const a = paintedChunk(2, -1);
    const b = paintedChunk(2, -1);
    carver.apply(a.chunk, a.ctx);
    carver.apply(b.chunk, b.ctx);
    expect(Array.from(a.chunk.data)).toEqual(Array.from(b.chunk.data));
  });
});
