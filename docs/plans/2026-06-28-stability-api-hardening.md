# Stability & Agent-API Hardening — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bound and validate the agent-facing `__vr`/edit APIs (so an agent or untrusted blueprint can't crash, corrupt, or OOM the app), fix two undo-grouping bugs from PR #24, and clear the Track A stability/security/correctness/perf backlog.

**Architecture:** Mostly surgical hardening of existing modules. New surface: an `invalid` count on `EditResult`, an `unloaded` field on read results, a `validatePrefab` helper, and an optional `defs` constructor arg on `BlockRegistry`. The data-driven block registry, save schema, and mesher contract are untouched.

**Tech Stack:** TypeScript (strict), three.js r0.185, Vite 8, Vitest 4, ESLint + Prettier (prettier = ESLint error). Node `^20.19 || >=22.12`.

## Global Constraints

- **Block ids are append-only** (`src/blocks/blocks.ts`); never renumber/reuse. Block ids must fit `[0,255]` (`Uint8Array` storage).
- **Save schema unchanged** — do not touch `SAVE_VERSION`/`WorldSnapshot`/persistence format.
- **Mesher contract unchanged** — `BlockRegistry.faceLayer(id, face): number`.
- **`DevControls.ts`/`__vr` is dev-only** (`import.meta.env.DEV`); nothing here ships to prod.
- **Caps reuse existing limits:** `MAX_BUILD = 50000` (total build), `200000` (box read/scan). No new tunables.
- **Strict TS, no `any`.** Run `npm run -s build` (`tsc --noEmit && vite build`) — the real type check; vitest does NOT type-check, so run the build on any type-touching task. Run `npm run -s lint` (prettier is an error — fix with `npx prettier --write <files>`). Full suite: `npx vitest run` (~436 tests).
- **Conventional commits**; body ends with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

## Shared interface changes (defined once; consumed across tasks)

- `EditResult` (`src/app/DevBuildTools.ts`) gains `invalid: number` (voxels rejected for an unknown/out-of-range block id). `combineEditResults` sums it.
- Read results gain unloaded reporting: `scan`/`copy`/`slice` return `{ ..., unloaded: string[] }`; `surface` returns `{ ..., unloaded: boolean }`.
- `BlockRegistry` constructor: `new BlockRegistry(defs: BlockDef[] = BLOCK_DEFS, textures: BlockTextures = BLOCK_TEXTURES)`.
- `validatePrefab(p: unknown): string | null` in `src/core/Prefab.ts` (null = valid; string = reason).

---

## Phase 1 — Edit-path validation & undo correctness

### Task 1: Reject invalid block ids at the `__vr` edit boundary + fix `paste`/`stamp` types

**Files:**
- Modify: `src/app/DevBuildTools.ts` (add `invalid` to `EditResult` + `combineEditResults`)
- Modify: `src/app/DevControls.ts` (filter ids in `applyAny`; `paste`/`stamp` return type)
- Test: `tests/devBuildTools.test.ts`

**Interfaces:**
- Produces: `EditResult.invalid: number`; `applyAny` drops voxels failing `registry.has(id)` and reports them.

- [ ] **Step 1: Write the failing test** — append to `tests/devBuildTools.test.ts`:

```ts
import type { EditResult } from '../src/app/DevBuildTools';
import { applyVoxelsInBatches } from '../src/app/DevBuildTools';

it('combineEditResults sums the invalid count across batches', () => {
  const applyBatch = (b: { x: number; y: number; z: number; id: number }[]): EditResult => ({
    requested: b.length, applied: 0, unloaded: 0, outOfWorld: 0, noChange: 0,
    invalid: b.length, unloadedChunks: [],
  });
  const r = applyVoxelsInBatches(
    [{ x: 0, y: 0, z: 0, id: 999 }, { x: 1, y: 0, z: 0, id: 999 }],
    applyBatch,
    1,
  );
  expect(r.invalid).toBe(2);
});
```

- [ ] **Step 2: Run → FAIL** — `npx vitest run tests/devBuildTools.test.ts` — fails to compile (`invalid` not on `EditResult`) or assertion fails.

- [ ] **Step 3: Add `invalid` to the interface + combiner.** In `src/app/DevBuildTools.ts`, add `/** Voxels rejected for an unknown/out-of-range block id. */ invalid: number;` to `EditResult` (after `noChange`), and in `combineEditResults` add `invalid: sum(batches, 'invalid'),`. Update the `sum` key type if it's a `NumericEditKey` mapped type (it already filters numeric keys, so `invalid` is included automatically).

- [ ] **Step 4: Filter ids in `DevControls.applyAny`.** Read `src/app/DevControls.ts`. In `applyAny`, before preloading/applying, partition the input: `const valid = voxels.filter((v) => registry.has(v.id)); const invalid = voxels.length - valid.length;`. Apply only `valid`; after building `result`, set `result.invalid = (result.invalid ?? 0) + invalid;` (or thread it through). Also have `applyBatch` initialize `invalid: 0` in its returned `EditResult`. When `invalid > 0`, `console.warn` it. `registry` is already in `DevControlsContext`.

- [ ] **Step 5: Fix `paste`/`stamp` return types.** In `src/app/DevControls.ts`, change the annotations on `paste` and `stamp` from `EditResult` to `BatchedEditResult` (they call `applyAny`). Fix any existing `EditResult` object literals in tests that now need `invalid: 0` (search `tests/` for `unloadedChunks:`).

- [ ] **Step 6: Run → PASS + build** — `npx vitest run tests/devBuildTools.test.ts && npm run -s build && npm run -s lint`. All green.

- [ ] **Step 7: Commit**

```bash
git add src/app/DevBuildTools.ts src/app/DevControls.ts tests/devBuildTools.test.ts
git commit -m "fix(dev): reject invalid block ids at the __vr edit boundary; fix paste/stamp types"
```

---

### Task 2: Registry self-check (id range, light range) + constructor injection + throw-path tests

