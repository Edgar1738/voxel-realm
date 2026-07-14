import type { SaveStore } from '../persistence/SaveStore';
import type { ChunkManager } from '../world/ChunkManager';

const SAVE_DEBOUNCE_MS = 250; // coalesce rapid edits into one write per chunk

/**
 * The player-visible save lifecycle:
 * - `pending`: edits are dirty and a debounced flush is scheduled but not yet writing.
 * - `saving`: a write is actually in flight.
 * - `idle`: every dirty key has been written and confirmed (the "Saved" moment).
 * - `error`: a write failed; the key was re-dirtied and a retry is scheduled.
 */
export type SaveStatus = 'idle' | 'pending' | 'saving' | 'error';

export interface PersistenceOptions {
  /** Notified on every save-status transition (deduped). Drives a quiet builder indicator. */
  onStatus?: (status: SaveStatus) => void;
}

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
export function createPersistence(
  store: SaveStore,
  manager: ChunkManager,
  options: PersistenceOptions = {},
): Persistence {
  const dirty = new Set<string>();
  const inFlight = new Set<Promise<unknown>>();
  let flushTimer: number | undefined;
  let savesSuppressed = false;

  let status: SaveStatus = 'idle';
  // True once a write in the current cycle failed; keeps `settle` from flashing `idle`/`Saved`
  // before the scheduled retry runs, and is reset at the start of each fresh saving cycle.
  let cycleErrored = false;
  function setStatus(next: SaveStatus): void {
    if (next === status) return;
    status = next;
    options.onStatus?.(next);
  }

  /** After any in-flight write settles, resolve the resting status once nothing is left writing. */
  function settle(): void {
    if (savesSuppressed || inFlight.size > 0) return;
    if (cycleErrored) setStatus('error');
    else if (dirty.size > 0) setStatus('pending'); // new edits arrived mid-write
    else setStatus('idle');
  }

  function flush(): void {
    flushTimer = undefined;
    if (savesSuppressed) {
      dirty.clear();
      return;
    }
    const keys = [...dirty];
    if (keys.length === 0) return; // nothing to write — never report a "save" for an empty flush
    dirty.clear(); // re-added below only for writes that fail, so new edits aren't dropped
    cycleErrored = false;
    setStatus('saving');
    for (const key of keys) {
      const pending = store
        .saveChunkDelta(key, manager.getChunkDelta(key))
        .catch((err) => {
          console.error('Voxel Realm: save failed, will retry', err);
          cycleErrored = true;
          dirty.add(key);
          scheduleInternal();
        })
        .finally(() => {
          inFlight.delete(pending);
          settle();
        });
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
      if (savesSuppressed) return; // reset in progress — don't queue, schedule, or signal a save
      dirty.add(key);
      scheduleInternal();
      if (status !== 'saving') setStatus('pending');
    },

    suppressAndClear(): Promise<void> {
      savesSuppressed = true;
      if (flushTimer !== undefined) {
        window.clearTimeout(flushTimer);
        flushTimer = undefined;
      }
      dirty.clear();
      // Deliberately no status emit: a reset must not flash "Saved".
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
