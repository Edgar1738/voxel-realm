import { describe, it, expect, vi } from 'vitest';
import {
  ShippedWorldStore,
  fetchShippedWorld,
  type ShippedWorldBase,
} from '../src/persistence/ShippedWorldStore';
import { MemorySaveStore } from '../src/persistence/SaveStore';
import { packVoxel } from '../src/persistence/SaveTypes';
import type { WorldDeltas, WorldMeta } from '../src/persistence/SaveTypes';

const META: WorldMeta = {
  seed: 1337,
  version: 1,
  preset: 'flat',
  title: 'Test Cove',
  description: 'A test world.',
  spawn: { x: 0, y: 64, z: 8 },
  look: { yaw: 1, pitch: 0 },
};

function base(deltas: WorldDeltas = new Map()): ShippedWorldBase {
  return { meta: META, deltas };
}

function chunk(entries: Array<[number, number]>): Map<number, number> {
  return new Map(entries.map(([i, id]) => [i, packVoxel(id, 0)]));
}

describe('ShippedWorldStore', () => {
  it('serves meta from the base, not the overlay', async () => {
    const overlay = new MemorySaveStore();
    await overlay.saveMeta({ seed: 1337, version: 1, preset: 'flat' }); // bare bookkeeping meta
    const store = new ShippedWorldStore(async () => base(), overlay);
    expect(await store.loadMeta()).toEqual(META);
  });

  it('fetches the base once, lazily', async () => {
    const load = vi.fn(async () => base());
    const store = new ShippedWorldStore(load, new MemorySaveStore());
    expect(load).not.toHaveBeenCalled();
    await store.loadMeta();
    await store.loadDeltas();
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('rejects loadMeta when the base fetch fails (boot fails closed)', async () => {
    const store = new ShippedWorldStore(async () => {
      throw new Error('offline');
    }, new MemorySaveStore());
    await expect(store.loadMeta()).rejects.toThrow('offline');
  });

  it('merges deltas with overlay chunks replacing base chunks', async () => {
    const baseDeltas: WorldDeltas = new Map([
      ['0,0', chunk([[1, 2]])],
      ['1,0', chunk([[5, 3]])],
    ]);
    const overlay = new MemorySaveStore();
    await overlay.saveChunkDelta('1,0', [[7, 4]]); // player edited chunk 1,0
    const store = new ShippedWorldStore(async () => base(baseDeltas), overlay);

    const merged = await store.loadDeltas();
    expect(merged.get('0,0')).toEqual(chunk([[1, 2]])); // untouched base chunk intact
    expect(merged.get('1,0')).toEqual(chunk([[7, 4]])); // overlay replaces, not merges
  });

  it('hands ownership of the base maps: a second loadDeltas re-fetches instead of seeing caller mutations', async () => {
    // Fresh deltas per fetch, like the real loader (parses the packaged JSON each time).
    const load = vi.fn(async () => base(new Map([['0,0', chunk([[1, 2]])]])));
    const store = new ShippedWorldStore(load, new MemorySaveStore());
    (await store.loadDeltas()).get('0,0')!.set(9, packVoxel(9, 0));
    expect((await store.loadDeltas()).get('0,0')).toEqual(chunk([[1, 2]]));
    expect(load).toHaveBeenCalledTimes(2); // the consumed base was dropped, not reused
  });

  it('still serves meta after loadDeltas consumed the base (no re-fetch)', async () => {
    const load = vi.fn(async () => base(new Map()));
    const store = new ShippedWorldStore(load, new MemorySaveStore());
    await store.loadDeltas();
    expect(await store.loadMeta()).toEqual(META);
    expect(load).toHaveBeenCalledTimes(1); // meta is cached across the handoff
  });

  it('routes writes and clearDeltas to the overlay only', async () => {
    const baseDeltas: WorldDeltas = new Map([['0,0', chunk([[1, 2]])]]);
    const overlay = new MemorySaveStore();
    const store = new ShippedWorldStore(async () => base(baseDeltas), overlay);

    await store.saveChunkDelta('2,2', [[3, 5]]);
    expect((await overlay.loadDeltas()).get('2,2')).toEqual(chunk([[3, 5]]));

    await store.clearDeltas();
    expect((await overlay.loadDeltas()).size).toBe(0);
    // The shipped content survives a discard: only the player overlay was cleared.
    expect((await store.loadDeltas()).get('0,0')).toEqual(chunk([[1, 2]]));
  });
});

describe('fetchShippedWorld', () => {
  const SNAPSHOT = {
    meta: META,
    chunks: { '0,0': [[1, 2]], '1,0': [[5, 3, 7]] },
  };

  function fetchOk(body: unknown): typeof fetch {
    return vi.fn(async () => ({ ok: true, status: 200, json: async () => body })) as never;
  }

  it('fetches worlds/<slug>.json under the base URL and parses it', async () => {
    const fetchImpl = fetchOk(SNAPSHOT);
    const world = await fetchShippedWorld('/voxel-realm/', 'test-cove', () => true, fetchImpl);
    expect(fetchImpl).toHaveBeenCalledWith('/voxel-realm/worlds/test-cove.json');
    expect(world.meta.title).toBe('Test Cove');
    expect(world.deltas.get('0,0')).toEqual(chunk([[1, 2]]));
    expect(world.deltas.get('1,0')!.get(5)).toBe(packVoxel(3, 7));
  });

  it('drops entries with block ids the registry does not know', async () => {
    const world = await fetchShippedWorld('/', 's', (id) => id === 2, fetchOk(SNAPSHOT));
    expect(world.deltas.get('0,0')).toEqual(chunk([[1, 2]]));
    expect(world.deltas.has('1,0')).toBe(false);
  });

  it('throws on an HTTP error', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 404 })) as never;
    await expect(fetchShippedWorld('/', 'missing', () => true, fetchImpl)).rejects.toThrow('404');
  });

  it('throws when the snapshot has no meta', async () => {
    await expect(fetchShippedWorld('/', 's', () => true, fetchOk({ chunks: {} }))).rejects.toThrow(
      'no meta',
    );
  });
});
