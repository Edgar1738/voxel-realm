// tests/serverWorldCatalog.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { listWorlds, copyWorld, deleteWorld } from '../src/persistence/ServerWorldCatalog';

const ok = (json: unknown): Response =>
  ({ ok: true, json: async () => json }) as unknown as Response;

beforeEach(() => vi.restoreAllMocks());

describe('ServerWorldCatalog', () => {
  it('listWorlds returns the worlds array', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ok({ worlds: ['a', 'b'] })),
    );
    expect(await listWorlds()).toEqual(['a', 'b']);
  });

  it('copyWorld posts name + copyTo', async () => {
    const fetchMock = vi.fn(async () => ok({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);
    await copyWorld('a', 'b');
    const calls = fetchMock.mock.calls as unknown as [string, RequestInit][];
    const [url, init] = calls[0];
    expect(url).toContain('name=a');
    expect(url).toContain('copyTo=b');
    expect(init.method).toBe('POST');
  });

  it('deleteWorld issues a DELETE', async () => {
    const fetchMock = vi.fn(async () => ok({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);
    await deleteWorld('a');
    const calls = fetchMock.mock.calls as unknown as [string, RequestInit][];
    expect(calls[0][1].method).toBe('DELETE');
  });
});
