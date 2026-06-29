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

  it('loadDeltas degrades to empty when the fetch fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network');
      }),
    );
    const store = new ServerSaveStore('x', isValidBlockId);
    await expect(store.loadDeltas()).resolves.toEqual(new Map());
  });

  it('server saves use keepalive so unload writes are honored', async () => {
    const calls: RequestInit[] = [];
    const fake = (async (_u: string, init: RequestInit) => {
      calls.push(init);
      return { ok: true, json: async () => ({}) };
    }) as unknown as typeof fetch;
    vi.stubGlobal('fetch', fake);
    const store = new ServerSaveStore('w', () => true);
    await store.saveChunkDelta('0,0', [[0, 1]]);
    expect(calls[0].keepalive).toBe(true);
    vi.unstubAllGlobals();
  });
});
