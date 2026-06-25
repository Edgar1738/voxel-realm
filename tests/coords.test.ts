import { describe, it, expect } from 'vitest';
import { CHUNK_SIZE_X, CHUNK_SIZE_Z, WORLD_HEIGHT, CHUNK_VOLUME } from '../src/core/constants';
import {
  voxelIndex,
  indexToLocal,
  inChunkBounds,
  worldToChunkCoord,
  worldToLocal,
} from '../src/core/coords';

describe('constants', () => {
  it('chunk volume matches dimensions', () => {
    expect(CHUNK_VOLUME).toBe(CHUNK_SIZE_X * WORLD_HEIGHT * CHUNK_SIZE_Z);
  });
});

describe('voxelIndex', () => {
  it('is zero at the origin voxel', () => {
    expect(voxelIndex(0, 0, 0)).toBe(0);
  });

  it('round-trips index -> local -> index across the whole volume corners', () => {
    const corners: Array<[number, number, number]> = [
      [0, 0, 0],
      [CHUNK_SIZE_X - 1, 0, 0],
      [0, WORLD_HEIGHT - 1, 0],
      [0, 0, CHUNK_SIZE_Z - 1],
      [CHUNK_SIZE_X - 1, WORLD_HEIGHT - 1, CHUNK_SIZE_Z - 1],
      [5, 100, 9],
    ];
    for (const [x, y, z] of corners) {
      const idx = voxelIndex(x, y, z);
      expect(indexToLocal(idx)).toEqual({ x, y, z });
    }
  });

  it('produces unique indices for every voxel', () => {
    const seen = new Set<number>();
    for (let y = 0; y < WORLD_HEIGHT; y++)
      for (let z = 0; z < CHUNK_SIZE_Z; z++)
        for (let x = 0; x < CHUNK_SIZE_X; x++) seen.add(voxelIndex(x, y, z));
    expect(seen.size).toBe(CHUNK_VOLUME);
  });
});

describe('bounds', () => {
  it('accepts in-range and rejects out-of-range', () => {
    expect(inChunkBounds(0, 0, 0)).toBe(true);
    expect(inChunkBounds(CHUNK_SIZE_X - 1, WORLD_HEIGHT - 1, CHUNK_SIZE_Z - 1)).toBe(true);
    expect(inChunkBounds(-1, 0, 0)).toBe(false);
    expect(inChunkBounds(0, WORLD_HEIGHT, 0)).toBe(false);
    expect(inChunkBounds(CHUNK_SIZE_X, 0, 0)).toBe(false);
  });
});

describe('world <-> chunk/local', () => {
  it('maps world coords into chunk coords with floor division', () => {
    expect(worldToChunkCoord(0)).toBe(0);
    expect(worldToChunkCoord(15)).toBe(0);
    expect(worldToChunkCoord(16)).toBe(1);
    expect(worldToChunkCoord(-1)).toBe(-1);
    expect(worldToChunkCoord(-16)).toBe(-1);
    expect(worldToChunkCoord(-17)).toBe(-2);
  });

  it('maps world coords into non-negative local coords', () => {
    expect(worldToLocal(0)).toBe(0);
    expect(worldToLocal(16)).toBe(0);
    expect(worldToLocal(-1)).toBe(15);
    expect(worldToLocal(-16)).toBe(0);
  });
});
