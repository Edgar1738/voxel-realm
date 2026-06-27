import { describe, it, expect, beforeEach } from 'vitest';
import { MemorySaveStore } from '../src/persistence/SaveStore';
import { STONE } from '../src/blocks/blocks';

describe('MemorySaveStore', () => {
  let store: MemorySaveStore;

  beforeEach(() => {
    store = new MemorySaveStore();
  });

  it('round-trips WorldMeta via saveMeta/loadMeta', async () => {
    const meta = { seed: 42, version: 1 };
    await store.saveMeta(meta);
    const loaded = await store.loadMeta();
    expect(loaded).toEqual(meta);
  });

  it('loadMeta returns undefined when nothing saved', async () => {
    expect(await store.loadMeta()).toBeUndefined();
  });

  it('saveChunkDelta then loadDeltas returns the correct Map structure', async () => {
    await store.saveChunkDelta('0,0', [[17937, STONE]]);
    const deltas = await store.loadDeltas();
    expect(deltas).toEqual(new Map([['0,0', new Map([[17937, STONE]])]]));
  });

  it('saving empty entries for a chunk deletes that chunk from deltas', async () => {
    await store.saveChunkDelta('0,0', [[17937, STONE]]);
    await store.saveChunkDelta('0,0', []);
    const deltas = await store.loadDeltas();
    expect(deltas.has('0,0')).toBe(false);
    expect(deltas.size).toBe(0);
  });

  it('clearDeltas empties all chunk deltas', async () => {
    await store.saveChunkDelta('0,0', [[17937, STONE]]);
    await store.saveChunkDelta('1,0', [[5, STONE]]);
    await store.clearDeltas();
    const deltas = await store.loadDeltas();
    expect(deltas.size).toBe(0);
  });
});