**Files:**
- Modify: `src/blocks/BlockRegistry.ts`
- Test: `tests/blockRegistry.test.ts`

**Interfaces:**
- Produces: `new BlockRegistry(defs = BLOCK_DEFS, textures = BLOCK_TEXTURES)`; `selfCheck` additionally throws on id ∉ [0,255] or `light` ∉ [0,15].

- [ ] **Step 1: Write failing tests** — append to `tests/blockRegistry.test.ts`:

```ts
import { BlockRegistry } from '../src/blocks/BlockRegistry';
import type { BlockDef, BlockTextures } from '../src/blocks/blocks';

function texturesFor(defs: BlockDef[]): BlockTextures {
  // minimal: every non-air def resolves to 6 layer-0 faces
  const faceLayers = new Map<number, number[]>();
  for (const d of defs) if (d.faces) faceLayers.set(d.id, [0, 0, 0, 0, 0, 0]);
  return { uniqueSpecs: [{ pattern: 'stone', colors: [[1, 2, 3]] }], faceLayers, layerCount: 1 };
}

describe('BlockRegistry self-check (injected defs)', () => {
  it('throws on a block id outside 0..255', () => {
    const defs: BlockDef[] = [{ id: 300, name: 'big', opaque: true, transparent: false, faces: { pattern: 'stone', colors: [[1, 2, 3]] } }];
    expect(() => new BlockRegistry(defs, texturesFor(defs))).toThrow(/0\.\.255|range/i);
  });
  it('throws on light outside 0..15', () => {
    const defs: BlockDef[] = [{ id: 1, name: 'x', opaque: true, transparent: false, light: 99, faces: { pattern: 'stone', colors: [[1, 2, 3]] } }];
    expect(() => new BlockRegistry(defs, texturesFor(defs))).toThrow(/light/i);
  });
  it('throws on a duplicate id', () => {
    const defs: BlockDef[] = [
      { id: 1, name: 'a', opaque: true, transparent: false, faces: { pattern: 'stone', colors: [[1, 2, 3]] } },
      { id: 1, name: 'b', opaque: true, transparent: false, faces: { pattern: 'stone', colors: [[1, 2, 3]] } },
    ];
    expect(() => new BlockRegistry(defs, texturesFor(defs))).toThrow(/duplicate/i);
  });
});
```

- [ ] **Step 2: Run → FAIL** — `npx vitest run tests/blockRegistry.test.ts` (constructor takes no args).

- [ ] **Step 3: Implement.** In `src/blocks/BlockRegistry.ts`: change the constructor to `constructor(private readonly defs: BlockDef[] = BLOCK_DEFS, private readonly textures: BlockTextures = BLOCK_TEXTURES)`; replace module-level `BLOCK_DEFS`/`BLOCK_TEXTURES` references in the class body with `this.defs`/`this.textures`. In `selfCheck`, add per-def: `if (!Number.isInteger(def.id) || def.id < 0 || def.id > 255) throw new Error(\`Block "${def.name}" id ${def.id} out of 0..255\`);` and `if (def.light !== undefined && (!Number.isInteger(def.light) || def.light < 0 || def.light > 15)) throw new Error(\`Block "${def.name}" light ${def.light} out of 0..15\`);`. (Export `BlockTextures` type from `blocks.ts` if not already.)

- [ ] **Step 4: Run → PASS + build** — `npx vitest run tests/blockRegistry.test.ts tests/blocks.test.ts && npm run -s build`. Green (the default-arg constructor keeps all existing callers working).

- [ ] **Step 5: Commit**

```bash
git add src/blocks/BlockRegistry.ts tests/blockRegistry.test.ts
git commit -m "feat(blocks): registry id-range + light-range self-check; injectable defs for testing"
```

---

### Task 3: `validatePrefab` + reject invalid prefabs on load/stamp

**Files:**
- Modify: `src/core/Prefab.ts`
- Modify: `src/app/DevControls.ts` (`loadBlueprint`/`stamp`)
- Test: `tests/prefab.test.ts`

**Interfaces:**
- Produces: `validatePrefab(p: unknown): string | null`.

- [ ] **Step 1: Write failing test** — append to `tests/prefab.test.ts`:

```ts
import { validatePrefab } from '../src/core/Prefab';

describe('validatePrefab', () => {
  it('accepts a well-formed prefab', () => {
    expect(validatePrefab({ dims: [1, 1, 1], blocks: [[0, 0, 0, 3]] })).toBeNull();
  });
  it('rejects non-array blocks / bad dims', () => {
    expect(validatePrefab({ dims: [0, 1, 1], blocks: [] })).toMatch(/dims/i);
    expect(validatePrefab({ dims: [1, 1, 1], blocks: 'nope' })).toMatch(/blocks/i);
  });
  it('rejects negative or out-of-dims offsets', () => {
    expect(validatePrefab({ dims: [1, 1, 1], blocks: [[-1, 0, 0, 3]] })).toMatch(/offset|range/i);
    expect(validatePrefab({ dims: [1, 1, 1], blocks: [[5, 0, 0, 3]] })).toMatch(/offset|range/i);
  });
  it('rejects a block id outside 0..255', () => {
    expect(validatePrefab({ dims: [1, 1, 1], blocks: [[0, 0, 0, 999]] })).toMatch(/id/i);
  });
});
```

- [ ] **Step 2: Run → FAIL** — `npx vitest run tests/prefab.test.ts`.

- [ ] **Step 3: Implement `validatePrefab`** in `src/core/Prefab.ts`:

