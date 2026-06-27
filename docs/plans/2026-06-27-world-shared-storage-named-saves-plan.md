# World Shared Storage + Named Saves Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move dev world persistence from per-profile IndexedDB to a dev-server-owned disk store keyed by world name, so agent builds and Edgar's sessions share worlds and multiple named worlds can coexist.

**Architecture:** A pure snapshot/validation core serializes `{meta, chunks}` to JSON. A `/__world` Vite dev endpoint reads/writes `.saves/<name>.json` via a pure `worldDiskStore`. A `ServerSaveStore` implements the existing `SaveStore` interface over that endpoint and is selected at boot in dev (production keeps `IndexedDbSaveStore`). The world name comes from a `?save=` URL param. A `__vr.world` API and a small HUD menu manage named worlds.

**Tech Stack:** TypeScript, Vite 8 (dev middleware), Vitest 4 (node env), Three.js (existing render). No new runtime dependencies.

**Design doc:** `docs/plans/2026-06-27-world-shared-storage-named-saves-design.md`

---

## File Structure

**Create:**
- `src/persistence/WorldSnapshot.ts` — pure serialize/parse/validate + snapshot↔deltas.
- `src/persistence/worldName.ts` — `worldNameFromSearch(search)` URL→world-name helper.
- `src/persistence/ServerSaveStore.ts` — `SaveStore` over `/__world` (drop-in for the IndexedDB store).
- `src/persistence/ServerWorldCatalog.ts` — `listWorlds`/`copyWorld`/`deleteWorld` client helpers.
- `server/worldDiskStore.ts` — pure Node disk read/write/list/copy/delete (injectable root).
- `tests/worldSnapshot.test.ts`, `tests/worldName.test.ts`, `tests/worldDiskStore.test.ts`,
  `tests/serverSaveStore.test.ts`, `tests/serverWorldCatalog.test.ts`.

**Modify:**
- `src/blocks/BlockRegistry.ts` — add `has(id)` for validation.
- `vite.config.ts` — add `/__world` middleware to the existing `devDisk()` plugin.
- `src/app/Game.ts` — select store by env, read `?save=`, thread world name.
- `src/app/DevControls.ts` — add `__vr.world` namespace.
- `src/app/CreativeUi.ts` — add a minimal world menu to the dock.
- `docs/plans/.../Suggested Improvements` mirror — mark backlog items done (in vault; optional).

---

## Task 1: Snapshot core (serialize / validate / convert)

**Files:**
- Create: `src/persistence/WorldSnapshot.ts`
- Test: `tests/worldSnapshot.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/worldSnapshot.test.ts
import { describe, it, expect } from 'vitest';
import {
  serializeWorldSnapshot,
  parseWorldSnapshot,
  snapshotToDeltas,
} from '../src/persistence/WorldSnapshot';
import { CHUNK_VOLUME } from '../src/core/constants';
import type { WorldDeltas } from '../src/persistence/SaveTypes';

const isValidBlockId = (id: number): boolean => id >= 0 && id <= 13;

describe('WorldSnapshot', () => {
  it('round-trips meta + deltas through serialize/parse/snapshotToDeltas', () => {
    const deltas: WorldDeltas = new Map([
      ['0,0', new Map([[2, 5], [1, 13]])],
      ['-1,2', new Map([[10, 3]])],
    ]);
    const snap = serializeWorldSnapshot({ seed: 1337, version: 1, preset: 'default' }, deltas);
    // entries are sorted by voxel index for stable diffs
    expect(snap.chunks['0,0']).toEqual([[1, 13], [2, 5]]);

    const json = JSON.parse(JSON.stringify(snap));
    const { snapshot, dropped } = parseWorldSnapshot(json, { isValidBlockId });
    expect(dropped).toBe(0);
    expect(snapshot.meta).toEqual({ seed: 1337, version: 1, preset: 'default' });
    expect(snapshotToDeltas(snapshot).get('0,0')).toEqual(new Map([[1, 13], [2, 5]]));
  });

  it('drops malformed entries: bad key, out-of-range index, unknown block id, bad shape', () => {
    const { snapshot, dropped } = parseWorldSnapshot(
      {
        meta: { seed: 1, version: 1 },
        chunks: {
          'good': [[0, 5]], // bad key (not "cx,cz")
          '0,0': [
            [5, 5], // ok
            [CHUNK_VOLUME, 5], // index out of range
            [-1, 5], // negative index
            [10, 999], // unknown block id
            [1], // wrong tuple length
            'nope', // not an array
          ],
        },
      },
      { isValidBlockId },
    );
    expect(snapshot.chunks['good']).toBeUndefined();
    expect(snapshot.chunks['0,0']).toEqual([[5, 5]]);
    expect(dropped).toBe(6); // 1 bad key + 5 bad entries
  });

  it('returns empty chunks and undefined meta for junk input', () => {
    const { snapshot, dropped } = parseWorldSnapshot(null, { isValidBlockId });
    expect(snapshot.chunks).toEqual({});
    expect(snapshot.meta).toBeUndefined();
    expect(dropped).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/worldSnapshot.test.ts`
