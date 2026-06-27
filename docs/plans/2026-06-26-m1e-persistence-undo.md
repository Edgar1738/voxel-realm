# M1E — Persistence + Undo/Redo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist edits to IndexedDB so a page reload preserves the world, and add session-only undo/redo.

**Architecture:** A pure `ChunkDeltas` holds per-chunk `{voxelIndex → blockId}` edits; `ChunkManager` applies them after base+overlays at generation time (so re-loaded chunks keep edits). A pure `UndoRedo` holds the session stacks. A `WorldEdits` orchestrator implements `WorldEditor` (so `EditService` is unchanged): on each edit it mutates the world via `ChunkManager`, records the delta, queues a durable write, and pushes an undo op. A `SaveStore` interface abstracts storage; `MemorySaveStore` is used in tests, `IndexedDbSaveStore` in the browser. On boot the durable deltas seed `ChunkDeltas`, with a seed/version guard that discards stale saves.

**Tech Stack:** TypeScript (strict), IndexedDB (browser), Vitest. Builds on M1D.

---

## File Structure

```txt
src/persistence/
  SaveTypes.ts          CREATE  WorldMeta, SerializedDeltas, SAVE_VERSION
  ChunkDeltas.ts        CREATE  in-memory per-chunk delta store (gen-time apply)
  SaveStore.ts          CREATE  SaveStore interface + MemorySaveStore
  IndexedDbSaveStore.ts CREATE  IndexedDB-backed SaveStore (browser)
src/edit/
  UndoRedo.ts           CREATE  session undo/redo stacks
  WorldEdits.ts         CREATE  WorldEditor orchestrator (delta + persist + undo)
src/world/ChunkManager.ts MODIFY  apply deltas at generation time
src/app/Game.ts         MODIFY  async boot: load save, route edits, undo/redo keys
index.html              MODIFY  overlay hint
tests/
  chunkDeltas.test.ts   CREATE
  undoRedo.test.ts      CREATE
  worldEdits.test.ts    CREATE
  chunkManager.test.ts  MODIFY  makeManager passes ChunkDeltas
```

---

## Task 1: ChunkDeltas + apply at generation

**Files:**
- Create: `src/persistence/SaveTypes.ts`, `src/persistence/ChunkDeltas.ts`
- Modify: `src/world/ChunkManager.ts`, `tests/chunkManager.test.ts`
- Test: `tests/chunkDeltas.test.ts`

- [ ] **Step 1: Write the failing ChunkDeltas test**

`tests/chunkDeltas.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { ChunkDeltas } from '../src/persistence/ChunkDeltas';
import { ChunkData } from '../src/world/ChunkData';
import { voxelIndex } from '../src/core/coords';
import { STONE, GRASS, AIR } from '../src/blocks/blocks';

describe('ChunkDeltas', () => {
  it('applies recorded edits to a matching chunk only', () => {
    const deltas = new ChunkDeltas();
    deltas.record(0, 0, voxelIndex(1, 2, 3), STONE);
    const chunk = new ChunkData(0, 0);
    deltas.applyTo(chunk);
    expect(chunk.get(1, 2, 3)).toBe(STONE);

    const other = new ChunkData(1, 0);
    deltas.applyTo(other);
    expect(other.get(1, 2, 3)).toBe(AIR); // different chunk untouched
  });

  it('keeps the latest value per voxel', () => {
    const deltas = new ChunkDeltas();
    const idx = voxelIndex(0, 0, 0);
    deltas.record(0, 0, idx, STONE);
    deltas.record(0, 0, idx, GRASS);
    const chunk = new ChunkData(0, 0);
    deltas.applyTo(chunk);
    expect(chunk.get(0, 0, 0)).toBe(GRASS);
  });

  it('round-trips through serialize/load', () => {
    const a = new ChunkDeltas();
    a.record(0, 0, voxelIndex(2, 3, 4), STONE);
    a.record(-1, 5, voxelIndex(0, 1, 0), GRASS);
    const b = new ChunkDeltas();
    b.load(a.serialize());

    const c1 = new ChunkData(0, 0);
    b.applyTo(c1);
    expect(c1.get(2, 3, 4)).toBe(STONE);
    const c2 = new ChunkData(-1, 5);
    b.applyTo(c2);
    expect(c2.get(0, 1, 0)).toBe(GRASS);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run chunkDeltas`
Expected: FAIL — cannot resolve `../src/persistence/ChunkDeltas`.

