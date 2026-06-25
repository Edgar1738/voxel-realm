import { describe, it, expect } from 'vitest';
import { ChunkData } from '../src/world/ChunkData';
import { VoxelView } from '../src/world/VoxelView';
import { CHUNK_SIZE_X, WORLD_HEIGHT } from '../src/core/constants';
import { AIR, STONE, GRASS } from '../src/blocks/blocks';

describe('VoxelView', () => {
  it('reads voxels from the center chunk', () => {
    const center = new ChunkData(0, 0);
    center.set(3, 10, 5, STONE);
    const view = new VoxelView(center, () => undefined);
    expect(view.get(3, 10, 5)).toBe(STONE);
  });

  it('reads across the +X border into a neighbor chunk', () => {
    const center = new ChunkData(0, 0);
    const east = new ChunkData(1, 0);
    east.set(0, 10, 5, GRASS); // local (0,..) of east == world x = 16
    const view = new VoxelView(center, (dcx, dcz) => (dcx === 1 && dcz === 0 ? east : undefined));
    expect(view.get(CHUNK_SIZE_X, 10, 5)).toBe(GRASS);
  });

  it('reads across the -X border into a neighbor chunk', () => {
    const center = new ChunkData(0, 0);
    const west = new ChunkData(-1, 0);
    west.set(CHUNK_SIZE_X - 1, 10, 5, GRASS); // world x = -1
    const view = new VoxelView(center, (dcx, dcz) => (dcx === -1 && dcz === 0 ? west : undefined));
    expect(view.get(-1, 10, 5)).toBe(GRASS);
  });

  it('treats a missing neighbor as air', () => {
    const center = new ChunkData(0, 0);
    const view = new VoxelView(center, () => undefined);
    expect(view.get(-1, 10, 5)).toBe(AIR);
    expect(view.get(CHUNK_SIZE_X, 10, 5)).toBe(AIR);
  });

  it('treats out-of-vertical-range as air', () => {
    const center = new ChunkData(0, 0);
    const view = new VoxelView(center, () => undefined);
    expect(view.get(0, -1, 0)).toBe(AIR);
    expect(view.get(0, WORLD_HEIGHT, 0)).toBe(AIR);
  });
});