Expected: FAIL — cannot resolve `../src/persistence/WorldSnapshot`.

- [ ] **Step 3: Write the implementation**

```ts
// src/persistence/WorldSnapshot.ts
import type { BlockId } from '../core/types';
import { CHUNK_VOLUME } from '../core/constants';
import type { WorldDeltas, WorldMeta } from './SaveTypes';

/** A portable, JSON-safe world: optional meta + per-chunk [voxelIndex, blockId] entries. */
export interface WorldSnapshot {
  meta?: WorldMeta;
  chunks: Record<string, Array<[number, BlockId]>>;
}

export interface ParseResult {
  snapshot: WorldSnapshot;
  /** How many malformed chunk keys/entries were skipped (for a warning). */
  dropped: number;
}

const CHUNK_KEY = /^-?\d+,-?\d+$/;

export function serializeWorldSnapshot(
  meta: WorldMeta | undefined,
  deltas: WorldDeltas,
): WorldSnapshot {
  const chunks: Record<string, Array<[number, BlockId]>> = {};
  for (const [key, map] of deltas) {
    chunks[key] = [...map.entries()].sort((a, b) => a[0] - b[0]);
  }
  return meta ? { meta, chunks } : { chunks };
}

export function snapshotToDeltas(snapshot: WorldSnapshot): WorldDeltas {
  const out: WorldDeltas = new Map();
  for (const [key, entries] of Object.entries(snapshot.chunks)) out.set(key, new Map(entries));
  return out;
}

/** Defensively parse untrusted JSON into a clean snapshot, dropping anything malformed. */
export function parseWorldSnapshot(
  value: unknown,
  opts: { isValidBlockId: (id: number) => boolean },
): ParseResult {
  let dropped = 0;
  const chunks: Record<string, Array<[number, BlockId]>> = {};
  const root = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  const rawChunks =
    root.chunks && typeof root.chunks === 'object' ? (root.chunks as Record<string, unknown>) : {};

  for (const [key, rawEntries] of Object.entries(rawChunks)) {
    if (!CHUNK_KEY.test(key) || !Array.isArray(rawEntries)) {
      dropped++;
      continue;
    }
    const clean: Array<[number, BlockId]> = [];
    for (const entry of rawEntries) {
      if (!Array.isArray(entry) || entry.length !== 2) {
        dropped++;
        continue;
      }
      const index = entry[0];
      const id = entry[1];
      if (
        !Number.isInteger(index) ||
        index < 0 ||
        index >= CHUNK_VOLUME ||
        !Number.isInteger(id) ||
        !opts.isValidBlockId(id)
      ) {
        dropped++;
        continue;
      }
      clean.push([index, id as BlockId]);
    }
    if (clean.length > 0) chunks[key] = clean;
  }

  const meta = parseMeta(root.meta);
  return { snapshot: meta ? { meta, chunks } : { chunks }, dropped };
}

function parseMeta(value: unknown): WorldMeta | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const m = value as Record<string, unknown>;
  if (typeof m.seed !== 'number' || typeof m.version !== 'number') return undefined;
  const meta: WorldMeta = { seed: m.seed, version: m.version };
  if (typeof m.preset === 'string') meta.preset = m.preset;
  return meta;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/worldSnapshot.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/persistence/WorldSnapshot.ts tests/worldSnapshot.test.ts
git commit -m "feat(persistence): portable world snapshot serialize/validate"
```

