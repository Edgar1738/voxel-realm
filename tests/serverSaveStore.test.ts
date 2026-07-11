// tests/serverSaveStore.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ServerSaveStore } from '../src/persistence/ServerSaveStore';

const ok = (json: unknown): Response =>
  ({ ok: true, json: async () => json }) as unknown as Response;

const notOk = (status = 500): Response =>
  ({
    ok: false,
    status,
    statusText: 'Server Error',
    json: async () => ({}),
  }) as unknown as Response;

const isValidBlockId = (id: number): boolean => id >= 0 && id <= 13;

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('ServerSaveStore', () => {
  it('loadDeltas fetches the named world and validates entries', async () => {
    const fetchMock = vi.fn(async () =>
      ok({ meta: { seed: 1, version: 1 }, chunks: { '0,0': [[5, 13]], '1,0': [[0, 999]] } }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const store = new ServerSaveStore('settlement', isValidBlockId);
    const deltas = await store.loadDeltas();

    const calls = fetchMock.mock.calls as unknown as [string, RequestInit][];
    expect(calls[0][0]).toContain('/__world?name=settlement');
    expect(deltas.get('0,0')).toEqual(new Map([[5, 13]]));
    expect(deltas.has('1,0')).toBe(false); // unknown block id dropped
  });

  it('loadDeltas warns with the world name and count when entries are dropped', async () => {
    const fetchMock = vi.fn(async () =>
      ok({ meta: { seed: 1, version: 1 }, chunks: { '0,0': [[5, 13]], '1,0': [[0, 999]] } }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const store = new ServerSaveStore('settlement', isValidBlockId);
    await store.loadDeltas();

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('settlement'));
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('1'));
  });

  it('loadDeltas does not warn when nothing is dropped', async () => {
    const fetchMock = vi.fn(async () => ok({ meta: { seed: 1, version: 1 }, chunks: {} }));
    vi.stubGlobal('fetch', fetchMock);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const store = new ServerSaveStore('clean-world', isValidBlockId);
    await store.loadDeltas();

    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('boot sequence (loadMeta then loadDeltas) fetches the snapshot once', async () => {
    const fetchMock = vi.fn(async () =>
      ok({ meta: { seed: 1, version: 1 }, chunks: { '0,0': [[5, 13]] } }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const store = new ServerSaveStore('big-world', isValidBlockId);
    const meta = await store.loadMeta();
    const deltas = await store.loadDeltas();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(meta).toEqual({ seed: 1, version: 1 });
    expect(deltas.get('0,0')).toEqual(new Map([[5, 13]]));
  });

  it('a second loadDeltas re-fetches (the consumed snapshot is not reused)', async () => {
    const fetchMock = vi.fn(async () => ok({ meta: { seed: 1, version: 1 }, chunks: {} }));
    vi.stubGlobal('fetch', fetchMock);

    const store = new ServerSaveStore('w', isValidBlockId);
    await store.loadDeltas();
    await store.loadDeltas();

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('a failed snapshot fetch is not cached: the next load retries', async () => {
    const fetchMock = vi
      .fn(async () => ok({ meta: { seed: 1, version: 1 }, chunks: {} }))
      .mockRejectedValueOnce(new Error('network blip'));
    vi.stubGlobal('fetch', fetchMock);

    const store = new ServerSaveStore('w', isValidBlockId);
    await expect(store.loadMeta()).rejects.toThrow('network blip');
    expect(await store.loadMeta()).toEqual({ seed: 1, version: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('saveChunkDelta POSTs entries to the chunk URL', async () => {
    const fetchMock = vi.fn(async () => ok({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    const store = new ServerSaveStore('settlement', isValidBlockId);
    await store.saveChunkDelta('2,3', [[7, 5]]);

    const calls = fetchMock.mock.calls as unknown as [string, RequestInit][];
    const [url, init] = calls[0];
    expect(url).toContain('name=settlement');
    expect(url).toContain('chunk=2%2C3');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ entries: [[7, 5]] });
  });

  it('saveChunkDelta rejects on a non-OK response so the caller keeps the edit dirty', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => notOk(500)),
    );
    const store = new ServerSaveStore('x', isValidBlockId);
    await expect(store.saveChunkDelta('0,0', [[1, 2]])).rejects.toThrow(/world save failed/);
  });

  it('saveChunkDelta rejects when fetch throws (network error)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network down');
      }),
    );
    const store = new ServerSaveStore('x', isValidBlockId);
    await expect(store.saveChunkDelta('0,0', [[1, 2]])).rejects.toThrow('network down');
  });

  it('loadDeltas rejects when the fetch fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network');
      }),
    );
    const store = new ServerSaveStore('x', isValidBlockId);
    await expect(store.loadDeltas()).rejects.toThrow('network');
  });

  it('loadMeta rejects on a non-OK response so boot can avoid clearing persisted data', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => notOk(503)),
    );
    const store = new ServerSaveStore('x', isValidBlockId);
    await expect(store.loadMeta()).rejects.toThrow(/world load failed/);
  });

  it('loadMeta rejects when fetch throws so boot can switch to volatile storage', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network down');
      }),
    );
    const store = new ServerSaveStore('x', isValidBlockId);
    await expect(store.loadMeta()).rejects.toThrow('network down');
  });

  it('bodied saves avoid keepalive so large chunk deltas are not capped at 64KiB', async () => {
    const calls: RequestInit[] = [];
    const fake = (async (_u: string, init: RequestInit) => {
      calls.push(init);
      return { ok: true, json: async () => ({}) };
    }) as unknown as typeof fetch;
    vi.stubGlobal('fetch', fake);
    const store = new ServerSaveStore('w', () => true);
    await store.saveChunkDelta('0,0', [[0, 1]]);
    expect(calls[0].keepalive).toBeUndefined();
    vi.unstubAllGlobals();
  });

  it('bodiless posts keep keepalive so unload-time clears are honored', async () => {
    const calls: RequestInit[] = [];
    const fake = (async (_u: string, init: RequestInit) => {
      calls.push(init);
      return { ok: true, json: async () => ({}) };
    }) as unknown as typeof fetch;
    vi.stubGlobal('fetch', fake);
    const store = new ServerSaveStore('w', () => true);
    await store.clearDeltas();
    expect(calls[0].keepalive).toBe(true);
    vi.unstubAllGlobals();
  });
});
