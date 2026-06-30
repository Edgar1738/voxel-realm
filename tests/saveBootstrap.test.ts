import { describe, it, expect, vi } from 'vitest';
import type { SaveStore } from '../src/persistence/SaveStore';
import { loadBootMeta, initializeBootSave } from '../src/app/saveBootstrap';
import type { WorldMeta } from '../src/persistence/SaveTypes';

const META: WorldMeta = { seed: 1337, version: 1, preset: 'default' };

function store(overrides: Partial<SaveStore> = {}): SaveStore {
  return {
    loadMeta: vi.fn(async () => undefined),
    saveMeta: vi.fn(async () => undefined),
    loadDeltas: vi.fn(async () => new Map()),
    saveChunkDelta: vi.fn(async () => undefined),
    clearDeltas: vi.fn(async () => undefined),
    ...overrides,
  };
}

describe('save bootstrap', () => {
  it('falls back to volatile memory when loading meta fails and never clears the failed store', async () => {
    const failedStore = store({
      loadMeta: vi.fn(async () => {
        throw new Error('network down');
      }),
    });
    const onError = vi.fn();

    const bootMeta = await loadBootMeta(failedStore, onError);
    const bootSave = await initializeBootSave(
      bootMeta,
      META.seed,
      META.version,
      'default',
      onError,
    );

    expect(bootMeta.persistent).toBe(false);
    expect(bootSave.persistent).toBe(false);
    expect(bootSave.store).not.toBe(failedStore);
    expect(failedStore.clearDeltas).not.toHaveBeenCalled();
    expect(failedStore.saveMeta).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalled();
  });

  it('loads deltas when stored meta is compatible', async () => {
    const deltas = new Map([['0,0', new Map([[1, 2]])]]);
    const goodStore = store({
      loadMeta: vi.fn(async () => META),
      loadDeltas: vi.fn(async () => deltas),
    });

    const bootMeta = await loadBootMeta(goodStore);
    const bootSave = await initializeBootSave(bootMeta, META.seed, META.version, 'default');

    expect(bootSave.store).toBe(goodStore);
    expect(bootSave.persistent).toBe(true);
    expect(bootSave.savedDeltas).toBe(deltas);
    expect(goodStore.clearDeltas).not.toHaveBeenCalled();
  });

  it('initializes metadata for a real no-meta world', async () => {
    const newStore = store({ loadMeta: vi.fn(async () => undefined) });

    const bootMeta = await loadBootMeta(newStore);
    const bootSave = await initializeBootSave(bootMeta, META.seed, META.version, 'default');

    expect(bootSave.store).toBe(newStore);
    expect(bootSave.persistent).toBe(true);
    expect(newStore.clearDeltas).toHaveBeenCalledOnce();
    expect(newStore.saveMeta).toHaveBeenCalledWith(META);
  });

  it('falls back to volatile memory when compatible delta loading fails', async () => {
    const failedStore = store({
      loadMeta: vi.fn(async () => META),
      loadDeltas: vi.fn(async () => {
        throw new Error('delta read failed');
      }),
    });
    const onError = vi.fn();

    const bootMeta = await loadBootMeta(failedStore, onError);
    const bootSave = await initializeBootSave(
      bootMeta,
      META.seed,
      META.version,
      'default',
      onError,
    );

    expect(bootSave.persistent).toBe(false);
    expect(bootSave.store).not.toBe(failedStore);
    expect(bootSave.savedDeltas.size).toBe(0);
    expect(bootSave.discardedIncompatible).toBe(false);
    expect(onError).toHaveBeenCalled();
  });

  it('discards an incompatible save, rewrites meta, and reports the discard', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const incompatibleStore = store({ loadMeta: vi.fn(async () => META) });

    const bootMeta = await loadBootMeta(incompatibleStore);
    // Boot with a different seed than the stored META.seed => incompatible reset.
    const bootSave = await initializeBootSave(bootMeta, META.seed + 1, META.version, 'default');

    expect(bootSave.store).toBe(incompatibleStore);
    expect(bootSave.persistent).toBe(true);
    expect(bootSave.discardedIncompatible).toBe(true);
    expect(incompatibleStore.clearDeltas).toHaveBeenCalledOnce();
    expect(incompatibleStore.saveMeta).toHaveBeenCalledWith({
      seed: META.seed + 1,
      version: META.version,
      preset: 'default',
    });
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('does not report a discard for a brand-new (no-meta) world', async () => {
    const newStore = store({ loadMeta: vi.fn(async () => undefined) });

    const bootMeta = await loadBootMeta(newStore);
    const bootSave = await initializeBootSave(bootMeta, META.seed, META.version, 'default');

    expect(bootSave.persistent).toBe(true);
    expect(bootSave.discardedIncompatible).toBe(false);
  });

  it('falls back to volatile (and reports no discard) when a reset write fails', async () => {
    const failedStore = store({
      loadMeta: vi.fn(async () => undefined),
      clearDeltas: vi.fn(async () => {
        throw new Error('disk full');
      }),
    });
    const onError = vi.fn();

    const bootMeta = await loadBootMeta(failedStore, onError);
    const bootSave = await initializeBootSave(
      bootMeta,
      META.seed,
      META.version,
      'default',
      onError,
    );

    expect(bootSave.persistent).toBe(false);
    expect(bootSave.store).not.toBe(failedStore);
    expect(bootSave.discardedIncompatible).toBe(false);
    expect(onError).toHaveBeenCalled();
  });
});