---

## Task 2: BlockRegistry.has()

**Files:**
- Modify: `src/blocks/BlockRegistry.ts`
- Test: `tests/blocks.test.ts` (append)

- [ ] **Step 1: Write the failing test (append to tests/blocks.test.ts)**

```ts
// tests/blocks.test.ts — append inside the file
import { BlockRegistry } from '../src/blocks/BlockRegistry';
import { AIR } from '../src/blocks/blocks';

describe('BlockRegistry.has', () => {
  it('reports known and unknown block ids', () => {
    const reg = new BlockRegistry();
    expect(reg.has(AIR)).toBe(true);
    expect(reg.has(9999)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/blocks.test.ts`
Expected: FAIL — `reg.has is not a function`.

- [ ] **Step 3: Add the method (in `src/blocks/BlockRegistry.ts`, after `get`)**

```ts
  /** Whether a block id exists in the registry (for validating untrusted saves). */
  has(id: BlockId): boolean {
    return this.byId.has(id);
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/blocks.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/blocks/BlockRegistry.ts tests/blocks.test.ts
git commit -m "feat(blocks): BlockRegistry.has for save validation"
```

---

## Task 3: World disk store (server-side)

**Files:**
- Create: `server/worldDiskStore.ts`
- Test: `tests/worldDiskStore.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/worldDiskStore.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  readWorld,
  writeChunk,
  writeMeta,
  clearWorld,
  listWorlds,
  copyWorld,
  deleteWorld,
  safeWorldName,
} from '../server/worldDiskStore';

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'vr-saves-'));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('worldDiskStore', () => {
  it('returns an empty snapshot for an unknown world', () => {
    expect(readWorld(root, 'nope')).toEqual({ chunks: {} });
  });

  it('writes and reads meta and chunks; empty entries delete a chunk', () => {
    writeMeta(root, 'w', { seed: 1, version: 1, preset: 'default' });
    writeChunk(root, 'w', '0,0', [[5, 13]]);
    let snap = readWorld(root, 'w');
    expect(snap.meta).toEqual({ seed: 1, version: 1, preset: 'default' });
    expect(snap.chunks['0,0']).toEqual([[5, 13]]);

    writeChunk(root, 'w', '0,0', []); // delete
    snap = readWorld(root, 'w');
    expect(snap.chunks['0,0']).toBeUndefined();
    expect(snap.meta).toEqual({ seed: 1, version: 1, preset: 'default' }); // meta preserved
  });

  it('clear keeps meta but drops chunks', () => {
    writeMeta(root, 'w', { seed: 1, version: 1 });
    writeChunk(root, 'w', '1,1', [[0, 3]]);
    clearWorld(root, 'w');
    expect(readWorld(root, 'w')).toEqual({ meta: { seed: 1, version: 1 }, chunks: {} });
  });

  it('lists, copies and deletes worlds', () => {
    writeChunk(root, 'alpha', '0,0', [[1, 1]]);
    writeChunk(root, 'beta', '0,0', [[2, 2]]);
    expect(listWorlds(root)).toEqual(['alpha', 'beta']);

    copyWorld(root, 'alpha', 'gamma');
    expect(readWorld(root, 'gamma').chunks['0,0']).toEqual([[1, 1]]);

    deleteWorld(root, 'alpha');
    expect(listWorlds(root)).toEqual(['beta', 'gamma']);
  });

  it('sanitizes names and falls back to "default"', () => {
    expect(safeWorldName('a/b c.json')).toBe('a_b_c_json');
    expect(safeWorldName('')).toBe('default');
    expect(safeWorldName(undefined)).toBe('default');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/worldDiskStore.test.ts`
Expected: FAIL — cannot resolve `../server/worldDiskStore`.

- [ ] **Step 3: Write the implementation**

