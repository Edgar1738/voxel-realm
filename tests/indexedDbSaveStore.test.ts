import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { describe, it, expect, beforeEach } from 'vitest';
import { IndexedDbSaveStore } from '../src/persistence/IndexedDbSaveStore';
import { STONE } from '../src/blocks/blocks';

const DB_NAME = 'voxel-realm';

/** Recreates the old v1 build's database: version 1 with a 'meta' + legacy 'deltas' store. */
function seedLegacyV1Db(): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      db.createObjectStore('meta');
      db.createObjectStore('deltas');
    };
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction('meta', 'readwrite');
      tx.objectStore('meta').put({ seed: 1337, version: 1 }, 'world');
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    };
    req.onerror = () => reject(req.error);
  });
}

describe('IndexedDbSaveStore v1->v2 migration', () => {
  beforeEach(() => {
    // Fresh in-memory IndexedDB per test so an open connection can't block the next one.
    globalThis.indexedDB = new IDBFactory() as unknown as IDBFactory;
  });

  it('upgrades a legacy v1 database so loadDeltas resolves instead of breaking boot', async () => {
    await seedLegacyV1Db();

    const store = new IndexedDbSaveStore();
    // Without the version bump this would throw NotFoundError on the missing 'chunks' store.
    await expect(store.loadDeltas()).resolves.toEqual(new Map());
    // Meta written by the v1 build survives the upgrade.
    expect(await store.loadMeta()).toEqual({ seed: 1337, version: 1 });
  });

  it('round-trips a chunk delta after upgrading from v1', async () => {
    await seedLegacyV1Db();

    const store = new IndexedDbSaveStore();
    await store.saveChunkDelta('0,0', [[5, STONE]]);

    const deltas = await store.loadDeltas();
    expect(deltas.get('0,0')).toEqual(new Map([[5, STONE]]));
  });
});

describe('IndexedDbSaveStore named databases', () => {
  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory() as unknown as IDBFactory;
  });

  it('isolates worlds: different db names never share meta or deltas', async () => {
    const a = new IndexedDbSaveStore('voxel-realm:save:castle');
    const b = new IndexedDbSaveStore('voxel-realm:save:town');
    await a.saveMeta({ seed: 1, version: 1, preset: 'flat' });
    await a.saveChunkDelta('0,0', [[5, STONE]]);

    expect(await b.loadMeta()).toBeUndefined();
    expect(await b.loadDeltas()).toEqual(new Map());
    expect((await a.loadDeltas()).get('0,0')).toEqual(new Map([[5, STONE]]));
  });

  it('defaults to the legacy database so pre-multi-world saves keep loading', async () => {
    await seedLegacyV1Db();
    const store = new IndexedDbSaveStore(); // no name → DB_NAME 'voxel-realm'
    expect(await store.loadMeta()).toEqual({ seed: 1337, version: 1 });
  });
});
