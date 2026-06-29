import type { SaveStore } from './SaveStore';
import { packVoxel } from './SaveTypes';
import type { ChunkDeltaEntries, WorldDeltas, WorldMeta } from './SaveTypes';

const DB_NAME = 'voxel-realm';
// v2 replaced the v1 per-voxel 'deltas' store with the per-chunk 'chunks' store. Bumping the
// version ensures onupgradeneeded fires for returning players so the new store exists.
const DB_VERSION = 2;
const LEGACY_DELTA_STORE = 'deltas';
const META_STORE = 'meta';
const CHUNK_STORE = 'chunks';
const META_KEY = 'world';

interface ChunkRecord {
  chunkKey: string;
  entries: Array<[number, number] | [number, number, number]>;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      // Drop the incompatible v1 delta store (its per-voxel format can't be migrated cleanly).
      if (db.objectStoreNames.contains(LEGACY_DELTA_STORE))
        db.deleteObjectStore(LEGACY_DELTA_STORE);
      if (!db.objectStoreNames.contains(META_STORE)) db.createObjectStore(META_STORE);
      if (!db.objectStoreNames.contains(CHUNK_STORE))
        db.createObjectStore(CHUNK_STORE, { keyPath: 'chunkKey' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbRequest<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** IndexedDB-backed durable save. Each chunk's delta is one row keyed by chunkKey. */
export class IndexedDbSaveStore implements SaveStore {
  private readonly dbPromise: Promise<IDBDatabase> = openDb();

  async loadMeta(): Promise<WorldMeta | undefined> {
    const db = await this.dbPromise;
    const store = db.transaction(META_STORE, 'readonly').objectStore(META_STORE);
    return idbRequest<WorldMeta | undefined>(store.get(META_KEY));
  }

  async saveMeta(meta: WorldMeta): Promise<void> {
    const db = await this.dbPromise;
    const store = db.transaction(META_STORE, 'readwrite').objectStore(META_STORE);
    await idbRequest<IDBValidKey>(store.put(meta, META_KEY));
  }

  async loadDeltas(): Promise<WorldDeltas> {
    const db = await this.dbPromise;
    const store = db.transaction(CHUNK_STORE, 'readonly').objectStore(CHUNK_STORE);
    const records = await idbRequest<ChunkRecord[]>(store.getAll());
    const out: WorldDeltas = new Map();
    for (const record of records) {
      out.set(
        record.chunkKey,
        new Map(record.entries.map((e) => [e[0], packVoxel(e[1], e[2] ?? 0)])),
      );
    }
    return out;
  }

  async saveChunkDelta(chunkKey: string, entries: ChunkDeltaEntries): Promise<void> {
    const db = await this.dbPromise;
    const store = db.transaction(CHUNK_STORE, 'readwrite').objectStore(CHUNK_STORE);
    if (entries.length === 0) {
      await idbRequest<undefined>(store.delete(chunkKey));
    } else {
      const record: ChunkRecord = { chunkKey, entries: [...entries] };
      await idbRequest<IDBValidKey>(store.put(record));
    }
  }

  async clearDeltas(): Promise<void> {
    const db = await this.dbPromise;
    const store = db.transaction(CHUNK_STORE, 'readwrite').objectStore(CHUNK_STORE);
    await idbRequest<undefined>(store.clear());
  }
}
