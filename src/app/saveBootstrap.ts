import { MemorySaveStore, type SaveStore } from '../persistence/SaveStore';
import { resolveSaveAction } from '../persistence/SaveGuard';
import type { WorldDeltas, WorldMeta } from '../persistence/SaveTypes';

export interface BootMetaState {
  store: SaveStore;
  meta: WorldMeta | undefined;
  persistent: boolean;
}

export interface BootSaveState {
  store: SaveStore;
  savedDeltas: WorldDeltas;
  persistent: boolean;
  /** True only when an *incompatible* save was actually discarded on the durable store at boot. */
  discardedIncompatible: boolean;
}

type ErrorLogger = (message: string, err: unknown) => void;

const defaultLogger: ErrorLogger = (message, err) => console.error(message, err);

/** Load save metadata, falling back to a volatile in-memory store if durable storage fails. */
export async function loadBootMeta(
  store: SaveStore,
  onError: ErrorLogger = defaultLogger,
): Promise<BootMetaState> {
  try {
    return { store, meta: await store.loadMeta(), persistent: true };
  } catch (err) {
    onError('Voxel Realm: could not load save metadata; using volatile in-memory storage.', err);
    return { store: new MemorySaveStore(), meta: undefined, persistent: false };
  }
}

/**
 * Prepare saved deltas for boot. Durable storage failures fail closed into a volatile store so
 * the game can keep running without clearing or overwriting the original persisted world.
 */
export async function initializeBootSave(
  boot: BootMetaState,
  seed: number,
  version: number,
  preset: string,
  onError: ErrorLogger = defaultLogger,
  initialMeta?: WorldMeta,
): Promise<BootSaveState> {
  if (!boot.persistent) {
    return {
      store: boot.store,
      savedDeltas: new Map(),
      persistent: false,
      discardedIncompatible: false,
    };
  }

  const action = resolveSaveAction(boot.meta, seed, version, preset);
  if (action.kind === 'load') {
    try {
      return {
        store: boot.store,
        savedDeltas: await boot.store.loadDeltas(),
        persistent: true,
        discardedIncompatible: false,
      };
    } catch (err) {
      onError('Voxel Realm: could not load saved edits; using volatile in-memory storage.', err);
      return {
        store: new MemorySaveStore(),
        savedDeltas: new Map(),
        persistent: false,
        discardedIncompatible: false,
      };
    }
  }

  const incompatible = action.reason === 'incompatible';
  if (incompatible) {
    console.warn('Voxel Realm: incompatible save - discarding stored edits.');
  }

  try {
    await boot.store.clearDeltas();
    await boot.store.saveMeta(initialMeta ?? { seed, version, preset });
    return {
      store: boot.store,
      savedDeltas: new Map(),
      persistent: true,
      discardedIncompatible: incompatible,
    };
  } catch (err) {
    onError(
      'Voxel Realm: could not initialise save metadata; using volatile in-memory storage.',
      err,
    );
    return {
      store: new MemorySaveStore(),
      savedDeltas: new Map(),
      persistent: false,
      discardedIncompatible: false,
    };
  }
}