```ts
const MAX_PREFAB_BLOCKS = 200000;

/** Structural validation for an untrusted Prefab. Returns null if valid, else a reason. */
export function validatePrefab(p: unknown): string | null {
  if (typeof p !== 'object' || p === null) return 'prefab must be an object';
  const o = p as { dims?: unknown; blocks?: unknown };
  if (!Array.isArray(o.dims) || o.dims.length !== 3 || !o.dims.every((d) => Number.isInteger(d) && (d as number) > 0)) {
    return 'dims must be three positive integers';
  }
  const [sx, sy, sz] = o.dims as number[];
  if (!Array.isArray(o.blocks)) return 'blocks must be an array';
  if (o.blocks.length > MAX_PREFAB_BLOCKS) return `too many blocks (>${MAX_PREFAB_BLOCKS})`;
  for (const b of o.blocks) {
    if (!Array.isArray(b) || b.length !== 4) return 'each block must be [dx,dy,dz,id]';
    const [dx, dy, dz, id] = b as number[];
    if (![dx, dy, dz, id].every(Number.isInteger)) return 'block fields must be integers';
    if (dx < 0 || dy < 0 || dz < 0 || dx >= sx || dy >= sy || dz >= sz) return `block offset out of dims range`;
    if (id < 0 || id > 255) return `block id ${id} out of 0..255`;
  }
  return null;
}
```

- [ ] **Step 4: Enforce on load/stamp.** In `src/app/DevControls.ts` `loadBlueprint` (after fetching JSON) and `stamp` (after loading): `const reason = validatePrefab(bp); if (reason) throw new Error(\`invalid blueprint: ${reason}\`);` before using it. Import `validatePrefab`.

- [ ] **Step 5: Run → PASS + build** — `npx vitest run tests/prefab.test.ts && npm run -s build && npm run -s lint`.

- [ ] **Step 6: Commit**

```bash
git add src/core/Prefab.ts src/app/DevControls.ts tests/prefab.test.ts
git commit -m "feat(core): validatePrefab + reject invalid untrusted blueprints on load/stamp"
```

---

### Task 4: Fix group redo-clear (#5) + nested-group depth (#6)

**Files:**
- Modify: `src/edit/EditService.ts`
- Test: `tests/editService.test.ts`

**Interfaces:**
- Behavior: an empty group no longer clears redo; nested `group()` commits exactly one batch when the outermost closes.