- [ ] **Step 3: Write SaveTypes + ChunkDeltas**

`src/persistence/SaveTypes.ts`:
```ts
import type { BlockId } from '../core/types';

/** Bump when WORLD_HEIGHT, the voxel-index convention, block ids, or base worldgen change. */
export const SAVE_VERSION = 1;

export interface WorldMeta {
  seed: number;
  version: number;
}

/** A chunk's edits: voxelIndex -> blockId. */
export type ChunkDeltaRecord = Record<number, BlockId>;

/** All chunks' edits, keyed by chunk key ("cx,cz"). */
export type SerializedDeltas = Record<string, ChunkDeltaRecord>;
```

`src/persistence/ChunkDeltas.ts`:
```ts
import { chunkKey } from '../core/coords';
import type { BlockId } from '../core/types';
import type { ChunkData } from '../world/ChunkData';
import type { SerializedDeltas } from './SaveTypes';

/**
 * In-memory authoritative edit deltas (voxelIndex -> blockId) per chunk. Applied to a freshly
 * generated chunk so edits survive unload/reload; the durable copy lives in a SaveStore.
 */
export class ChunkDeltas {
  private readonly byChunk = new Map<string, Map<number, BlockId>>();

  record(cx: number, cz: number, voxelIndex: number, id: BlockId): void {
    const key = chunkKey(cx, cz);
    let m = this.byChunk.get(key);
    if (!m) {
      m = new Map();
      this.byChunk.set(key, m);
    }
    m.set(voxelIndex, id);
  }

  /** Overwrites the chunk's voxels with any recorded edits for that chunk. */
  applyTo(chunk: ChunkData): void {
    const m = this.byChunk.get(chunkKey(chunk.cx, chunk.cz));
    if (!m) return;
    for (const [idx, id] of m) chunk.data[idx] = id;
  }

  serialize(): SerializedDeltas {
    const out: SerializedDeltas = {};
    for (const [key, m] of this.byChunk) {
      const rec: Record<number, BlockId> = {};
      for (const [idx, id] of m) rec[idx] = id;
      out[key] = rec;
    }
    return out;
  }

  load(serialized: SerializedDeltas): void {
    for (const key of Object.keys(serialized)) {
      const m = new Map<number, BlockId>();
      const rec = serialized[key];
      for (const idx of Object.keys(rec)) m.set(Number(idx), rec[Number(idx)]);
      this.byChunk.set(key, m);
    }
  }
}
```

- [ ] **Step 4: Apply deltas in ChunkManager generation**

In `src/world/ChunkManager.ts`:

Add the import and constructor param. Add:
```ts
import type { ChunkDeltas } from '../persistence/ChunkDeltas';
```
Add `private readonly deltas: ChunkDeltas` as the LAST constructor parameter (after `overlays`,
before `options`):
```ts
  constructor(
    private readonly generator: Generator,
    private readonly mesher: GreedyMesher,
    private readonly registry: BlockRegistry,
    private readonly sink: ChunkSink,
    private readonly seed: WorldSeed,
    private readonly overlays: Overlay[],
    private readonly deltas: ChunkDeltas,
    options?: Partial<ChunkManagerOptions>,
  ) {
```
In the generate pass in `update`, after `applyOverlays(...)`, apply deltas:
```ts
      const data = this.generator.generateBaseChunk(this.seed, cx, cz);
      applyOverlays(data, cx, cz, this.seed, this.overlays);
      this.deltas.applyTo(data);
      this.store.set(cx, cz, data, ChunkState.Generated);
```

- [ ] **Step 5: Update the ChunkManager test factory**

In `tests/chunkManager.test.ts`, import `ChunkDeltas` and pass one in `makeManager`:
```ts
import { ChunkDeltas } from '../src/persistence/ChunkDeltas';
```
```ts
  return new ChunkManager(
    createWorldGenerator(),
    new GreedyMesher(registry),
    registry,
    sink,
    SEED,
    [],
    new ChunkDeltas(),
    { viewDistance, genBudget, meshBudget },
  );
```

- [ ] **Step 6: Run the tests**

Run: `npx vitest run chunkDeltas chunkManager`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/persistence/SaveTypes.ts src/persistence/ChunkDeltas.ts src/world/ChunkManager.ts tests/chunkDeltas.test.ts tests/chunkManager.test.ts
git commit -m "feat(persistence): add ChunkDeltas applied at generation time"
```

---

## Task 2: UndoRedo

**Files:**
- Create: `src/edit/UndoRedo.ts`
- Test: `tests/undoRedo.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/undoRedo.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { UndoRedo, type EditOp } from '../src/edit/UndoRedo';

