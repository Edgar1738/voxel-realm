import { describe, it, expect } from 'vitest';
import { ChunkData } from '../src/world/ChunkData';
import { CHUNK_VOLUME, WORLD_HEIGHT } from '../src/core/constants';
import { AIR, STONE } from '../src/blocks/blocks';

describe('ChunkData', () => {
  it('starts full of air', () => {
    const c = new ChunkData(0, 0);
    expect(c.data.length).toBe(CHUNK_VOLUME);
    expect(c.get(3, 10, 5)).toBe(AIR);
  });

  it('stores and reads back a block', () => {
    const c = new ChunkData(2, -1);
    c.set(3, 10, 5, STONE);
    expect(c.get(3, 10, 5)).toBe(STONE);
    expect(c.cx).toBe(2);
    expect(c.cz).toBe(-1);
  });

  it('treats out-of-bounds reads as air', () => {
    const c = new ChunkData(0, 0);
    expect(c.get(-1, 0, 0)).toBe(AIR);
    expect(c.get(0, -1, 0)).toBe(AIR);
    expect(c.get(16, 0, 0)).toBe(AIR);
  });

  it('throws on out-of-bounds writes', () => {
    const c = new ChunkData(0, 0);
    expect(() => c.set(-1, 0, 0, STONE)).toThrow();
    expect(() => c.set(0, 1000, 0, STONE)).toThrow();
  });
});

describe('ChunkData.maxSolidY', () => {
  it('is -1 for an all-air chunk', () => {
    expect(new ChunkData(0, 0).maxSolidY).toBe(-1);
  });

  it('rises to the highest non-air voxel set', () => {
    const c = new ChunkData(0, 0);
    c.set(3, 10, 5, STONE);
    expect(c.maxSolidY).toBe(10);
    c.set(1, 5, 1, STONE); // lower — no change
    expect(c.maxSolidY).toBe(10);
    c.set(0, 20, 0, STONE); // higher — rises
    expect(c.maxSolidY).toBe(20);
  });

  it('falls to the next solid voxel when the top voxel is cleared to AIR', () => {
    const c = new ChunkData(0, 0);
    c.set(1, 5, 1, STONE);
    c.set(0, 20, 0, STONE);
    expect(c.maxSolidY).toBe(20);
    c.set(0, 20, 0, AIR); // clear the top -> falls to the next solid slice
    expect(c.maxSolidY).toBe(5);
  });

  it('drops to -1 when the last solid voxel is cleared', () => {
    const c = new ChunkData(0, 0);
    c.set(0, 20, 0, STONE);
    c.set(0, 20, 0, AIR);
    expect(c.maxSolidY).toBe(-1);
  });

  it('stays put when a non-top voxel is cleared', () => {
    const c = new ChunkData(0, 0);
    c.set(1, 5, 1, STONE);
    c.set(0, 20, 0, STONE);
    c.set(1, 5, 1, AIR); // clear below the top -> no change
    expect(c.maxSolidY).toBe(20);
  });

  it('stays put when one of several voxels sharing the top slice is cleared', () => {
    const c = new ChunkData(0, 0);
    c.set(0, 20, 0, STONE);
    c.set(3, 20, 4, STONE); // second voxel on the same top slice
    c.set(0, 20, 0, AIR); // clear one -> slice still occupied, stays at 20
    expect(c.maxSolidY).toBe(20);
  });

  it('recomputes the exact max after a bulk write that bypasses set()', () => {
    const c = new ChunkData(0, 0);
    c.data[c.data.length - 1] = STONE; // top-most voxel, written directly
    expect(c.maxSolidY).toBe(-1); // set() was bypassed
    c.recomputeMaxSolidY();
    expect(c.maxSolidY).toBe(WORLD_HEIGHT - 1);
  });

  it('recomputes to -1 for an all-air chunk', () => {
    const c = new ChunkData(0, 0);
    c.recomputeMaxSolidY();
    expect(c.maxSolidY).toBe(-1);
  });
});
