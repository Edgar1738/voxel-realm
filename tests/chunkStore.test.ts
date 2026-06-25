import { describe, it, expect } from 'vitest';
import { ChunkStore, ChunkState } from '../src/world/ChunkStore';
import { ChunkData } from '../src/world/ChunkData';

describe('ChunkStore', () => {
  it('starts empty', () => {
    const store = new ChunkStore();
    expect(store.has(0, 0)).toBe(false);
    expect(store.get(0, 0)).toBeUndefined();
    expect([...store.keys()]).toEqual([]);
  });

  it('stores data with a state and reads it back', () => {
    const store = new ChunkStore();
    const data = new ChunkData(2, -1);
    store.set(2, -1, data, ChunkState.Generated);
    const entry = store.get(2, -1);
    expect(entry?.data).toBe(data);
    expect(entry?.state).toBe(ChunkState.Generated);
    expect(store.has(2, -1)).toBe(true);
  });

  it('updates state in place', () => {
    const store = new ChunkStore();
    store.set(0, 0, new ChunkData(0, 0), ChunkState.Generated);
    store.setState(0, 0, ChunkState.Meshed);
    expect(store.get(0, 0)?.state).toBe(ChunkState.Meshed);
  });

  it('deletes entries', () => {
    const store = new ChunkStore();
    store.set(0, 0, new ChunkData(0, 0), ChunkState.Generated);
    store.delete(0, 0);
    expect(store.has(0, 0)).toBe(false);
  });

  it('enumerates loaded coordinates', () => {
    const store = new ChunkStore();
    store.set(0, 0, new ChunkData(0, 0), ChunkState.Generated);
    store.set(1, 0, new ChunkData(1, 0), ChunkState.Meshed);
    expect(new Set(store.keys())).toEqual(new Set(['0,0', '1,0']));
  });
});