const op = (next: number): EditOp => ({ x: 0, y: 0, z: 0, prev: 0, next });

describe('UndoRedo', () => {
  it('returns the op to undo, then to redo', () => {
    const ur = new UndoRedo();
    ur.record(op(1));
    expect(ur.canUndo).toBe(true);
    const undone = ur.undo();
    expect(undone?.next).toBe(1); // caller applies prev
    expect(ur.canUndo).toBe(false);
    const redone = ur.redo();
    expect(redone?.next).toBe(1); // caller applies next
  });

  it('returns null when there is nothing to undo/redo', () => {
    const ur = new UndoRedo();
    expect(ur.undo()).toBeNull();
    expect(ur.redo()).toBeNull();
  });

  it('clears the redo stack on a new edit', () => {
    const ur = new UndoRedo();
    ur.record(op(1));
    ur.undo();
    ur.record(op(2)); // new edit invalidates redo
    expect(ur.redo()).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run undoRedo`
Expected: FAIL — cannot resolve `../src/edit/UndoRedo`.

- [ ] **Step 3: Write the implementation**

`src/edit/UndoRedo.ts`:
```ts
import type { BlockId } from '../core/types';

/** A single reversible voxel edit at world coords. */
export interface EditOp {
  x: number;
  y: number;
  z: number;
  prev: BlockId;
  next: BlockId;
}

/** Session-only undo/redo stacks (not persisted). */
export class UndoRedo {
  private readonly undoStack: EditOp[] = [];
  private readonly redoStack: EditOp[] = [];

  record(op: EditOp): void {
    this.undoStack.push(op);
    this.redoStack.length = 0;
  }

  /** Pops an op to undo (caller applies its `prev`), or null. */
  undo(): EditOp | null {
    const op = this.undoStack.pop();
    if (!op) return null;
    this.redoStack.push(op);
    return op;
  }

  /** Pops an op to redo (caller applies its `next`), or null. */
  redo(): EditOp | null {
    const op = this.redoStack.pop();
    if (!op) return null;
    this.undoStack.push(op);
    return op;
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run undoRedo`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/edit/UndoRedo.ts tests/undoRedo.test.ts
git commit -m "feat(edit): add session undo/redo stacks"
```

---

## Task 3: SaveStore + WorldEdits

**Files:**
- Create: `src/persistence/SaveStore.ts`, `src/edit/WorldEdits.ts`
- Test: `tests/worldEdits.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/worldEdits.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { WorldEdits } from '../src/edit/WorldEdits';
import { ChunkDeltas } from '../src/persistence/ChunkDeltas';
import { MemorySaveStore } from '../src/persistence/SaveStore';
import { UndoRedo } from '../src/edit/UndoRedo';
import { AIR, STONE, GRASS } from '../src/blocks/blocks';
import type { WorldEditor } from '../src/world/ChunkManager';

/** Map-backed fake world (the ChunkManager seam). */
function fakeManager(): WorldEditor & { store: Map<string, number> } {
  const store = new Map<string, number>();
  return {
    store,
    getBlock: (x, y, z) => store.get(`${x},${y},${z}`) ?? AIR,
    setBlock: (x, y, z, id) => store.set(`${x},${y},${z}`, id),
  };
}

function setup() {
  const manager = fakeManager();
  const deltas = new ChunkDeltas();
  const save = new MemorySaveStore();
  const undo = new UndoRedo();
  const edits = new WorldEdits(manager, deltas, save, undo);
  return { manager, deltas, save, undo, edits };
}

describe('WorldEdits', () => {
  it('applies an edit, records the delta, and persists it', async () => {
    const { manager, save, edits } = setup();
    edits.setBlock(3, 4, 5, STONE);
    expect(manager.getBlock(3, 4, 5)).toBe(STONE);
    const persisted = await save.loadDeltas();
    expect(Object.keys(persisted).length).toBe(1); // one chunk has a delta
  });

  it('undoes and redoes an edit', () => {
    const { manager, edits } = setup();
    edits.setBlock(3, 4, 5, STONE); // prev was AIR
    expect(edits.undoEdit()).toBe(true);
    expect(manager.getBlock(3, 4, 5)).toBe(AIR);
    expect(edits.redoEdit()).toBe(true);
    expect(manager.getBlock(3, 4, 5)).toBe(STONE);
  });

  it('ignores a no-op edit (same block)', () => {
    const { manager, edits } = setup();
    manager.setBlock(3, 4, 5, GRASS);
    edits.setBlock(3, 4, 5, GRASS); // same -> no undo recorded
    expect(edits.undoEdit()).toBe(false);
  });

  it('feeds recorded deltas back into generation', () => {
    const { deltas, edits } = setup();
    edits.setBlock(1, 2, 3, STONE);
    // The same deltas instance, applied to a regenerated chunk, restores the edit.
    expect(deltas.serialize()['0,0']).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run worldEdits`
Expected: FAIL — cannot resolve `../src/edit/WorldEdits` / `../src/persistence/SaveStore`.

- [ ] **Step 3: Write SaveStore + MemorySaveStore**

`src/persistence/SaveStore.ts`:
```ts
import type { BlockId } from '../core/types';
import type { WorldMeta, SerializedDeltas } from './SaveTypes';

/** Durable storage for world meta + edit deltas. */
export interface SaveStore {
  loadMeta(): Promise<WorldMeta | undefined>;
  saveMeta(meta: WorldMeta): Promise<void>;
  loadDeltas(): Promise<SerializedDeltas>;
  putVoxel(chunkKey: string, voxelIndex: number, blockId: BlockId): Promise<void>;
  clearDeltas(): Promise<void>;
}

/** In-memory SaveStore for tests/dev (no durability). */
export class MemorySaveStore implements SaveStore {
  private meta: WorldMeta | undefined;
  private deltas: SerializedDeltas = {};

  async loadMeta(): Promise<WorldMeta | undefined> {
    return this.meta;
  }

  async saveMeta(meta: WorldMeta): Promise<void> {
    this.meta = meta;
  }

  async loadDeltas(): Promise<SerializedDeltas> {
    return JSON.parse(JSON.stringify(this.deltas));
  }

  async putVoxel(chunkKey: string, voxelIndex: number, blockId: BlockId): Promise<void> {
    (this.deltas[chunkKey] ??= {})[voxelIndex] = blockId;
  }

  async clearDeltas(): Promise<void> {
    this.deltas = {};
  }
}
```

- [ ] **Step 4: Write WorldEdits**

`src/edit/WorldEdits.ts`:
```ts
import { chunkKey, worldToChunkCoord, worldToLocal, voxelIndex } from '../core/coords';
import { UndoRedo } from './UndoRedo';
import type { WorldEditor } from '../world/ChunkManager';
import type { ChunkDeltas } from '../persistence/ChunkDeltas';
import type { SaveStore } from '../persistence/SaveStore';
import type { BlockId } from '../core/types';

/**
 * Orchestrates edits: mutates the world (ChunkManager), records the delta (for regeneration),
 * queues a durable write, and tracks undo/redo. Implements WorldEditor so EditService is
 * unchanged.
 */
export class WorldEdits implements WorldEditor {
  constructor(
    private readonly world: WorldEditor,
    private readonly deltas: ChunkDeltas,
    private readonly store: SaveStore,
    private readonly undo: UndoRedo,
  ) {}

  getBlock(x: number, y: number, z: number): BlockId {
    return this.world.getBlock(x, y, z);
  }

  /** A user edit (recorded for undo). */
  setBlock(x: number, y: number, z: number, id: BlockId): void {
    this.write(x, y, z, id, true);
  }

  undoEdit(): boolean {
    const op = this.undo.undo();
    if (!op) return false;
    this.write(op.x, op.y, op.z, op.prev, false);
    return true;
  }

  redoEdit(): boolean {
    const op = this.undo.redo();
    if (!op) return false;
    this.write(op.x, op.y, op.z, op.next, false);
    return true;
  }

  private write(x: number, y: number, z: number, id: BlockId, record: boolean): void {
    const prev = this.world.getBlock(x, y, z);
    if (prev === id) return;
    this.world.setBlock(x, y, z, id);

    const cx = worldToChunkCoord(x);
    const cz = worldToChunkCoord(z);
    const idx = voxelIndex(worldToLocal(x), y, worldToLocal(z));
    this.deltas.record(cx, cz, idx, id);
    void this.store.putVoxel(chunkKey(cx, cz), idx, id);

    if (record) this.undo.record({ x, y, z, prev, next: id });
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run worldEdits`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add src/persistence/SaveStore.ts src/edit/WorldEdits.ts tests/worldEdits.test.ts
git commit -m "feat(persistence): add SaveStore + WorldEdits (delta + persist + undo)"
```

---

## Task 4: IndexedDB store + app wiring

**Files:**
- Create: `src/persistence/IndexedDbSaveStore.ts`
- Modify: `src/app/Game.ts`, `src/app/main.ts`, `index.html`

No unit tests (IndexedDB is a browser API); verified by reload in the browser.

- [ ] **Step 1: Write the IndexedDB store**

`src/persistence/IndexedDbSaveStore.ts`:
```ts
import type { BlockId } from '../core/types';
import type { SaveStore } from './SaveStore';
import type { WorldMeta, SerializedDeltas, ChunkDeltaRecord } from './SaveTypes';

const DB_NAME = 'voxel-realm';
const DB_VERSION = 1;
const META_STORE = 'meta';
const DELTA_STORE = 'deltas';
const META_KEY = 'world';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(META_STORE)) db.createObjectStore(META_STORE);
      if (!db.objectStoreNames.contains(DELTA_STORE)) db.createObjectStore(DELTA_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(db: IDBDatabase, store: string, mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const request = run(db.transaction(store, mode).objectStore(store));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** IndexedDB-backed durable save. Each chunk's delta record is one row keyed by chunk key. */
export class IndexedDbSaveStore implements SaveStore {
  private dbPromise = open();

  async loadMeta(): Promise<WorldMeta | undefined> {
    const db = await this.dbPromise;
    return tx<WorldMeta | undefined>(db, META_STORE, 'readonly', (s) => s.get(META_KEY));
  }

  async saveMeta(meta: WorldMeta): Promise<void> {
    const db = await this.dbPromise;
    await tx(db, META_STORE, 'readwrite', (s) => s.put(meta, META_KEY));
  }

  async loadDeltas(): Promise<SerializedDeltas> {
    const db = await this.dbPromise;
    const keys = await tx<IDBValidKey[]>(db, DELTA_STORE, 'readonly', (s) => s.getAllKeys());
    const values = await tx<ChunkDeltaRecord[]>(db, DELTA_STORE, 'readonly', (s) => s.getAll());
    const out: SerializedDeltas = {};
    keys.forEach((k, i) => {
      out[String(k)] = values[i];
    });
    return out;
  }

  async putVoxel(chunkKey: string, voxelIndex: number, blockId: BlockId): Promise<void> {
    const db = await this.dbPromise;
    const existing =
      (await tx<ChunkDeltaRecord | undefined>(db, DELTA_STORE, 'readonly', (s) => s.get(chunkKey))) ??
      {};
    existing[voxelIndex] = blockId;
    await tx(db, DELTA_STORE, 'readwrite', (s) => s.put(existing, chunkKey));
  }

  async clearDeltas(): Promise<void> {
    const db = await this.dbPromise;
    await tx(db, DELTA_STORE, 'readwrite', (s) => s.clear());
  }
}
```

- [ ] **Step 2: Wire persistence + undo/redo into Game**

In `src/app/Game.ts`:

Add imports:
```ts
import { ChunkDeltas } from '../persistence/ChunkDeltas';
import { IndexedDbSaveStore } from '../persistence/IndexedDbSaveStore';
import { SAVE_VERSION } from '../persistence/SaveTypes';
import { UndoRedo } from '../edit/UndoRedo';
import { WorldEdits } from '../edit/WorldEdits';
```

Make `boot` async and load the save before constructing the manager. Change the signature:
```ts
  static async boot(canvas: HTMLCanvasElement): Promise<void> {
```
Right after `const registry = new BlockRegistry();`, load the save:
```ts
    const store = new IndexedDbSaveStore();
    const deltas = new ChunkDeltas();
    const meta = await store.loadMeta();
    if (!meta) {
      await store.saveMeta({ seed: SEED, version: SAVE_VERSION });
    } else if (meta.seed !== SEED || meta.version !== SAVE_VERSION) {
      console.warn('Voxel Realm: incompatible save — discarding stored edits.');
      await store.clearDeltas();
      await store.saveMeta({ seed: SEED, version: SAVE_VERSION });
    } else {
      deltas.load(await store.loadDeltas());
    }
```
Pass `deltas` into the `ChunkManager` (new last arg before options) — it currently has no
`options`, so add `deltas` as the final argument:
```ts
    const manager = new ChunkManager(
      createWorldGenerator(),
      new GreedyMesher(registry),
      registry,
      sink,
      SEED,
      OVERLAYS,
      deltas,
    );
```
Replace the editor with the persisted/undoable orchestrator. Change:
```ts
    const edit = new EditService(manager, registry, REACH);
```
to:
```ts
    const worldEdits = new WorldEdits(manager, deltas, store, new UndoRedo());
    const edit = new EditService(worldEdits, registry, REACH);
```
Add undo/redo keys inside the existing `keydown` handler (or a new listener). After the
palette `keydown` listener, add:
```ts
    window.addEventListener('keydown', (e) => {
      if (!e.ctrlKey) return;
      if (e.code === 'KeyZ' && !e.shiftKey) {
        e.preventDefault();
        worldEdits.undoEdit();
      } else if (e.code === 'KeyY' || (e.code === 'KeyZ' && e.shiftKey)) {
        e.preventDefault();
        worldEdits.redoEdit();
      }
    });
```

- [ ] **Step 3: Await boot in main**

In `src/app/main.ts`, change the call to handle the promise:
```ts
void Game.boot(canvas);
```
(If it currently is `Game.boot(canvas);`, prefix with `void` since it now returns a Promise.)

- [ ] **Step 4: Update the overlay hint**

In `index.html`, append to the `#overlay` text: ` · Ctrl+Z undo, Ctrl+Y redo`.

- [ ] **Step 5: Full gate**

Run: `npm run lint && npx vitest run && npx tsc --noEmit && npm run build`
Expected: lint clean, all tests pass, no type errors, build succeeds.

- [ ] **Step 6: Browser verification (Edgar)**

Run: `npm run dev`
**Ask Edgar to confirm:** break/place some blocks, then **reload the page** — your edits are
still there (they stream back in as chunks load). **Ctrl+Z** undoes recent edits and
**Ctrl+Y** (or Ctrl+Shift+Z) redoes them within the session. (Undo history itself does not
survive a reload — only the final world state does.)

- [ ] **Step 7: Commit**

```bash
git add src/persistence/IndexedDbSaveStore.ts src/app/Game.ts src/app/main.ts index.html
git commit -m "feat(persistence): IndexedDB save + undo/redo wiring (M1E done)"
```

---

## Self-Review

**Spec coverage (M1E scope):**
- IndexedDB stores `{seed, version}` + edit deltas keyed by chunk → `{voxelIndex: blockId}` →
  Task 1 (`ChunkDeltas`/`SaveTypes`) + Task 4 (`IndexedDbSaveStore`).
- Load chunk = generate base → apply overlays → apply deltas → Task 1 (ChunkManager generate
  pass).
- Version rule: discard stale deltas on seed/version mismatch with a warning → Task 4 (Game
  boot guard).
- Undo/redo session-only (in-memory; not persisted) → Task 2 (`UndoRedo`) + Task 3
  (`WorldEdits.undoEdit/redoEdit`).
- Persistence stores final edit deltas, not undo history → `WorldEdits.write` persists the
  resulting value; `UndoRedo` is separate and unsaved.
- Reload preserves world state but not undo history → Task 4 (boot loads deltas; UndoRedo
  starts empty).
- Pure logic stays three.js-free (`ChunkDeltas`, `UndoRedo`, `WorldEdits`, `SaveStore`/
  `MemorySaveStore`) → Tasks 1–3; only `IndexedDbSaveStore` (browser API) + Game wiring touch
  the platform.
- Out of scope: debounced writes (immediate async writes here; a later optimization).

**Placeholder scan:** No TBD/TODO. Every code step shows full code or an exact, located edit.

**Type consistency:** `SerializedDeltas` (`Record<chunkKey, Record<voxelIndex, blockId>>`) flows
`ChunkDeltas.serialize/load` ↔ `SaveStore.loadDeltas`. `WorldEditor` (from ChunkManager) is
implemented by both `ChunkManager` and `WorldEdits`, and `WorldEdits` wraps a `WorldEditor`
(the manager) so `EditService` is unchanged. `EditOp { x,y,z,prev,next }` is produced/consumed
by `UndoRedo` and `WorldEdits.write`. `ChunkManager` gains a `deltas: ChunkDeltas` param
(applied in the generate pass); the test factory and Game both pass one. `SAVE_VERSION` gates
the boot discard. `IndexedDbSaveStore` and `MemorySaveStore` both implement `SaveStore`
identically.
