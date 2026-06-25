import { describe, it, expect } from 'vitest';
import { ChunkData } from '../src/world/ChunkData';
import { CHUNK_VOLUME } from '../src/core/constants';
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
