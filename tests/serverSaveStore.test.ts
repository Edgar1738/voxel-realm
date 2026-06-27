// tests/serverSaveStore.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ServerSaveStore } from '../src/persistence/ServerSaveStore';

const ok = (json: unknown): Response =>
  ({ ok: true, json: async () => json }) as unknown as Response;

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
});
