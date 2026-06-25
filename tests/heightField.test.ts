import { describe, it, expect } from 'vitest';
import { HeightField } from '../src/worldgen/HeightField';
import { ChunkData } from '../src/world/ChunkData';
import {
  CHUNK_SIZE_X,
  CHUNK_SIZE_Z,
  CHUNK_AREA,
  WORLD_HEIGHT,
  SEA_LEVEL,
} from '../src/core/constants';
import type { GenContext } from '../src/worldgen/TerrainStage';

function ctx(seed: number, cx: number, cz: number): GenContext {
  return { seed, cx, cz, heights: new Int16Array(CHUNK_AREA), seaLevel: SEA_LEVEL };
}

describe('HeightField', () => {
  const stage = new HeightField();

  it('fills every column with an in-range height', () => {
    const c = ctx(1337, 0, 0);
    stage.apply(new ChunkData(0, 0), c);
    for (let i = 0; i < CHUNK_AREA; i++) {
      expect(c.heights[i]).toBeGreaterThanOrEqual(1);
      expect(c.heights[i]).toBeLessThanOrEqual(WORLD_HEIGHT - 1);
    }
  });

  it('is deterministic for the same seed/coords', () => {
    const a = ctx(1337, 2, -3);
    const b = ctx(1337, 2, -3);
    stage.apply(new ChunkData(2, -3), a);
    stage.apply(new ChunkData(2, -3), b);
    expect(Array.from(a.heights)).toEqual(Array.from(b.heights));
  });

  it('produces different heights for different chunks', () => {
    const a = ctx(1337, 0, 0);
    const b = ctx(1337, 5, 5);
    stage.apply(new ChunkData(0, 0), a);
    stage.apply(new ChunkData(5, 5), b);
    expect(Array.from(a.heights)).not.toEqual(Array.from(b.heights));
  });

  it('indexes heights as x + CHUNK_SIZE_X * z', () => {
    const c = ctx(1337, 0, 0);
    stage.apply(new ChunkData(0, 0), c);
    expect(c.heights[CHUNK_SIZE_X - 1 + CHUNK_SIZE_X * (CHUNK_SIZE_Z - 1)]).toBeGreaterThan(0);
  });
});

describe('HeightField relief variety', () => {
  it('produces a wide spread of heights across a large area (plains to mountains)', () => {
    const stage = new HeightField();
    let min = Infinity;
    let max = -Infinity;
    // Sample a 12x12 chunk region.
    for (let cx = -6; cx < 6; cx++) {
      for (let cz = -6; cz < 6; cz++) {
        const c = ctx(1337, cx, cz);
        stage.apply(new ChunkData(cx, cz), c);
        for (let i = 0; i < c.heights.length; i++) {
          min = Math.min(min, c.heights[i]);
          max = Math.max(max, c.heights[i]);
        }
      }
    }
    expect(max - min).toBeGreaterThan(30); // meaningful relief, not a near-flat plane
    expect(min).toBeGreaterThanOrEqual(1);
    expect(max).toBeLessThanOrEqual(WORLD_HEIGHT - 1);
  });
});
