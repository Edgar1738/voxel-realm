import { describe, it, expect, vi } from 'vitest';
import {
  LocalStorageBlueprintStore,
  ServerBlueprintStore,
  safeBlueprintName,
  type StringStore,
} from '../src/app/BlueprintStore';
import type { Prefab } from '../src/core/Prefab';

const TOWER: Prefab = {
  dims: [1, 2, 1],
  blocks: [
    [0, 0, 0, 3],
    [0, 1, 0, 31, 5],
  ],
};

/** Map-backed Storage stand-in (node has no localStorage). */
function fakeStorage(): StringStore {
  const map = new Map<string, string>();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
    key: (i) => [...map.keys()][i] ?? null,
    get length() {
      return map.size;
    },
  };
}

describe('safeBlueprintName', () => {
  it('mirrors the dev server sanitizer (only [a-z0-9_-] survive)', () => {
    expect(safeBlueprintName('my tower!')).toBe('my_tower_');
    expect(safeBlueprintName('keep-this_1')).toBe('keep-this_1');
  });
});

describe('LocalStorageBlueprintStore', () => {
  it('round-trips save → list → load and removes', async () => {
    const store = new LocalStorageBlueprintStore(fakeStorage());
    await store.save('tower', TOWER);
    await store.save('hut', { dims: [1, 1, 1], blocks: [[0, 0, 0, 1]] });
    expect(await store.list()).toEqual(['hut', 'tower']);
    expect(await store.load('tower')).toEqual(TOWER);
    await store.remove('hut');
    expect(await store.list()).toEqual(['tower']);
  });

  it('sanitizes names so save and load agree', async () => {
    const store = new LocalStorageBlueprintStore(fakeStorage());
    await store.save('my tower!', TOWER);
    expect(await store.load('my tower!')).toEqual(TOWER);
    expect(await store.list()).toEqual(['my_tower_']);
  });

  it('rejects missing and malformed blueprints', async () => {
    const backing = fakeStorage();
    const store = new LocalStorageBlueprintStore(backing);
    await expect(store.load('nope')).rejects.toThrow(/not found/);
    backing.setItem('vr.blueprint.bad', '{"dims":[0,0,0],"blocks":[]}');
    await expect(store.load('bad')).rejects.toThrow(/invalid blueprint/);
    backing.setItem('vr.blueprint.garbage', 'not json');
    await expect(store.load('garbage')).rejects.toThrow(/not valid JSON/);
  });

  it('surfaces a quota failure as a friendly error', async () => {
    const backing = fakeStorage();
    backing.setItem = () => {
      throw new Error('QuotaExceededError');
    };
    const store = new LocalStorageBlueprintStore(backing);
    await expect(store.save('big', TOWER)).rejects.toThrow(/storage full/);
  });

  it('ignores unrelated localStorage keys when listing', async () => {
    const backing = fakeStorage();
    backing.setItem('vr.headlamp', 'on');
    const store = new LocalStorageBlueprintStore(backing);
    await store.save('tower', TOWER);
    expect(await store.list()).toEqual(['tower']);
  });
});

describe('ServerBlueprintStore', () => {
  const okJson = (value: unknown): Response => new Response(JSON.stringify(value), { status: 200 });

  it('lists names from the dev endpoint (tolerating junk entries)', async () => {
    const fetchFn = vi.fn().mockResolvedValue(okJson({ blueprints: ['a', 'b', 42] }));
    const store = new ServerBlueprintStore(fetchFn as unknown as typeof fetch);
    expect(await store.list()).toEqual(['a', 'b']);
    expect(fetchFn).toHaveBeenCalledWith('/__blueprint?list');
  });

  it('loads and validates; posts saves with the sanitized name; deletes', async () => {
    const fetchFn = vi.fn().mockResolvedValue(okJson(TOWER));
    const store = new ServerBlueprintStore(fetchFn as unknown as typeof fetch);
    expect(await store.load('tower')).toEqual(TOWER);

    await store.save('my tower!', TOWER);
    const [url, init] = fetchFn.mock.calls[1] as [string, RequestInit];
    expect(url).toBe('/__blueprint');
    expect(JSON.parse(String(init.body))).toEqual({ name: 'my_tower_', blueprint: TOWER });

    await store.remove('tower');
    expect(fetchFn.mock.calls[2][0]).toBe('/__blueprint?name=tower');
    expect((fetchFn.mock.calls[2][1] as RequestInit).method).toBe('DELETE');
  });

  it('rejects on HTTP errors and invalid payloads', async () => {
    const notFound = vi.fn().mockResolvedValue(new Response('nope', { status: 404 }));
    await expect(
      new ServerBlueprintStore(notFound as unknown as typeof fetch).load('x'),
    ).rejects.toThrow(/not found/);
    const invalid = vi.fn().mockResolvedValue(okJson({ dims: [1], blocks: [] }));
    await expect(
      new ServerBlueprintStore(invalid as unknown as typeof fetch).load('x'),
    ).rejects.toThrow(/invalid blueprint/);
  });
});
