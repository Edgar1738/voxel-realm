import { describe, it, expect } from 'vitest';
import { WaterFiller } from '../src/worldgen/WaterFiller';
import { SurfacePainter } from '../src/worldgen/SurfacePainter';
import { ChunkData } from '../src/world/ChunkData';
import { CHUNK_AREA, SEA_LEVEL } from '../src/core/constants';
import { AIR, WATER } from '../src/blocks/blocks';
import type { GenContext } from '../src/worldgen/TerrainStage';

function ctx(height: number): GenContext {
  return {
    seed: 1,
    cx: 0,
    cz: 0,
    heights: new Int16Array(CHUNK_AREA).fill(height),
    seaLevel: SEA_LEVEL,
  };
}

function paintedAndFilled(height: number): ChunkData {
  const c = ctx(height);
  const chunk = new ChunkData(0, 0);
  new SurfacePainter().apply(chunk, c);
  new WaterFiller().apply(chunk, c);
  return chunk;
}

describe('WaterFiller', () => {
  it('floods air above the surface up to sea level in below-sea columns', () => {
    const chunk = paintedAndFilled(SEA_LEVEL - 12);
    expect(chunk.get(0, SEA_LEVEL - 12, 0)).not.toBe(WATER); // surface stays solid
    expect(chunk.get(0, SEA_LEVEL - 5, 0)).toBe(WATER);
    expect(chunk.get(0, SEA_LEVEL, 0)).toBe(WATER); // up to sea level
    expect(chunk.get(0, SEA_LEVEL + 1, 0)).toBe(AIR); // not above it
  });

  it('does not add water in columns at or above sea level', () => {
    const chunk = paintedAndFilled(SEA_LEVEL + 10);
    for (let y = 0; y < 192; y++) expect(chunk.get(0, y, 0)).not.toBe(WATER);
  });
});
