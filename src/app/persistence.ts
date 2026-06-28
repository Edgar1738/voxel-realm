import type { SaveStore } from '../persistence/SaveStore';
import type { ChunkManager } from '../world/ChunkManager';

const SAVE_DEBOUNCE_MS = 250; // coalesce rapid edits into one write per chunk

export interface Persistence {
  /** Mark a chunk key dirty and schedule a debounced flush. */
  scheduleFlush(key: string): void;
  /**
   * Suppress all future saves, cancel any pending flush, and drain in-flight writes.
   * Used before a world reset so pending writes can't resurrect stale deltas.
   * Returns a promise that resolves once all in-flight saves have settled.
   */
  suppressAndClear(): Promise<void>;
  /** Cancel the pending debounce timer and perform one last best-effort flush. Idempotent. */
  dispose(): void;
}

/**
 * Creates the debounced-flush persistence layer.
 *
 * A key stays dirty until its write is confirmed, so a failed save is retried rather than lost.
 * The `pagehide` listener is registered once here and removed on `dispose()`.
 */
export function createPersistence(store: SaveStore, manager: ChunkManager): Persistence {
  const dirty = new Set<string>();
  const inFlight = new Set<Promise<unknown>>();
  let flushTimer: number | undefined;
  let savesSuppressed = false;

  function flush(): void {
    flushTimer = undefined;
    if (savesSuppressed) {
      dirty.clear();
      return;
    }
    const keys = [...dirty];
    dirty.clear(); // re-added below only for writes that fail, so new edits aren't dropped
    for (const key of keys) {
      const pending = store
        .saveChunkDelta(key, manager.getChunkDelta(key))
        .catch((err) => {
          console.error('Voxel Realm: save failed, will retry', err);
          dirty.add(key);
          scheduleInternal();
        })
        .finally(() => inFlight.delete(pending));
      inFlight.add(pending);
    }
  }

  function scheduleInternal(): void {
    if (flushTimer === undefined) flushTimer = window.setTimeout(flush, SAVE_DEBOUNCE_MS);
  }

  // Best-effort flush of any pending edits when the tab is hidden/closed.
  const onPageHide = (): void => {
    if (flushTimer !== undefined) window.clearTimeout(flushTimer);
    flush();
  };
  window.addEventListener('pagehide', onPageHide, { once: true });

  return {
    scheduleFlush(key: string): void {
      dirty.add(key);
      scheduleInternal();
    },

    suppressAndClear(): Promise<void> {
      savesSuppressed = true;
      if (flushTimer !== undefined) {
        window.clearTimeout(flushTimer);
        flushTimer = undefined;
      }
      dirty.clear();
      return Promise.allSettled([...inFlight]).then(() => undefined);
    },

    dispose(): void {
      window.removeEventListener('pagehide', onPageHide);
      if (flushTimer !== undefined) {
        window.clearTimeout(flushTimer);
        flush();
      }
    },
  };
}