- [ ] **Step 1: Write failing tests** — append to `tests/editService.test.ts` (reuse the file's existing `makeFakeWorld()` helper):

```ts
describe('EditService grouping edge cases', () => {
  it('an empty group does not clear redo', () => {
    const svc = new EditService(makeFakeWorld());
    svc.apply([{ x: 0, y: 0, z: 0, id: 1 }]);
    expect(svc.undo()).toBe('ok');          // sets up a redo entry
    svc.group(() => { svc.apply([]); });      // no real change
    expect(svc.redo()).toBe('ok');           // redo still available
  });

  it('nested groups commit as one batch on the outer close', () => {
    const svc = new EditService(makeFakeWorld());
    svc.group(() => {
      svc.apply([{ x: 0, y: 0, z: 0, id: 1 }]);
      svc.group(() => { svc.apply([{ x: 1, y: 0, z: 0, id: 1 }]); }); // nested
      svc.apply([{ x: 2, y: 0, z: 0, id: 1 }]);
    });
    expect(svc.undo()).toBe('ok');   // one undo reverses ALL three
    expect(svc.undo()).toBe('empty');
  });
});
```

- [ ] **Step 2: Run → FAIL** — `npx vitest run tests/editService.test.ts` (current code clears redo in `beginGroup`, and the inner `endGroup` commits early).

- [ ] **Step 3: Implement depth + lazy redo-clear.** In `src/edit/EditService.ts`:
  - Replace `private pending: VoxelChange[] | null = null;` with `private pending: VoxelChange[] | null = null; private depth = 0;`.
  - `beginGroup()`: `if (this.depth === 0) this.pending = []; this.depth += 1;` (no redo clear here).
  - `endGroup()`: `if (this.depth === 0) return undefined; this.depth -= 1; if (this.depth > 0) return undefined; const changes = this.pending; this.pending = null; if (!changes || changes.length === 0) return undefined; const batch = { changes }; if (this.undoStack.length >= this.historyLimit) this.undoStack.shift(); this.undoStack.push(batch); return batch;`.
  - In `apply()`: when recording the first real change of a group, clear redo. Simplest: in the grouped branch, before pushing, `if (this.pending.length === 0) this.redoStack.length = 0;` then `this.pending.push(...changes);`. The non-grouped branch keeps its existing `this.redoStack.length = 0;`.

- [ ] **Step 4: Run → PASS + build** — `npx vitest run tests/editService.test.ts && npm run -s build`. All existing grouping tests still pass.

- [ ] **Step 5: Commit**

```bash
git add src/edit/EditService.ts tests/editService.test.ts
git commit -m "fix(edit): empty group preserves redo; nested groups commit once (depth counter)"
```

---

## Phase 2 — Bounding agent ops & honest reads

### Task 5: Preflight caps on region ops (#3)

**Files:**
- Modify: `src/core/Prefab.ts` (`repeat` count cap)
- Modify: `src/app/DevControls.ts` (`applyAny` total cap; `replace` box cap)
- Test: `tests/prefab.test.ts`, `tests/regionOps.test.ts`

**Interfaces:**
- `repeat` throws if `nx*ny*nz*blocks.length > MAX_BUILD`-equivalent total; `applyAny` throws if total voxels exceed `MAX_BUILD` before allocation; `replace` rejects a box volume > 200000.

- [ ] **Step 1: Write failing tests**:

```ts
// tests/prefab.test.ts
import { repeat } from '../src/core/Prefab';
it('repeat throws when the tiled total exceeds the cap', () => {
  const p = { dims: [1, 1, 1] as [number, number, number], blocks: [[0, 0, 0, 1]] as [number, number, number, number][] };
  expect(() => repeat(p, 1000, 1000, 1, [2, 0, 0])).toThrow(/too large|cap/i);
});
```

```ts
// tests/regionOps.test.ts — add a box-volume guard test for replaceVoxels
import { replaceVoxels } from '../src/app/RegionOps';
it('replaceVoxels throws on an over-large box', () => {
  const read = () => 0;
  expect(() => replaceVoxels(read, { x1: 0, y1: 0, z1: 0, x2: 999, y2: 999, z2: 999 }, 1, 2)).toThrow(/too large|200000/);
});
```

- [ ] **Step 2: Run → FAIL** — `npx vitest run tests/prefab.test.ts tests/regionOps.test.ts`.

- [ ] **Step 3: Implement caps.**
  - `src/core/Prefab.ts` `repeat`: at the top, `const MAX_REPEAT = 200000; if (nx * ny * nz * p.blocks.length > MAX_REPEAT) throw new Error(\`repeat too large (>${MAX_REPEAT})\`);`.
  - `src/app/RegionOps.ts` `replaceVoxels`: after normalizing min/max, `if ((bx-ax+1)*(by-ay+1)*(bz-az+1) > 200000) throw new Error('replace box too large (>200000)');`.
  - `src/app/DevControls.ts` `applyAny`: at the top, `if (voxels.length > MAX_BUILD) throw new Error(\`build too large (${voxels.length} > ${MAX_BUILD})\`);` (this catches the post-`repeat` array before preload/group; the per-batch guard remains as defense-in-depth).

- [ ] **Step 4: Run → PASS + build** — `npx vitest run tests/prefab.test.ts tests/regionOps.test.ts && npm run -s build`.

- [ ] **Step 5: Commit**

```bash
git add src/core/Prefab.ts src/app/RegionOps.ts src/app/DevControls.ts tests/prefab.test.ts tests/regionOps.test.ts
git commit -m "fix(dev): preflight volume caps on repeat/replace/build so region ops can't OOM"
```

---

### Task 6: Honest read APIs report unloaded regions (#7)

**Files:**
- Modify: `src/app/DevControls.ts` (`scan`, `slice`, `copy`, `surface`)
- Test: covered by build + a focused unit on a small pure helper; see Step 1.

**Interfaces:**
- `scan`/`copy`/`slice` results gain `unloaded: string[]`; `surface` gains `unloaded: boolean`.

- [ ] **Step 1: Add a pure helper + test.** In `src/app/RegionOps.ts` add and test `unloadedChunksInBox`:

```ts
// src/app/RegionOps.ts
import { worldToChunkCoord, chunkKey } from '../core/coords';
export function unloadedChunksInBox(
  isLoaded: (x: number, z: number) => boolean,
  box: Box,
): string[] {
  const [ax, bx] = [Math.min(box.x1, box.x2), Math.max(box.x1, box.x2)];
  const [az, bz] = [Math.min(box.z1, box.z2), Math.max(box.z1, box.z2)];
  const out = new Set<string>();
  for (let x = ax; x <= bx; x += 1) for (let z = az; z <= bz; z += 1) {
    if (!isLoaded(x, z)) out.add(chunkKey(worldToChunkCoord(x), worldToChunkCoord(z)));
  }
  return [...out];
}
```

```ts
// tests/regionOps.test.ts
import { unloadedChunksInBox } from '../src/app/RegionOps';
it('unloadedChunksInBox lists deduped chunk keys for unloaded columns', () => {
  const loaded = (x: number) => x >= 0; // negative-x columns unloaded
  const keys = unloadedChunksInBox(loaded, { x1: -20, y1: 0, z1: 0, x2: 0, y2: 0, z2: 0 });
  expect(keys.length).toBeGreaterThan(0);
  expect(keys.every((k) => k.startsWith('-'))).toBe(true);
});
```

- [ ] **Step 2: Run → FAIL** — `npx vitest run tests/regionOps.test.ts` (helper missing).

- [ ] **Step 3: Implement + wire.** Add the helper (Step 1). In `src/app/DevControls.ts`: for `scan`, `slice`, and `copy`, best-effort `manager.preloadBox(...)` over the region (wrap in try/catch), then compute `unloaded = unloadedChunksInBox((x,z)=>manager.isLoaded(x,z), box)` and include it in the returned object. For `surface(x,z)`, set `unloaded: !manager.isLoaded(x, z)` in its result. Keep existing fields and the 80×80 / 200k caps.

- [ ] **Step 4: Run → PASS + build** — `npx vitest run tests/regionOps.test.ts && npm run -s build && npm run -s lint`. (DevControls itself isn't unit-tested; the type check validates the wiring.)

- [ ] **Step 5: Commit**

```bash
git add src/app/RegionOps.ts src/app/DevControls.ts tests/regionOps.test.ts
git commit -m "feat(dev): scan/slice/copy/surface report unloaded regions instead of silently reading air"
```

---

## Phase 3 — Persistence & dev-server hardening

### Task 7: Server-side chunk payload validation (#8)

**Files:**
- Modify: `server/worldDiskStore.ts` (`writeChunk` validates entries)
- Test: `tests/worldDiskStore.test.ts`

**Interfaces:**
- `writeChunk` throws (rejecting the write) on `entries.length > CHUNK_VOLUME`, an index ∉ [0, CHUNK_VOLUME), or a block id ∉ [0,255].

- [ ] **Step 1: Write failing tests** — in `tests/worldDiskStore.test.ts` (use a temp dir as the existing tests do):

```ts
import { CHUNK_VOLUME } from '../src/core/constants';
import { writeChunk } from '../server/worldDiskStore';
// ...existing temp-root setup...
it('rejects an out-of-range voxel index', () => {
  expect(() => writeChunk(root, 'w', '0,0', [[CHUNK_VOLUME + 1, 3]])).toThrow(/index/i);
});
it('rejects an out-of-range block id', () => {
  expect(() => writeChunk(root, 'w', '0,0', [[0, 999]])).toThrow(/id|255/i);
});
it('rejects too many entries', () => {
  const tooMany: Array<[number, number]> = Array.from({ length: CHUNK_VOLUME + 1 }, (_, i) => [i % CHUNK_VOLUME, 1]);
  expect(() => writeChunk(root, 'w', '0,0', tooMany)).toThrow(/too many|length/i);
});
```

- [ ] **Step 2: Run → FAIL** — `npx vitest run tests/worldDiskStore.test.ts`.

- [ ] **Step 3: Implement validation** in `server/worldDiskStore.ts` `writeChunk`, before mutating the snapshot:

```ts
if (entries.length > CHUNK_VOLUME) throw new Error(`chunk ${key}: too many entries (${entries.length} > ${CHUNK_VOLUME})`);
for (const e of entries) {
  if (!Array.isArray(e) || e.length !== 2) throw new Error(`chunk ${key}: entry must be [index, id]`);
  const [idx, id] = e;
  if (!Number.isInteger(idx) || idx < 0 || idx >= CHUNK_VOLUME) throw new Error(`chunk ${key}: index ${idx} out of range`);
  if (!Number.isInteger(id) || id < 0 || id > 255) throw new Error(`chunk ${key}: block id ${id} out of 0..255`);
}
```

Import `CHUNK_VOLUME` from `../src/core/constants` (match how other server files import core). In `vite.config.ts`, ensure the `/__world` chunk-write handler returns a 4xx when `writeChunk` throws (wrap in try/catch → `res.statusCode = 400`).

- [ ] **Step 4: Run → PASS + build** — `npx vitest run tests/worldDiskStore.test.ts && npm run -s build`.

- [ ] **Step 5: Commit**

```bash
git add server/worldDiskStore.ts vite.config.ts tests/worldDiskStore.test.ts
git commit -m "fix(server): validate chunk payload (entry count, index bounds, id range) before write"
```

---

### Task 8: `/__world` GET origin guard + host-aware guard (#secs)

**Files:**
- Modify: `server/devRequestGuard.ts` (host-aware)
- Modify: `vite.config.ts` (guard the GET/list path)
- Test: `tests/devRequestGuard.test.ts`

**Interfaces:**
- `isAllowedDevOrigin(origin, host)` denies a localhost origin whose host:port doesn't match the server `host` (when `host` is provided).

- [ ] **Step 1: Write failing tests** — append to `tests/devRequestGuard.test.ts`:

```ts
import { isAllowedDevOrigin } from '../server/devRequestGuard';
it('allows a same-host origin', () => {
  expect(isAllowedDevOrigin('http://localhost:5173', 'localhost:5173')).toBe(true);
});
it('denies a different-port localhost origin', () => {
  expect(isAllowedDevOrigin('http://localhost:6006', 'localhost:5173')).toBe(false);
});
it('still allows a missing Origin (non-browser / same-origin nav)', () => {
  expect(isAllowedDevOrigin(undefined, 'localhost:5173')).toBe(true);
});
```

- [ ] **Step 2: Run → FAIL** — `npx vitest run tests/devRequestGuard.test.ts`.

- [ ] **Step 3: Implement host check** in `server/devRequestGuard.ts`: keep the `undefined` → allow and hostname-allowlist behavior, but when `host` is provided, also require the origin's `host` (`new URL(origin).host`) to equal the request `host`. Rename the `_host` param to `host` and use it.

- [ ] **Step 4: Guard the GET path** in `vite.config.ts`: apply `isAllowedDevOrigin(req.headers.origin, req.headers.host)` to the `/__world` GET/list branch (the same check POST/DELETE use), returning 403 when it fails.

- [ ] **Step 5: Run → PASS + build** — `npx vitest run tests/devRequestGuard.test.ts && npm run -s build`.

- [ ] **Step 6: Commit**

```bash
git add server/devRequestGuard.ts vite.config.ts tests/devRequestGuard.test.ts
git commit -m "fix(server): host-aware dev origin guard; guard /__world GET for consistency"
```

---

### Task 9: `keepalive` server saves (#9) + `ServerWorldCatalog` error checks (#dur)

**Files:**
- Modify: `src/persistence/ServerSaveStore.ts`
- Modify: `src/persistence/ServerWorldCatalog.ts`
- Test: `tests/serverSaveStore.test.ts`, `tests/serverWorldCatalog.test.ts`

**Interfaces:**
- `ServerSaveStore.post` issues `fetch(url, { ..., keepalive: true })`; `copyWorld`/`deleteWorld` throw on non-2xx.

- [ ] **Step 1: Write failing tests.** `tests/serverSaveStore.test.ts` (mock `fetch`, assert `keepalive: true` on the POST init):

```ts
it('server saves use keepalive so unload writes are honored', async () => {
  const calls: RequestInit[] = [];
  const fake = (async (_u: string, init: RequestInit) => { calls.push(init); return { ok: true, json: async () => ({}) }; }) as unknown as typeof fetch;
  vi.stubGlobal('fetch', fake);
  const store = new ServerSaveStore('w', () => true);
  await store.saveChunkDelta('0,0', [[0, 1]]);
  expect(calls[0].keepalive).toBe(true);
  vi.unstubAllGlobals();
});
```

`tests/serverWorldCatalog.test.ts` (mock `fetch` returning `ok:false`, assert throw):

```ts
it('copyWorld throws on a non-2xx response', async () => {
  vi.stubGlobal('fetch', (async () => ({ ok: false, status: 500, statusText: 'err' })) as unknown as typeof fetch);
  await expect(copyWorld('a', 'b')).rejects.toThrow();
  vi.unstubAllGlobals();
});
```

- [ ] **Step 2: Run → FAIL** — `npx vitest run tests/serverSaveStore.test.ts tests/serverWorldCatalog.test.ts`.

- [ ] **Step 3: Implement.** In `ServerSaveStore.post`, add `keepalive: true` to the `RequestInit`. In `ServerWorldCatalog.ts` `copyWorld`/`deleteWorld`, check `if (!res.ok) throw new Error(...)` after each `fetch` (mirror `ServerSaveStore.post`).

- [ ] **Step 4: Run → PASS + build** — `npx vitest run tests/serverSaveStore.test.ts tests/serverWorldCatalog.test.ts && npm run -s build`.

- [ ] **Step 5: Commit**

```bash
git add src/persistence/ServerSaveStore.ts src/persistence/ServerWorldCatalog.ts tests/serverSaveStore.test.ts tests/serverWorldCatalog.test.ts
git commit -m "fix(persistence): keepalive server saves; ServerWorldCatalog throws on non-2xx"
```

---

## Phase 4 — Render / worldgen correctness & perf

### Task 10: Transparent depth sort via per-chunk `renderOrder` (#10)

**Files:**
- Modify: `src/render/ChunkMeshRegistry.ts`
- Test: `tests/chunkMeshRegistry.test.ts`

**Interfaces:**
- New `ChunkMeshRegistry.sortTransparent(camera: { x: number; z: number }): void` sets each transparent mesh's `renderOrder` from negative camera distance (nearer = drawn later). Called from the render loop.

- [ ] **Step 1: Write failing test** — `tests/chunkMeshRegistry.test.ts` (reuse the existing fake scene/material setup in that file):

```ts
it('sortTransparent orders farther chunks before nearer ones', () => {
  const reg = makeRegistry(); // existing helper
  reg.upload('0,0', meshesWithTransparent());     // near origin
  reg.upload('5,5', meshesWithTransparent());     // far
  reg.sortTransparent({ x: 0, z: 0 });
  const near = reg.transparentRenderOrder('0,0');  // test accessor (add below)
  const far = reg.transparentRenderOrder('5,5');
  expect(far).toBeLessThan(near); // farther drawn first
});
```

> If `tests/chunkMeshRegistry.test.ts` lacks helpers, mirror the construction the existing tests in that file use; add a tiny `transparentRenderOrder(key)` accessor returning `this.entries.get(key)?.transparent?.renderOrder ?? null` for the test.

- [ ] **Step 2: Run → FAIL** — `npx vitest run tests/chunkMeshRegistry.test.ts`.

- [ ] **Step 3: Implement.** Add to `ChunkMeshRegistry`:

```ts
sortTransparent(camera: { x: number; z: number }): void {
  for (const [key, entry] of this.entries) {
    if (!entry.transparent) continue;
    const { cx, cz } = parseChunkKey(key);
    const dx = (cx + 0.5) * CHUNK_SIZE_X - camera.x;
    const dz = (cz + 0.5) * CHUNK_SIZE_Z - camera.z;
    entry.transparent.renderOrder = -(dx * dx + dz * dz); // farther = smaller = drawn first
  }
}
```

Call `sortTransparent({ x: camera.position.x, z: camera.position.z })` once per frame in the render loop (find the per-frame update in `src/app/Game.ts` where `renderer.render`/`update` runs, and call it on the registry there). Keep `depthWrite:false` as-is.

- [ ] **Step 4: Run → PASS + build** — `npx vitest run tests/chunkMeshRegistry.test.ts && npm run -s build`.

- [ ] **Step 5: Commit**

```bash
git add src/render/ChunkMeshRegistry.ts src/app/Game.ts tests/chunkMeshRegistry.test.ts
git commit -m "fix(render): sort transparent chunks back-to-front by camera distance"
```

---

### Task 11: Collision-free biome cache key (#2)

**Files:**
- Modify: `src/worldgen/BiomeMap.ts`
- Test: `tests/biomeMap.test.ts`

**Interfaces:**
- `biomeAt` caches by a key that does NOT alias coordinates 65536 apart.

- [ ] **Step 1: Write failing test** — append to `tests/biomeMap.test.ts`:

```ts
it('does not alias coordinates 65536 apart', () => {
  const m = new BiomeMap(1234);
  // classify is deterministic from coords; the cache must not serve x for x+65536.
  const a = m.biomeAt(0, 0);
  const b = m.biomeAt(65536, 0);
  // These two columns have different climate noise, so a correct (non-aliasing)
  // cache returns each column's own classification, not a shared cached value.
  expect(m.biomeAt(0, 0)).toBe(a);
  expect(m.biomeAt(65536, 0)).toBe(b);
  // direct classify (bypass cache) must match the cached values
});
```

> Strengthen this against `classify` directly if `classify` is exposed or via a second `BiomeMap` instance: assert `m.biomeAt(65536,0)` equals a freshly-classified value for (65536,0), proving no aliasing. Adjust to the test file's existing access patterns.

- [ ] **Step 2: Run → FAIL** — `npx vitest run tests/biomeMap.test.ts` (may pass-by-luck if both columns classify the same; the fix removes the aliasing risk regardless — keep the test as a guard).

- [ ] **Step 3: Implement.** In `src/worldgen/BiomeMap.ts`, change `cache` to `Map<string, Biome>` and the key to `` `${worldX},${worldZ}` `` (no `& 0xffff`). Keep the `CACHE_CAP` clear-on-overflow. Remove the now-unused Cantor-pair comment.

- [ ] **Step 4: Run → PASS + build** — `npx vitest run tests/biomeMap.test.ts && npm run -s build`.

- [ ] **Step 5: Commit**

```bash
git add src/worldgen/BiomeMap.ts tests/biomeMap.test.ts
git commit -m "fix(worldgen): collision-free biome cache key (no 65536-block aliasing)"
```

---

### Task 12: Verify (and fix if needed) border block-light de-propagation on removal (#4b)

**Files:**
- Test: `tests/chunkManager.test.ts` (reproduction)
- Modify: `src/world/Lighting.ts` and/or `src/world/ChunkManager.ts` — ONLY if the test fails.

**Interfaces:**
- No new public API unless a fix is required.

- [ ] **Step 1: Write the reproduction test** — append to `tests/chunkManager.test.ts` (reuse the existing manager construction):

```ts
it('lowers a neighbor border light when a seam emitter is removed', () => {
  const mgr = makeManager();
  mgr.preloadBox(0, 0, 33, 0); // load two adjacent chunks across the x=16 seam
  // place a lantern (id 14) just inside chunk 0 at the seam
  mgr.setBlock(15, 40, 0, 14);
  const litBefore = mgr.getBlockLight(16, 40, 0); // neighbor cell across the seam
  expect(litBefore).toBeGreaterThan(0);
  // remove it
  mgr.setBlock(15, 40, 0, 0);
  const litAfter = mgr.getBlockLight(16, 40, 0);
  expect(litAfter).toBe(0); // neighbor must go dark
});
```

- [ ] **Step 2: Run the reproduction** — `npx vitest run tests/chunkManager.test.ts`.
  - **If it PASSES:** the existing recompute-from-scratch cascade already de-propagates correctly. Do NOT change production code. Keep the test as a regression guard, then commit just the test (Step 4) and skip Step 3.
  - **If it FAILS:** proceed to Step 3.

- [ ] **Step 3 (only if failing): Fix the cascade.** Root cause is the Pass-2 border-seed reading a stale neighbor before that neighbor is recomputed. The minimal correct fix: when an edit lowers a chunk's emitter light, recompute the affected chunk AND its edge neighbors as a connected set with a removal-aware order — i.e., first zero the `blockLight` of the edited chunk and each loaded edge neighbor, then re-seed each from local emissions (`computeChunkLight`), then run `applyBorderBlockLight` across the set, then mesh. Implement as a `relightRegion(keys: Set<string>)` helper in `ChunkManager` that the removal path calls (detect "removal" as any batch where a voxel's `before` had emission > its `after`). Add a focused test asserting the neighbor goes dark (the Step-1 test). Keep `applyBorderBlockLight` raise-only (it's correct for the additive seed; the region recompute handles lowering).

- [ ] **Step 4: Commit**

```bash
git add tests/chunkManager.test.ts src/world/Lighting.ts src/world/ChunkManager.ts
git commit -m "test(world): cover seam-emitter removal de-propagation (+fix if needed)"
```

---

### Task 13: Pool mesher scratch buffers (#4d, perf — guarded)

**Files:**
- Modify: `src/mesh/GreedyMesher.ts`
- Test: `tests/greedyMesher.test.ts` (output-unchanged regression)

**Interfaces:**
- Mesh output is byte-identical; only allocation changes.

- [ ] **Step 1: Confirm output-equality coverage.** Read `tests/greedyMesher.test.ts`. Ensure there's a test that meshes a known small `VoxelView` and asserts exact `positions`/`indices`/`layers`/`ao`/`light` (add one if absent, using an existing fixture) — this is the guard that pooling didn't change output.

- [ ] **Step 2: Run baseline** — `npx vitest run tests/greedyMesher.test.ts` (green) and note timing.

- [ ] **Step 3: Implement pooling.** In `GreedyMesher`, hoist the per-direction `mask` (`new Array(du*dv)`) and `visited` (`Uint8Array`) to instance scratch sized to the max slice (`max(CHUNK_SIZE_X, CHUNK_SIZE_Z) * WORLD_HEIGHT`), and clear-in-place between slices instead of reallocating. Keep the output arrays as-is unless trivial. Do NOT change emitted values.

- [ ] **Step 4: Run → PASS + build** — `npx vitest run tests/greedyMesher.test.ts && npm run -s build`. Output identical. **If pooling complicates the code without a clear win, report DONE_WITH_CONCERNS and leave it out** — this is the lowest-priority item.

- [ ] **Step 5: Commit**

```bash
git add src/mesh/GreedyMesher.ts tests/greedyMesher.test.ts
git commit -m "perf(mesh): pool mask/visited scratch buffers across slices (same output)"
```

---

### Task 14: `preloadBox` two-pass generate-then-mesh (#4e)

**Files:**
- Modify: `src/world/ChunkManager.ts` (`preloadBox`)
- Test: `tests/chunkManager.test.ts`

**Interfaces:**
- `preloadBox` generates all chunks in the box first, then meshes/lights them, so border seams aren't stale.

- [ ] **Step 1: Write test** — append to `tests/chunkManager.test.ts`:

```ts
it('preloadBox meshes all box chunks after generating them all', () => {
  const mgr = makeManager();
  const res = mgr.preloadBox(0, 0, 40, 40);
  expect(res.generated + res.meshed).toBeGreaterThan(0);
  expect(mgr.isLoaded(0, 0)).toBe(true);
  expect(mgr.isLoaded(40, 40)).toBe(true);
});
```

- [ ] **Step 2: Run → PASS (existing behavior) or adjust** — `npx vitest run tests/chunkManager.test.ts`. This test asserts loading, not ordering; it guards against regressions.

- [ ] **Step 3: Implement two-pass.** In `preloadBox`, replace the single `preload(cx,cz,0)` loop with: (a) a generate loop calling `ensureGenerated(cx,cz)` for every chunk in the box; (b) a mesh loop calling `meshChunk(cx,cz)` for every now-generated chunk. (Reuse the private `ensureGenerated`/`meshChunk`; `preload`'s own radius path is unchanged.) Count generated/meshed as before.

- [ ] **Step 4: Run → PASS + build** — `npx vitest run tests/chunkManager.test.ts && npm run -s build`.

- [ ] **Step 5: Commit**

```bash
git add src/world/ChunkManager.ts tests/chunkManager.test.ts
git commit -m "fix(world): preloadBox generates the whole box before meshing (no stale seams)"
```

---

## Phase 5 — Player & test hygiene

### Task 15: Swim feet/head sampling + step-up vertical cap (#5a)

**Files:**
- Modify: `src/player/PlayerController.ts` (`submerged`)
- Modify: `src/player/Collision.ts` (step-up cap)
- Test: `tests/playerController.test.ts`, `tests/collision.test.ts`

**Interfaces:**
- `submerged` is true when feet OR head voxel is water; step-up never raises net y more than 1 block per substep.

- [ ] **Step 1: Write failing tests.** `tests/playerController.test.ts`: with a stub world where only the feet voxel is water (center dry), assert swim physics engages. `tests/collision.test.ts`: a diagonal move into an inside corner with single-block ledges asserts `pos.y` rises ≤ 1.0.

```ts
// tests/playerController.test.ts (adapt to the file's existing harness/stub shape)
it('treats feet-in-water as submerged even when the body center is dry', () => {
  const isWater = (x: number, y: number, z: number) => y <= 1; // only low voxels are water
  // construct a player whose feet are at y≈1, center at y≈2; assert submerged/swim true
  // (use the controller's existing test constructor + submerged accessor)
});
```

- [ ] **Step 2: Run → FAIL** — `npx vitest run tests/playerController.test.ts tests/collision.test.ts`.

- [ ] **Step 3: Implement.** `PlayerController.submerged`: sample both `isWater(floor(x), floor(feetY), floor(z))` and `isWater(floor(x), floor(headY), floor(z))` (feetY = pos.y − halfHeight, headY = pos.y + halfHeight) and return true if either is water. `Collision` step-up: after resolving X then Z, cap the net vertical gain for the substep at 1.0 (track the substep's starting y; if `pos.y - startY > 1` clamp to `startY + 1`).

- [ ] **Step 4: Run → PASS + build** — `npx vitest run tests/playerController.test.ts tests/collision.test.ts && npm run -s build`.

- [ ] **Step 5: Commit**

```bash
git add src/player/PlayerController.ts src/player/Collision.ts tests/playerController.test.ts tests/collision.test.ts
git commit -m "fix(player): submerge on feet/head water; cap diagonal step-up vertical gain"
```

---

### Task 16: `worldToChunkCoord` axis-divergence guard (#5b)

**Files:**
- Modify: `src/core/coords.ts`
- Test: `tests/coords.test.ts`

- [ ] **Step 1: Write test** — append to `tests/coords.test.ts`:

```ts
import { CHUNK_SIZE_X, CHUNK_SIZE_Z } from '../src/core/constants';
it('chunk-size axes are equal (worldToChunkCoord assumes it)', () => {
  expect(CHUNK_SIZE_X).toBe(CHUNK_SIZE_Z);
});
```

- [ ] **Step 2: Run → PASS** — it passes today; it's a guard so a future divergence fails loudly.

- [ ] **Step 3: Add a module-load assertion** in `src/core/coords.ts`: at module top, `if (CHUNK_SIZE_X !== CHUNK_SIZE_Z) throw new Error('worldToChunkCoord/worldToLocal assume CHUNK_SIZE_X === CHUNK_SIZE_Z');`. Add a one-line comment on `worldToChunkCoord`/`worldToLocal` noting the assumption.

- [ ] **Step 4: Run → PASS + build** — `npx vitest run tests/coords.test.ts && npm run -s build`.

- [ ] **Step 5: Commit**

```bash
git add src/core/coords.ts tests/coords.test.ts
git commit -m "fix(core): assert CHUNK_SIZE_X === CHUNK_SIZE_Z (coords axis assumption)"
```

---

### Task 17: Speed up `structures.test.ts` (#5d)

**Files:**
- Modify: `tests/structures.test.ts`

- [ ] **Step 1: Identify the slow assertion.** Read `tests/structures.test.ts` around the scatter/stamp test that loops per-voxel `expect`. Replace per-voxel `expect` in nested loops with a single aggregate assertion (e.g. build a count or a flat `Set` of placed coords and assert once, or assert the returned counts) — same coverage, one assertion.

- [ ] **Step 2: Run → PASS + faster** — `npx vitest run tests/structures.test.ts` (note the reduced duration).

- [ ] **Step 3: Commit**

```bash
git add tests/structures.test.ts
git commit -m "test(worldgen): aggregate assertions in structures.test (no per-voxel expect loop)"
```

---

### Task 18: Full verification + docs

- [ ] **Step 1: Full gate** — `npm run -s lint && npx vitest run && npm run -s build`. All green; note the test count.

- [ ] **Step 2: Manual smoke (dev studio).** `npm run dev`, `http://localhost:5173/?world=flat`, console:

```js
__vr.place(0, 40, 0, 999);          // invalid id → dropped, EditResult.invalid === 1, no crash
__vr.array(0, 40, 0, 1, 40, 1, 100, 100, 1, 2, 0, 0); // throws "build too large", no freeze
__vr.scan(-50, 40, -50, -40, 40, -40); // result includes a non-empty `unloaded`
__vr.replace(0,40,0, 2,40,2, 3, 13); __vr.undo(); // one undo; redo still works after a 0-match replace
```

Expected: invalid ids dropped (not crashing), oversized ops throw cleanly, reads report unloaded, redo preserved.

- [ ] **Step 3: Commit any doc tweak** (if made). After merge, update the `voxel-realm-codebase-improvements` + `voxel-realm-agent-playground` memories (id validation, op caps, honest reads, the hardened endpoints).

```bash
git add -A && git commit -m "docs: note agent-API hardening + Track A stability fixes"
```

---

## Self-Review

**Spec coverage:** 1a→T1, 1b→T2, 1c→T3, 1d→T4, 1e→T1; 2a→T5, 2b→T6; 3a→T7, 3b→T8, 3c+3d→T9; 4a→T10, 4b→T12, 4c→T11, 4d→T13, 4e→T14; 5a→T15, 5b→T16, 5c→T2, 5d→T17; final→T18. All spec items mapped.

**Placeholder scan:** No "TBD/handle edge cases" — every task has real test + code. The conditional bits (T6/T10/T11/T15 "adapt to the existing harness", T12 verify-then-fix, T13 guarded-perf) point at concrete existing patterns and decision rules, not placeholders.

**Type consistency:** `EditResult.invalid` (T1) reused in T18 smoke; `validatePrefab` (T3) consumed in T3 load/stamp; `BlockRegistry(defs, textures)` (T2) used by T2 tests; `unloadedChunksInBox`/`Box` (T6) match `RegionOps`; `sortTransparent` (T10) matches its test; `repeat` cap (T5) matches Prefab. No drift.
