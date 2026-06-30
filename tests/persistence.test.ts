import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { SaveStore } from '../src/persistence/SaveStore';
import type { ChunkManager } from '../src/world/ChunkManager';
import { createPersistence } from '../src/app/persistence';

const SAVE_DEBOUNCE_MS = 250;

// createPersistence calls window.setTimeout / clearTimeout / add+removeEventListener.
// The test environment is 'node' (no window), so we stub a minimal window that routes
// timers to the global functions vi.useFakeTimers() controls, and captures listeners.
type Listener = (ev?: unknown) => void;

interface FakeWindow {
  setTimeout: typeof setTimeout;
  clearTimeout: typeof clearTimeout;
  addEventListener: (type: string, fn: Listener, opts?: unknown) => void;
  removeEventListener: (type: string, fn: Listener) => void;
}

let listeners: Map<string, Set<Listener>>;

function installFakeWindow(): void {
  listeners = new Map();
  const fakeWindow: FakeWindow = {
    setTimeout: ((fn: () => void, ms?: number) => setTimeout(fn, ms)) as typeof setTimeout,
    clearTimeout: ((id: number) => clearTimeout(id)) as typeof clearTimeout,
    addEventListener: (type, fn) => {
      const set = listeners.get(type) ?? new Set<Listener>();
      set.add(fn);
      listeners.set(type, set);
    },
    removeEventListener: (type, fn) => {
      listeners.get(type)?.delete(fn);
    },
  };
  vi.stubGlobal('window', fakeWindow);
}

function fire(type: string): void {
  for (const fn of listeners.get(type) ?? []) fn();
}

function hasListener(type: string): boolean {
  return (listeners.get(type)?.size ?? 0) > 0;
}

// Minimal mock SaveStore: only saveChunkDelta is exercised by createPersistence.
function makeStore(
  saveChunkDelta: SaveStore['saveChunkDelta'] = vi.fn(async () => undefined),
): SaveStore {
  return {
    loadMeta: vi.fn(async () => undefined),
    saveMeta: vi.fn(async () => undefined),
    loadDeltas: vi.fn(async () => new Map()),
    saveChunkDelta,
    clearDeltas: vi.fn(async () => undefined),
  };
}

// createPersistence only calls manager.getChunkDelta(key).
function makeManager(): ChunkManager {
  return {
    getChunkDelta: vi.fn((key: string) => [[Number(key.split(',')[0]) || 0, 5]]),
  } as unknown as ChunkManager;
}

beforeEach(() => {
  vi.useFakeTimers();
  installFakeWindow();
});

afterEach(() => {
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('createPersistence', () => {
  it('coalesces repeated scheduleFlush for the same key into a single write', async () => {
    const save = vi.fn(async () => undefined);
    const store = makeStore(save);
    const manager = makeManager();
    const persistence = createPersistence(store, manager);

    persistence.scheduleFlush('0,0');
    persistence.scheduleFlush('0,0');
    persistence.scheduleFlush('0,0');

    expect(save).not.toHaveBeenCalled(); // debounced, nothing yet

    await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS);

    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith('0,0', [[0, 5]]);
  });

  it('writes each distinct dirty key once when the debounce fires', async () => {
    const save = vi.fn(async (_key: string) => undefined);
    const persistence = createPersistence(makeStore(save), makeManager());

    persistence.scheduleFlush('0,0');
    persistence.scheduleFlush('1,0');
    persistence.scheduleFlush('0,0'); // duplicate of first

    await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS);

    expect(save).toHaveBeenCalledTimes(2);
    const savedKeys = save.mock.calls.map((c) => c[0]).sort();
    expect(savedKeys).toEqual(['0,0', '1,0']);
  });

  it('re-adds a failed key to the dirty set and retries it on a later flush', async () => {
    let attempts = 0;
    const save = vi.fn(async (_key: string) => {
      attempts += 1;
      if (attempts === 1) throw new Error('disk full'); // first write rejects
      return undefined;
    });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const persistence = createPersistence(makeStore(save), makeManager());

    persistence.scheduleFlush('0,0');

    // First flush: write attempt rejects; the rejection is caught (no unhandled throw).
    await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS);
    expect(save).toHaveBeenCalledTimes(1);

    // The catch handler re-marks the key dirty and reschedules. Drain the retry timer.
    await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS);

    expect(save).toHaveBeenCalledTimes(2);
    expect(save.mock.calls[1][0]).toBe('0,0'); // retried the same key
  });

  it('suppressAndClear drains in-flight writes and blocks a post-clear flush', async () => {
    let resolveWrite: (() => void) | undefined;
    let settled = false;
    const save = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveWrite = () => {
            settled = true;
            resolve();
          };
        }),
    );
    const persistence = createPersistence(makeStore(save), makeManager());

    // One in-flight write started by the debounce.
    persistence.scheduleFlush('0,0');
    await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS);
    expect(save).toHaveBeenCalledTimes(1);

    // Begin suppression; it must await the in-flight write before resolving.
    const cleared = persistence.suppressAndClear();
    let resolvedEarly = false;
    void cleared.then(() => {
      resolvedEarly = true;
    });

    await Promise.resolve();
    expect(resolvedEarly).toBe(false); // still waiting on the in-flight write
    expect(settled).toBe(false);

    resolveWrite?.(); // let the in-flight write settle
    await cleared; // suppressAndClear resolves only after the write drained
    expect(settled).toBe(true);

    // A post-clear flush trigger (e.g. pagehide) must NOT write previously-dirty chunks.
    persistence.scheduleFlush('9,9'); // new dirt arriving after suppression
    fire('pagehide');
    await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS);

    expect(save).toHaveBeenCalledTimes(1); // no further writes after suppression
  });

  it('dispose flushes pending dirty chunks and removes the pagehide listener', async () => {
    const save = vi.fn(async () => undefined);
    const persistence = createPersistence(makeStore(save), makeManager());

    expect(hasListener('pagehide')).toBe(true);

    persistence.scheduleFlush('2,0'); // pending, debounce not yet elapsed
    expect(save).not.toHaveBeenCalled();

    persistence.dispose(); // cancels the timer and flushes synchronously

    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith('2,0', [[2, 5]]);
    expect(hasListener('pagehide')).toBe(false);
  });

  it('dispose is idempotent and does not double-write when nothing is pending', async () => {
    const save = vi.fn(async () => undefined);
    const persistence = createPersistence(makeStore(save), makeManager());

    persistence.scheduleFlush('0,0');
    await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS);
    expect(save).toHaveBeenCalledTimes(1);

    persistence.dispose();
    persistence.dispose();
    expect(save).toHaveBeenCalledTimes(1); // nothing pending -> no extra writes
  });
});
