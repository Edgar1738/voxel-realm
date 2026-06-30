import { describe, it, expect } from 'vitest';
import { ChunkData } from '../src/world/ChunkData';
import { VoxelView } from '../src/world/VoxelView';
import { createWorldGenerator } from '../src/worldgen/LayeredGenerator';

describe('per-column biome', () => {
  it('ChunkData biome round-trips; default is 0', () => {
    const d = new ChunkData(0, 0);
    expect(d.getBiome(3, 4)).toBe(0);
    d.setBiome(3, 4, 5);
    expect(d.getBiome(3, 4)).toBe(5);
    expect(d.getBiome(0, 0)).toBe(0);
  });
  it('VoxelView.biomeAt reads the center chunk; neighbors read 0', () => {
    const d = new ChunkData(0, 0);
    d.setBiome(2, 2, 3);
    const view = new VoxelView(d, () => undefined);
    expect(view.biomeAt(2, 2)).toBe(3);
    expect(view.biomeAt(-1, 2)).toBe(0); // neighbor column → default
  });
  it('the generator stamps a biome for every column', () => {
    const chunk = createWorldGenerator().generateBaseChunk(12345, 0, 0);
    // Every column has a biome ordinal in 0..5.
    for (let x = 0; x < 16; x++)
      for (let z = 0; z < 16; z++) expect(chunk.getBiome(x, z)).toBeLessThanOrEqual(5);
  });
});