```ts
// server/worldDiskStore.ts
import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

export interface DiskSnapshot {
  meta?: { seed: number; version: number; preset?: string };
  chunks: Record<string, Array<[number, number]>>;
}

/** Filesystem-safe world name; never empty. */
export function safeWorldName(name: unknown): string {
  const s = String(name ?? '').replace(/[^a-z0-9_-]/gi, '_').slice(0, 64);
  return s.length > 0 ? s : 'default';
}

function fileFor(root: string, name: string): string {
  mkdirSync(root, { recursive: true });
  return resolve(root, `${safeWorldName(name)}.json`);
}

export function readWorld(root: string, name: string): DiskSnapshot {
  const file = fileFor(root, name);
  if (!existsSync(file)) return { chunks: {} };
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as Partial<DiskSnapshot>;
    return { meta: parsed.meta, chunks: parsed.chunks ?? {} };
  } catch {
    return { chunks: {} };
  }
}

function writeWorld(root: string, name: string, snap: DiskSnapshot): void {
  writeFileSync(fileFor(root, name), JSON.stringify(snap));
}

export function writeMeta(root: string, name: string, meta: DiskSnapshot['meta']): void {
  const snap = readWorld(root, name);
  snap.meta = meta;
  writeWorld(root, name, snap);
}

export function writeChunk(
  root: string,
  name: string,
  key: string,
  entries: Array<[number, number]>,
): void {
  const snap = readWorld(root, name);
  if (entries.length === 0) delete snap.chunks[key];
  else snap.chunks[key] = entries;
  writeWorld(root, name, snap);
}

export function clearWorld(root: string, name: string): void {
  const snap = readWorld(root, name);
  writeWorld(root, name, { meta: snap.meta, chunks: {} });
}

export function listWorlds(root: string): string[] {
  if (!existsSync(root)) return [];
  return readdirSync(root)
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.slice(0, -'.json'.length))
    .sort();
}

export function copyWorld(root: string, from: string, to: string): void {
  writeWorld(root, to, readWorld(root, from));
}

export function deleteWorld(root: string, name: string): void {
  const file = fileFor(root, name);
  if (existsSync(file)) rmSync(file);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/worldDiskStore.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add server/worldDiskStore.ts tests/worldDiskStore.test.ts
git commit -m "feat(persistence): server-side world disk store"
```

---

## Task 4: `/__world` dev endpoint

