import { describe, it, expect } from 'vitest';
import { SurfacePainter } from '../src/worldgen/SurfacePainter';
import { ChunkData } from '../src/world/ChunkData';
import { CHUNK_SIZE_X, CHUNK_SIZE_Z, CHUNK_AREA, SEA_LEVEL } from '../src/core/constants';
import { AIR, GRASS, DIRT, STONE, SAND } from '../src/blocks/blocks';
import type { GenContext } from '../src/worldgen/TerrainStage';

/** Build a context whose heights are a constant value. */
function flatCtx(height: number): GenContext {
  const heights = new Int16Array(CHUNK_AREA).fill(height);
  return { seed: 1, cx: 0, cz: 0, heights, seaLevel: SEA_LEVEL };
}

describe('SurfacePainter', () => {
  const stage = new SurfacePainter();

  it('paints grass on top, a 3-deep dirt band, stone below, air above', () => {
    const top = 70;
    const chunk = new ChunkData(0, 0);
    stage.apply(chunk, flatCtx(top));
    for (let x = 0; x < CHUNK_SIZE_X; x++) {
      for (let z = 0; z < CHUNK_SIZE_Z; z++) {
        expect(chunk.get(x, top, z)).toBe(GRASS);
        expect(chunk.get(x, top - 1, z)).toBe(DIRT);
        expect(chunk.get(x, top - 3, z)).toBe(DIRT);
        expect(chunk.get(x, top - 4, z)).toBe(STONE);
        expect(chunk.get(x, 0, z)).toBe(STONE);
        expect(chunk.get(x, top + 1, z)).toBe(AIR);
      }
    }
  });
});

describe('SurfacePainter beaches', () => {
  it('caps columns at/below sea level with sand instead of grass/dirt', () => {
    const stage = new SurfacePainter();
    const top = SEA_LEVEL; // a shoreline column
    const chunk = new ChunkData(0, 0);
    stage.apply(chunk, flatCtx(top));
    expect(chunk.get(0, top, 0)).toBe(SAND);
    expect(chunk.get(0, top - 1, 0)).toBe(SAND); // sand band, not dirt
    expect(chunk.get(0, 0, 0)).toBe(STONE); // floor still stone
  });
});
