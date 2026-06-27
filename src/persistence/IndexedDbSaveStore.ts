import type { BlockId } from '../core/types';
import type { SaveStore } from './SaveStore';
import type { WorldMeta, SerializedDeltas, ChunkDeltaRecord } from './SaveTypes';

const DB_NAME = 'voxel-realm';
const DB_VERSION = 1;
const META_STORE = 'meta';
const DELTA_STORE = 'deltas';
const META_KEY = 'world';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(META_STORE)) db.createObjectStore(META_STORE);
      if (!db.objectStoreNames.contains(DELTA_STORE)) db.createObjectStore(DELTA_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(
  db: IDBDatabase,
  store: string,
  mode: IDBTransactionMode,
  run: (s: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const request = run(db.transaction(store, mode).objectStore(store));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** IndexedDB-backed durable save. Each chunk's delta record is one row keyed by chunk key. */
export class IndexedDbSaveStore implements SaveStore {
  private readonly dbPromise = open();

  async loadMeta(): Promise<WorldMeta | undefined> {
    const db = await this.dbPromise;
    return tx<WorldMeta | undefined>(db, META_STORE, 'readonly', (s) => s.get(META_KEY));
  }

  async saveMeta(meta: WorldMeta): Promise<void> {
    const db = await this.dbPromise;
    await tx(db, META_STORE, 'readwrite', (s) => s.put(meta, META_KEY));
  }

  async loadDeltas(): Promise<SerializedDeltas> {
    const db = await this.dbPromise;
    const keys = await tx<IDBValidKey[]>(db, DELTA_STORE, 'readonly', (s) => s.getAllKeys());
    const values = await tx<ChunkDeltaRecord[]>(db, DELTA_STORE, 'readonly', (s) => s.getAll());
    const out: SerializedDeltas = {};
    keys.forEach((k, i) => {
      out[String(k)] = values[i];
    });
    return out;
  }

  async putVoxel(chunkKey: string, voxelIndex: number, blockId: BlockId): Promise<void> {
    const db = await this.dbPromise;
    const existing =
      (await tx<ChunkDeltaRecord | undefined>(db, DELTA_STORE, 'readonly', (s) =>
        s.get(chunkKey),
      )) ?? {};
    existing[voxelIndex] = blockId;
    await tx(db, DELTA_STORE, 'readwrite', (s) => s.put(existing, chunkKey));
  }

  async clearDeltas(): Promise<void> {
    const db = await this.dbPromise;
    await tx(db, DELTA_STORE, 'readwrite', (s) => s.clear());
  }
}