**Files:**
- Modify: `vite.config.ts` (add a middleware inside the existing `devDisk()` plugin's `configureServer`)

This is thin glue over Task 3's tested `worldDiskStore`; verify manually with curl (no unit test for the Vite plugin).

- [ ] **Step 1: Add the import at the top of `vite.config.ts`**

```ts
import {
  readWorld,
  writeChunk,
  writeMeta,
  clearWorld,
  listWorlds,
  copyWorld,
  deleteWorld,
  safeWorldName,
} from './server/worldDiskStore';
```

- [ ] **Step 2: Register the middleware (inside `configureServer(server)`, after the `/__blueprint` block)**

```ts
      const MAX_WORLD_BODY = 8 * 1024 * 1024; // 8 MB per request guard

      server.middlewares.use('/__world', (req, res) => {
        const root = dir('.saves');
        const url = new URL(req.url ?? '', 'http://x');
        const name = safeWorldName(url.searchParams.get('name'));

        if (req.method === 'GET') {
          if (url.searchParams.has('list')) return sendJson(res, { worlds: listWorlds(root) });
          return sendJson(res, readWorld(root, name));
        }

        if (req.method === 'DELETE') {
          deleteWorld(root, name);
          return sendJson(res, { ok: true });
        }

        if (req.method !== 'POST') {
          res.statusCode = 405;
          return res.end('GET/POST/DELETE only');
        }

        const copyTo = url.searchParams.get('copyTo');
        if (copyTo) {
          copyWorld(root, name, safeWorldName(copyTo));
          return sendJson(res, { ok: true });
        }
        if (url.searchParams.has('clear')) {
          clearWorld(root, name);
          return sendJson(res, { ok: true });
        }

        void readBody(req).then((body) => {
          try {
            if (body.length > MAX_WORLD_BODY) {
              res.statusCode = 413;
              return res.end('payload too large');
            }
            const payload = JSON.parse(body || '{}') as {
              meta?: { seed: number; version: number; preset?: string };
              entries?: Array<[number, number]>;
            };
            if (url.searchParams.has('meta')) {
              writeMeta(root, name, payload.meta);
              return sendJson(res, { ok: true });
            }
            const chunk = url.searchParams.get('chunk');
            if (chunk && /^-?\d+,-?\d+$/.test(chunk)) {
              const entries = Array.isArray(payload.entries) ? payload.entries : [];
              const clean = entries.filter(
                (e) =>
                  Array.isArray(e) &&
                  e.length === 2 &&
                  Number.isInteger(e[0]) &&
                  Number.isInteger(e[1]),
              );
              writeChunk(root, name, chunk, clean);
              return sendJson(res, { ok: true });
            }
            res.statusCode = 400;
            res.end('bad request');
          } catch (err) {
            res.statusCode = 500;
            res.end(String(err));
          }
        });
      });
```

- [ ] **Step 3: Verify the dev server still boots and the endpoint responds**

Run: `npm run dev -- --port 5199 --strictPort` (background), then:
```bash
curl -s "http://127.0.0.1:5199/__world?name=plan-test&list" 
curl -s -X POST "http://127.0.0.1:5199/__world?name=plan-test&chunk=0,0" \
  -H 'content-type: application/json' --data '{"entries":[[5,13]]}'
curl -s "http://127.0.0.1:5199/__world?name=plan-test"
```
Expected: first returns `{"worlds":[...]}`, last returns `{"chunks":{"0,0":[[5,13]]}}`. Then stop the server and delete `.saves/plan-test.json`.

- [ ] **Step 4: Commit**

```bash
git add vite.config.ts
git commit -m "feat(dev): /__world endpoint for shared named worlds"
```

---

## Task 5: ServerSaveStore (SaveStore over HTTP)

**Files:**
- Create: `src/persistence/ServerSaveStore.ts`
- Test: `tests/serverSaveStore.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
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

    expect(fetchMock.mock.calls[0][0]).toContain('/__world?name=settlement');
    expect(deltas.get('0,0')).toEqual(new Map([[5, 13]]));
    expect(deltas.has('1,0')).toBe(false); // unknown block id dropped
  });

  it('saveChunkDelta POSTs entries to the chunk URL', async () => {
    const fetchMock = vi.fn(async () => ok({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    const store = new ServerSaveStore('settlement', isValidBlockId);
    await store.saveChunkDelta('2,3', [[7, 5]]);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain('name=settlement');
    expect(url).toContain('chunk=2%2C3');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ entries: [[7, 5]] });
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/serverSaveStore.test.ts`
Expected: FAIL — cannot resolve `../src/persistence/ServerSaveStore`.

- [ ] **Step 3: Write the implementation**

```ts
// src/persistence/ServerSaveStore.ts
import type { SaveStore } from './SaveStore';
import type { ChunkDeltaEntries, WorldDeltas, WorldMeta } from './SaveTypes';
import { parseWorldSnapshot, snapshotToDeltas, type WorldSnapshot } from './WorldSnapshot';

const ENDPOINT = '/__world';

/** SaveStore backed by the `/__world` dev endpoint, so worlds are shared across browser profiles. */
export class ServerSaveStore implements SaveStore {
  constructor(
    private readonly name: string,
    private readonly isValidBlockId: (id: number) => boolean,
  ) {}

  private url(params: Record<string, string>): string {
    const q = new URLSearchParams({ name: this.name, ...params });
    return `${ENDPOINT}?${q.toString()}`;
  }

  async loadMeta(): Promise<WorldMeta | undefined> {
    return (await this.fetchSnapshot())?.meta;
  }

  async saveMeta(meta: WorldMeta): Promise<void> {
    await this.post(this.url({ meta: '1' }), { meta });
  }

  async loadDeltas(): Promise<WorldDeltas> {
    const snap = await this.fetchSnapshot();
    return snap ? snapshotToDeltas(snap) : new Map();
  }

  async saveChunkDelta(chunkKey: string, entries: ChunkDeltaEntries): Promise<void> {
    await this.post(this.url({ chunk: chunkKey }), { entries });
  }

  async clearDeltas(): Promise<void> {
    await this.post(this.url({ clear: '1' }), undefined);
  }

  private async post(url: string, body: unknown): Promise<void> {
    try {
      await fetch(url, {
        method: 'POST',
        headers: body === undefined ? undefined : { 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (err) {
      console.error('Voxel Realm: world save failed', err);
    }
  }

  private async fetchSnapshot(): Promise<WorldSnapshot | undefined> {
    try {
      const res = await fetch(this.url({}));
      if (!res.ok) return undefined;
      const json = (await res.json()) as unknown;
      return parseWorldSnapshot(json, { isValidBlockId: this.isValidBlockId }).snapshot;
    } catch (err) {
      console.error('Voxel Realm: world load failed', err);
      return undefined;
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/serverSaveStore.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/persistence/ServerSaveStore.ts tests/serverSaveStore.test.ts
git commit -m "feat(persistence): ServerSaveStore over /__world"
```

---

## Task 6: World catalog client + world-name helper

**Files:**
- Create: `src/persistence/ServerWorldCatalog.ts`, `src/persistence/worldName.ts`
- Test: `tests/serverWorldCatalog.test.ts`, `tests/worldName.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// tests/worldName.test.ts
import { describe, it, expect } from 'vitest';
import { worldNameFromSearch } from '../src/persistence/worldName';

describe('worldNameFromSearch', () => {
  it('defaults to "default" when absent or empty', () => {
    expect(worldNameFromSearch('')).toBe('default');
    expect(worldNameFromSearch('?world=flat')).toBe('default');
  });
  it('reads and sanitizes ?save', () => {
    expect(worldNameFromSearch('?save=settlement')).toBe('settlement');
    expect(worldNameFromSearch('?save=a/b c')).toBe('a_b_c');
  });
});
```

```ts
// tests/serverWorldCatalog.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { listWorlds, copyWorld, deleteWorld } from '../src/persistence/ServerWorldCatalog';

const ok = (json: unknown): Response =>
  ({ ok: true, json: async () => json }) as unknown as Response;

beforeEach(() => vi.restoreAllMocks());

describe('ServerWorldCatalog', () => {
  it('listWorlds returns the worlds array', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ok({ worlds: ['a', 'b'] })));
    expect(await listWorlds()).toEqual(['a', 'b']);
  });

  it('copyWorld posts name + copyTo', async () => {
    const fetchMock = vi.fn(async () => ok({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);
    await copyWorld('a', 'b');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain('name=a');
    expect(url).toContain('copyTo=b');
    expect(init.method).toBe('POST');
  });

  it('deleteWorld issues a DELETE', async () => {
    const fetchMock = vi.fn(async () => ok({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);
    await deleteWorld('a');
    expect(fetchMock.mock.calls[0][1].method).toBe('DELETE');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/worldName.test.ts tests/serverWorldCatalog.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Write the implementations**

```ts
// src/persistence/worldName.ts
/** The world name selected by `?save=`, sanitized; defaults to "default". */
export function worldNameFromSearch(search: string): string {
  const raw = new URLSearchParams(search).get('save') ?? '';
  const clean = raw.replace(/[^a-z0-9_-]/gi, '_').slice(0, 64);
  return clean.length > 0 ? clean : 'default';
}
```

```ts
// src/persistence/ServerWorldCatalog.ts
const ENDPOINT = '/__world';

export async function listWorlds(): Promise<string[]> {
  try {
    const res = await fetch(`${ENDPOINT}?list=1`);
    if (!res.ok) return [];
    const json = (await res.json()) as { worlds?: string[] };
    return json.worlds ?? [];
  } catch {
    return [];
  }
}

export async function copyWorld(from: string, to: string): Promise<void> {
  await fetch(
    `${ENDPOINT}?name=${encodeURIComponent(from)}&copyTo=${encodeURIComponent(to)}`,
    { method: 'POST' },
  );
}

export async function deleteWorld(name: string): Promise<void> {
  await fetch(`${ENDPOINT}?name=${encodeURIComponent(name)}`, { method: 'DELETE' });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/worldName.test.ts tests/serverWorldCatalog.test.ts`
Expected: PASS (5 tests total).

- [ ] **Step 5: Commit**

```bash
git add src/persistence/ServerWorldCatalog.ts src/persistence/worldName.ts \
  tests/serverWorldCatalog.test.ts tests/worldName.test.ts
git commit -m "feat(persistence): world catalog client + ?save name helper"
```

---

## Task 7: Wire store selection into Game.boot

**Files:**
- Modify: `src/app/Game.ts` (imports near line 18-20; store creation near line 69)

- [ ] **Step 1: Add imports (after the existing persistence imports, ~line 20)**

```ts
import { ServerSaveStore } from '../persistence/ServerSaveStore';
import { worldNameFromSearch } from '../persistence/worldName';
import type { SaveStore } from '../persistence/SaveStore';
```

- [ ] **Step 2: Replace the store creation (the line `const store = new IndexedDbSaveStore();`)**

```ts
    // Shared storage in dev (server-owned, named worlds via ?save=); IndexedDB in production.
    const worldName = worldNameFromSearch(window.location.search);
    const store: SaveStore = import.meta.env.DEV
      ? new ServerSaveStore(worldName, (id) => registry.has(id as BlockId))
      : new IndexedDbSaveStore();
```

- [ ] **Step 3: Type-check and run the full suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: tsc clean; all tests pass (existing 176 + new).

- [ ] **Step 4: Commit**

```bash
git add src/app/Game.ts
git commit -m "feat(app): select shared ServerSaveStore in dev, IndexedDB in prod"
```

---

## Task 8: `__vr.world` dev API

**Files:**
- Modify: `src/app/DevControls.ts` (imports at top; add `world` to the `api` object near line 224)

- [ ] **Step 1: Add imports at the top of DevControls.ts**

```ts
import { listWorlds, copyWorld, deleteWorld } from '../persistence/ServerWorldCatalog';
import { worldNameFromSearch } from '../persistence/worldName';
```

- [ ] **Step 2: Add helpers inside `installDevControls` (near the top of the function body)**

```ts
  const currentWorld = worldNameFromSearch(window.location.search);
  const gotoWorld = (name: string): void => {
    const u = new URL(window.location.href);
    u.searchParams.set('save', name);
    window.location.href = u.toString();
  };
```

- [ ] **Step 3: Add the `world` namespace to the `api` object (alongside the other groups)**

```ts
    // --- named worlds (shared storage) ---
    world: {
      list: (): Promise<string[]> => listWorlds(),
      current: (): string => currentWorld,
      /** Copy the current world to `name` (does not switch). Returns the new name. */
      saveAs: async (name: string): Promise<string> => {
        await copyWorld(currentWorld, name);
        return name;
      },
      /** Reload into world `name` (creates it on first edit if absent). */
      load: (name: string): void => gotoWorld(name),
      delete: (name: string): Promise<void> => deleteWorld(name),
    },
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/app/DevControls.ts
git commit -m "feat(dev): __vr.world API (list/current/saveAs/load/delete)"
```

---

## Task 9: HUD world menu

**Files:**
- Modify: `src/app/CreativeUi.ts` (interface ~line 130; dock build ~line 198; return object)
- Modify: `src/app/Game.ts` (wire the menu via ServerWorldCatalog, dev-only)

- [ ] **Step 1: Extend the `CreativeUi` interface (add to the interface near line 130)**

```ts
  /** Dev world menu: a button labeled with the current world (click handled by Game). */
  worldButton: HTMLButtonElement;
```

- [ ] **Step 2: Build the button in `createCreativeUi` (after `const reset = button('Reset world');`)**

```ts
  const worldButton = button('World: default');
  worldButton.className = 'world-btn';
```

Update the dock append line from `dock.append(toolRow, reset);` to:

```ts
  dock.append(toolRow, worldButton, reset);
```

- [ ] **Step 3: Return it (add `worldButton` to the returned object literal)**

```ts
    worldButton,
```

- [ ] **Step 4: Wire it in Game.boot (dev-only, after `const ui = createCreativeUi(...)`)**

```ts
    if (import.meta.env.DEV) {
      const { listWorlds, copyWorld } = await import('../persistence/ServerWorldCatalog');
      ui.worldButton.textContent = `World: ${worldName}`;
      ui.worldButton.addEventListener('click', () => {
        void (async () => {
          const worlds = await listWorlds();
          const choice = window.prompt(
            `Worlds: ${worlds.join(', ') || '(none yet)'}\n` +
              `Type a name to switch/create, or "save:NEW" to copy "${worldName}" to NEW:`,
            worldName,
          );
          if (!choice) return;
          const u = new URL(window.location.href);
          if (choice.startsWith('save:')) {
            const target = choice.slice('save:'.length).trim();
            if (!target) return;
            await copyWorld(worldName, target);
            u.searchParams.set('save', target);
          } else {
            u.searchParams.set('save', choice.trim());
          }
          window.location.href = u.toString();
        })();
      });
    } else {
      ui.worldButton.style.display = 'none';
    }
```

- [ ] **Step 5: Type-check, lint, full tests**

Run: `npx tsc --noEmit && npm run lint && npx vitest run`
Expected: all clean/green.

- [ ] **Step 6: Commit**

```bash
git add src/app/CreativeUi.ts src/app/Game.ts
git commit -m "feat(ui): dev world menu (switch / save-as named worlds)"
```

---

## Task 10: End-to-end verification + backlog update

**Files:**
- Verify only; optionally update the vault backlog note.

- [ ] **Step 1: Gates**

Run: `npm run lint && npx tsc --noEmit && npx vitest run`
Expected: lint clean, tsc clean, all tests pass.

- [ ] **Step 2: Live shared-storage check (preview)**

Start the dev server, then in the page console / `__vr`:
1. `__vr.world.current()` → `"default"`.
2. Make an edit (e.g. `__vr.place(8, 64, 8, 13)`), wait ~1s, confirm `.saves/default.json` exists on disk and contains the chunk.
3. `__vr.fill(...)` a small structure; `await __vr.world.saveAs('demo')` → confirm `.saves/demo.json` is a copy.
4. Open a second browser profile at the same dev URL with `?save=default` and confirm the edit is present after load (shared storage).
5. `__vr.world.list()` → includes `default` and `demo`.

- [ ] **Step 3: Confirm production path is unaffected**

Run: `npm run build`
Expected: builds clean; `ServerSaveStore`/`__vr`/world menu are dev-only (tree-shaken; menu hidden in prod).

- [ ] **Step 4: (Optional) mark backlog items done**

In `Obsidian Vault/Voxel Realm/Suggested Improvements.md`, note that "save export/import for world deltas", "open this saved world workflow", and "saved deltas trusted without validation" are addressed by this feature. (Use the vault-sync skill.)

- [ ] **Step 5: Final commit (if any verification fixups were needed)**

```bash
git add -A
git commit -m "test(persistence): verify shared storage + named saves end-to-end"
```

---

## Self-Review

- **Spec coverage:** shared storage (Tasks 4,5,7) ✓; agent cross-profile (same `?save=` + endpoint, Tasks 4,5,8) ✓; named saves (Tasks 4,6,8,9) ✓; validation/hardening (Tasks 1,4 + boot path via ServerSaveStore) ✓; Edgar-as-main-user UX (Tasks 8,9, URL param) ✓. Out of scope (live sync) documented in design.
- **Type consistency:** `WorldSnapshot`/`ParseResult`, `parseWorldSnapshot(value, {isValidBlockId})`, `snapshotToDeltas`, `serializeWorldSnapshot(meta, deltas)`, `ServerSaveStore(name, isValidBlockId)`, `worldNameFromSearch(search)`, `safeWorldName(name)`, catalog `listWorlds/copyWorld/deleteWorld` — names match across tasks.
- **No placeholders:** every code step is complete and compilable; commands have expected output.
- **Note:** `serializeWorldSnapshot` is currently only used by tests/future export; the live save path uses per-chunk `saveChunkDelta`. Kept because it's the symmetric primitive and is unit-tested — acceptable, not dead weight (used by `__vr.world.saveAs` indirectness is server-side copy, so if unused in client after review, drop it in Task 1 to honor YAGNI).
```
