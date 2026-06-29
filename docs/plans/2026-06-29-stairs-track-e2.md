# Stairs + Per-Voxel State (Track E2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a per-voxel `state` byte (orientation) and `'stair'` blocks that render rotated to it, with the orientation persisting through save/load and undo/redo — without a `SAVE_VERSION` bump and keeping existing worlds byte-identical.

**Architecture:** A parallel `Uint8Array state` on `ChunkData` (facing + top/bottom half), threaded through deltas (packed `id|state<<8`), a backward-compatible save format (`[index,id]` or `[index,id,state]`), the edit/undo path (`SetVoxel.state`, `VoxelChange.before/afterState`), and a `'stair'` shape whose two boxes (a bottom half-box + a back upper-half box) are emitted via a generalized `emitBoxCulled`. Stairs reuse E1's `lowerHalf` collision.

**Tech Stack:** TypeScript (strict), three.js, Vitest. Builds on E1 (`shape` discriminator, `emitShaped`, `BlockRegistry.shape/occludes/collisionBox`).

## Global Constraints

- Block ids append-only ∈ [0,255]; stairs are 31–34. Next free id is **31**.
- **No `SAVE_VERSION` bump** — it stays `1`. The delta format is a backward-compatible superset (`[index,id]` = state 0, `[index,id,state]` = stateful). `resolveSaveAction` is unchanged.
- **Existing/unoriented worlds are byte-identical:** a `state===0` voxel serializes as a 2-element entry exactly as today; the cube/slab/plant render + collision paths are unchanged for `state===0`.
- Strict TS, no `any`; prettier+eslint clean (prettier violations are eslint errors); `npm run -s build` (tsc+vite) green after any type-touching task; full vitest suite green.
- `BlockRegistry.selfCheck()` still passes. Determinism unaffected (no worldgen change).
- State bit layout (canonical, documented): bits 0–1 = `facing` (0=N,1=E,2=S,3=W), bit 2 = `half` (0=bottom,1=top), bits 3–7 reserved.

## Spec

`docs/specs/2026-06-29-stairs-track-e2-design.md`. This plan implements its 7 components.

## File Structure

- `src/world/VoxelState.ts` *(new)* — `packState`/`unpackState`/facing constants/`facingFromYaw`.
- `src/world/ChunkData.ts` — add the `state` array + `getState`/`setState`.
- `src/world/ChunkManager.ts` — `cloneChunk` copies state; `applyEdits`/`updateDelta`/`applySavedDeltas`/`getChunkDelta`/`meshChunk` thread state; packed deltas.
- `src/persistence/SaveTypes.ts` — `packVoxel`/`voxelId`/`voxelState`; widen `ChunkDeltaEntries`.
- `src/persistence/WorldSnapshot.ts` — serialize/parse the superset entry; `snapshotToDeltas` packs.
- `src/persistence/IndexedDbSaveStore.ts` — `loadDeltas` packs the stored entries.
- `src/edit/EditTypes.ts` — `SetVoxel.state?`, `VoxelChange.before/afterState`.
- `src/edit/EditService.ts` — undo/redo carry state.
- `src/world/VoxelView.ts` — `getState`.
- `src/mesh/emitShaped.ts` — extract `emitBoxCulled`; add `emitStair`; route `'stair'`.
- `src/blocks/blocks.ts` — `'stair'` in `Shape`; the 4 stair blocks.
- `src/blocks/BlockRegistry.ts` — `collisionBox`: stair → `lowerHalf`.
- `src/app/input.ts` — placed stairs get a facing from yaw.
- `src/app/DevControls.ts` — `__vr.place(x,y,z,id,state?)`.

---

### Task 1: Per-voxel state — VoxelState helpers + ChunkData

**Files:**
- Create: `src/world/VoxelState.ts`
- Modify: `src/world/ChunkData.ts`
- Test: `tests/voxelState.test.ts` (new)

**Interfaces:**
- Produces: `packState(facing: number, half: number): number`, `unpackState(s): { facing: number; half: number }`, `FACING = { N:0, E:1, S:2, W:3 }`, `facingFromYaw(yaw: number): number`; `ChunkData.getState(x,y,z): number`, `ChunkData.setState(x,y,z,s): void`, `ChunkData.state: Uint8Array`.

- [ ] **Step 1: Write the failing test** — `tests/voxelState.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { packState, unpackState, FACING, facingFromYaw } from '../src/world/VoxelState';
import { ChunkData } from '../src/world/ChunkData';

describe('packState/unpackState', () => {
  it('round-trips facing + half in one byte', () => {
    for (const facing of [0, 1, 2, 3]) {
      for (const half of [0, 1]) {
        const s = packState(facing, half);
        expect(s).toBeGreaterThanOrEqual(0);
        expect(s).toBeLessThan(256);
        expect(unpackState(s)).toEqual({ facing, half });
      }
    }
  });
  it('facing occupies bits 0-1, half bit 2', () => {
    expect(packState(FACING.W, 1)).toBe(0b111); // facing 3 | half<<2
  });
});

describe('facingFromYaw', () => {
  it('maps the 4 quadrants to 4 distinct facings', () => {
    const facings = [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2].map(facingFromYaw);
    expect(new Set(facings).size).toBe(4);
    facings.forEach((f) => expect([0, 1, 2, 3]).toContain(f));
  });
  it('is stable under full-turn wrap', () => {
    expect(facingFromYaw(0.3)).toBe(facingFromYaw(0.3 + 2 * Math.PI));
  });
});

describe('ChunkData.state', () => {
  it('defaults to 0 and round-trips setState/getState', () => {
    const d = new ChunkData(0, 0);
    expect(d.getState(1, 2, 3)).toBe(0);
    d.setState(1, 2, 3, packState(FACING.E, 1));
    expect(d.getState(1, 2, 3)).toBe(packState(FACING.E, 1));
  });
  it('out-of-bounds getState reads 0', () => {
    expect(new ChunkData(0, 0).getState(-1, 0, 0)).toBe(0);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/voxelState.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/world/VoxelState.ts`**

```ts
/** Per-voxel orientation state, packed into one byte. Bits 0-1 facing, bit 2 half, 3-7 reserved. */
export const FACING = { N: 0, E: 1, S: 2, W: 3 } as const;

export function packState(facing: number, half: number): number {
  return (facing & 0b11) | ((half & 0b1) << 2);
}

export function unpackState(s: number): { facing: number; half: number } {
  return { facing: s & 0b11, half: (s >> 2) & 0b1 };
}

/**
 * Horizontal facing (N/E/S/W) the player is looking toward, from camera yaw (radians).
 * Quadrant rounding; the exact N/E/S/W assignment is confirmed visually in the live smoke.
 */
export function facingFromYaw(yaw: number): number {
  const TAU = Math.PI * 2;
  const q = Math.round(yaw / (Math.PI / 2));
  return ((q % 4) + 4) % 4;
}
```

- [ ] **Step 4: Add the state array to `src/world/ChunkData.ts`**

After the `blockLight` field declaration, add:

```ts
  /** Per-voxel orientation state (0 = unoriented). See VoxelState. */
  readonly state = new Uint8Array(CHUNK_VOLUME);
```

After the `set` method, add:

```ts
  /** Reads a voxel's orientation state; out-of-bounds returns 0. */
  getState(x: number, y: number, z: number): number {
    if (!inChunkBounds(x, y, z)) return 0;
    return this.state[voxelIndex(x, y, z)];
  }

  setState(x: number, y: number, z: number, s: number): void {
    if (!inChunkBounds(x, y, z)) {
      throw new RangeError(`ChunkData.setState out of bounds: (${x}, ${y}, ${z})`);
    }
    this.state[voxelIndex(x, y, z)] = s & 0xff;
  }
```

- [ ] **Step 5: Run the test**

Run: `npx vitest run tests/voxelState.test.ts && npm run -s build`
Expected: PASS; build green.

- [ ] **Step 6: Commit**

```bash
git add src/world/VoxelState.ts src/world/ChunkData.ts tests/voxelState.test.ts
git commit -m "feat(world): per-voxel state byte (facing/half) + VoxelState helpers"
```

---

### Task 2: Backward-compatible save (no version bump)

**Files:**
- Modify: `src/persistence/SaveTypes.ts` (packing helpers + widen `ChunkDeltaEntries`)
- Modify: `src/persistence/WorldSnapshot.ts` (serialize/parse superset, `snapshotToDeltas` packs)
- Modify: `src/persistence/IndexedDbSaveStore.ts` (`loadDeltas` packs)
- Test: `tests/saveState.test.ts` (new)

**Interfaces:**
- Consumes: nothing from Task 1 (independent).
- Produces: `packVoxel(id, state): number` (`id | state<<8`), `voxelId(v): number` (`v & 0xff`), `voxelState(v): number` (`(v >> 8) & 0xff`); `ChunkDeltaEntries = ReadonlyArray<[number, number] | [number, number, number]>`; `WorldDeltas` values are now packed voxels (`Map<string, Map<number, number>>`, value = packVoxel result). `serializeWorldSnapshot`/`parseWorldSnapshot`/`snapshotToDeltas` round-trip the superset.

- [ ] **Step 1: Write the failing test** — `tests/saveState.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { packVoxel, voxelId, voxelState } from '../src/persistence/SaveTypes';
import {
  serializeWorldSnapshot,
  parseWorldSnapshot,
  snapshotToDeltas,
} from '../src/persistence/WorldSnapshot';
import type { WorldDeltas } from '../src/persistence/SaveTypes';

describe('packVoxel', () => {
  it('round-trips id + state', () => {
    const v = packVoxel(27, 6);
    expect(voxelId(v)).toBe(27);
    expect(voxelState(v)).toBe(6);
  });
});

describe('serialize: state===0 stays a 2-element entry (byte-identical)', () => {
  it('omits state when 0, includes it when nonzero', () => {
    const deltas: WorldDeltas = new Map([['0,0', new Map([[5, packVoxel(3, 0)], [9, packVoxel(31, 6)]])]]);
    const snap = serializeWorldSnapshot(undefined, deltas);
    expect(snap.chunks['0,0']).toEqual([[5, 3], [9, 31, 6]]);
  });
});

describe('parse: accepts v1 (length 2) and v2 (length 3)', () => {
  const ok = { isValidBlockId: () => true };
  it('a v1 snapshot (all 2-element) parses with state 0', () => {
    const { snapshot } = parseWorldSnapshot({ chunks: { '0,0': [[5, 3], [6, 4]] } }, ok);
    const deltas = snapshotToDeltas(snapshot);
    const m = deltas.get('0,0')!;
    expect(voxelState(m.get(5)!)).toBe(0);
    expect(voxelId(m.get(5)!)).toBe(3);
  });
  it('a 3-element entry carries state; bad state is dropped', () => {
    const { snapshot, dropped } = parseWorldSnapshot(
      { chunks: { '0,0': [[7, 31, 6], [8, 31, 999], [9, 31, -1]] } },
      ok,
    );
    const m = snapshotToDeltas(snapshot).get('0,0')!;
    expect(voxelState(m.get(7)!)).toBe(6);
    expect(m.has(8)).toBe(false); // state 999 out of range → dropped
    expect(m.has(9)).toBe(false);
    expect(dropped).toBe(2);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/saveState.test.ts`
Expected: FAIL — `packVoxel` not exported.

- [ ] **Step 3: Add packing helpers + widen the type in `src/persistence/SaveTypes.ts`**

Replace the `ChunkDeltaEntries`/`WorldDeltas` block and add helpers:

```ts
/** A chunk's edits as stable [voxelIndex, blockId] or [voxelIndex, blockId, state] entries. */
export type ChunkDeltaEntries = ReadonlyArray<[number, number] | [number, number, number]>;

/** All chunks' edits: chunk key ("cx,cz") -> (voxelIndex -> packed voxel). */
export type WorldDeltas = Map<string, Map<number, number>>;

/** Pack a block id (0..255) + state (0..255) into one number for the in-memory delta map. */
export function packVoxel(id: number, state: number): number {
  return (id & 0xff) | ((state & 0xff) << 8);
}
export function voxelId(v: number): number {
  return v & 0xff;
}
export function voxelState(v: number): number {
  return (v >> 8) & 0xff;
}
```

- [ ] **Step 4: Update `src/persistence/WorldSnapshot.ts`**

Change `WorldSnapshot.chunks` entry type, `serializeWorldSnapshot`, `parseWorldSnapshot`, and `snapshotToDeltas`:

```ts
import { voxelId, voxelState, packVoxel } from './SaveTypes';
import type { WorldDeltas, WorldMeta } from './SaveTypes';

type Entry = [number, number] | [number, number, number];

export interface WorldSnapshot {
  meta?: WorldMeta;
  chunks: Record<string, Entry[]>;
}

export function serializeWorldSnapshot(meta: WorldMeta | undefined, deltas: WorldDeltas): WorldSnapshot {
  const chunks: Record<string, Entry[]> = {};
  for (const [key, map] of deltas) {
    const entries: Entry[] = [...map.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([index, packed]): Entry => {
        const id = voxelId(packed);
        const state = voxelState(packed);
        return state === 0 ? [index, id] : [index, id, state];
      });
    chunks[key] = entries;
  }
  return meta ? { meta, chunks } : { chunks };
}

export function snapshotToDeltas(snapshot: WorldSnapshot): WorldDeltas {
  const out: WorldDeltas = new Map();
  for (const [key, entries] of Object.entries(snapshot.chunks)) {
    out.set(key, new Map(entries.map((e) => [e[0], packVoxel(e[1], e[2] ?? 0)])));
  }
  return out;
}
```

In `parseWorldSnapshot`, replace the per-entry validation loop body (the `clean` push) so it accepts length 2 or 3 and validates an optional state:

```ts
    const clean: Entry[] = [];
    for (const entry of rawEntries) {
      if (!Array.isArray(entry) || (entry.length !== 2 && entry.length !== 3)) {
        dropped++;
        continue;
      }
      const index = entry[0];
      const id = entry[1];
      const state = entry.length === 3 ? entry[2] : 0;
      if (
        !Number.isInteger(index) ||
        index < 0 ||
        index >= CHUNK_VOLUME ||
        !Number.isInteger(id) ||
        !opts.isValidBlockId(id) ||
        !Number.isInteger(state) ||
        state < 0 ||
        state > 255
      ) {
        dropped++;
        continue;
      }
      clean.push(state === 0 ? [index, id] : [index, id, state]);
    }
```

(Change the `clean` declaration from `Array<[number, BlockId]>` to `Entry[]`, and the `chunks` record type to `Record<string, Entry[]>`. Drop the now-unused `BlockId` import if eslint flags it.)

- [ ] **Step 5: Pack in `src/persistence/IndexedDbSaveStore.ts`**

`ChunkRecord.entries` becomes the superset, and `loadDeltas` packs:

```ts
import { packVoxel } from './SaveTypes';
// ...
interface ChunkRecord {
  chunkKey: string;
  entries: Array<[number, number] | [number, number, number]>;
}
// in loadDeltas, replace `new Map(record.entries)` with:
      out.set(record.chunkKey, new Map(record.entries.map((e) => [e[0], packVoxel(e[1], e[2] ?? 0)])));
```

- [ ] **Step 6: Run the test + full suite + build**

Run: `npx vitest run tests/saveState.test.ts && npx vitest run && npm run -s build`
Expected: green. (Existing persistence tests still pass — a state-0 world serializes to the same 2-element entries.)

- [ ] **Step 7: Commit**

```bash
git add src/persistence/SaveTypes.ts src/persistence/WorldSnapshot.ts src/persistence/IndexedDbSaveStore.ts tests/saveState.test.ts
git commit -m "feat(persistence): backward-compatible [index,id,state?] deltas, packed voxels"
```

---

### Task 3: ChunkManager + EditTypes thread state

**Files:**
- Modify: `src/edit/EditTypes.ts` (`SetVoxel.state?`, `VoxelChange.before/afterState`)
- Modify: `src/world/ChunkManager.ts` (`cloneChunk`, `applyEdits`, `updateDelta`, `applySavedDeltas`, `getChunkDelta`)
- Test: `tests/chunkManagerState.test.ts` (new)

**Interfaces:**
- Consumes: `ChunkData.getState/setState` (T1), `packVoxel/voxelId/voxelState` (T2).
- Produces: `SetVoxel.state?: number`; `VoxelChange.beforeState`/`afterState`; `applyEdits` writes id+state and records packed deltas; `getChunkDelta` returns `[index, id, state?]`.

- [ ] **Step 1: Write the failing test** — `tests/chunkManagerState.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { ChunkManager } from '../src/world/ChunkManager';
import { GreedyMesher } from '../src/mesh/GreedyMesher';
import { BlockRegistry } from '../src/blocks/BlockRegistry';
import { ChunkData } from '../src/world/ChunkData';
import type { Generator } from '../src/worldgen/Generator';

const registry = new BlockRegistry();
class Flat implements Generator {
  generateBaseChunk(_s: number, cx: number, cz: number): ChunkData {
    const d = new ChunkData(cx, cz);
    for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) d.set(x, 0, z, 3); // stone floor
    return d;
  }
}
const sink = { upload: () => {}, dispose: () => {} };
function mgr() {
  const m = new ChunkManager(new Flat(), new GreedyMesher(registry), registry, sink, 1, []);
  m.preload(0, 0, 0);
  return m;
}

describe('ChunkManager state threading', () => {
  it('stores id + state and reports it in the delta', () => {
    const m = mgr();
    m.applyEdits([{ x: 1, y: 5, z: 1, id: 27, state: 6 }]); // arbitrary opaque id + state
    const delta = m.getChunkDelta('0,0');
    const entry = delta.find((e) => e[0] !== undefined && e[1] === 27);
    expect(entry).toBeDefined();
    expect(entry![2]).toBe(6); // [index, id, state]
  });
  it('an id-equal but state-different edit still counts as a change', () => {
    const m = mgr();
    m.applyEdits([{ x: 2, y: 5, z: 2, id: 27, state: 0 }]);
    const changes = m.applyEdits([{ x: 2, y: 5, z: 2, id: 27, state: 6 }]);
    expect(changes.length).toBe(1);
    expect(changes[0].beforeState).toBe(0);
    expect(changes[0].afterState).toBe(6);
  });
  it('reverting id AND state to base drops the delta', () => {
    const m = mgr();
    m.applyEdits([{ x: 3, y: 0, z: 3, id: 1, state: 4 }]); // change the floor voxel (only edit)
    m.applyEdits([{ x: 3, y: 0, z: 3, id: 3, state: 0 }]); // back to base (stone floor, state 0)
    expect(m.getChunkDelta('0,0').length).toBe(0); // delta fully cleared
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/chunkManagerState.test.ts`
Expected: FAIL — `state` not applied / `beforeState` undefined.

- [ ] **Step 3: Extend `src/edit/EditTypes.ts`**

```ts
export interface SetVoxel extends WorldVoxel {
  id: BlockId;
  /** Orientation state (0 = unoriented). */
  state?: number;
}

export interface VoxelChange extends WorldVoxel {
  before: BlockId;
  after: BlockId;
  beforeState: number;
  afterState: number;
}
```

- [ ] **Step 4: Thread state through `src/world/ChunkManager.ts`**

`cloneChunk` (bottom of file) — copy state:

```ts
function cloneChunk(chunk: ChunkData): ChunkData {
  const copy = new ChunkData(chunk.cx, chunk.cz, new Uint8Array(chunk.data));
  copy.state.set(chunk.state);
  return copy;
}
```

Add the import: `import { packVoxel, voxelId, voxelState } from '../persistence/SaveTypes';`

In `applyEdits`, replace the per-edit body (the `before`/skip/set/updateDelta/changes.push block) with:

```ts
      const lx = worldToLocal(edit.x);
      const lz = worldToLocal(edit.z);
      const before = entry.data.get(lx, edit.y, lz);
      const beforeState = entry.data.getState(lx, edit.y, lz);
      const nextState = edit.state ?? 0;
      if (before === edit.id && beforeState === nextState) continue;

      entry.data.set(lx, edit.y, lz, edit.id);
      entry.data.setState(lx, edit.y, lz, nextState);
      this.updateDelta(cx, cz, lx, edit.y, lz, edit.id, nextState);
      changes.push({
        x: edit.x,
        y: edit.y,
        z: edit.z,
        before,
        after: edit.id,
        beforeState,
        afterState: nextState,
      });
```

`updateDelta` — take state, store packed, compare both vs base:

```ts
  private updateDelta(
    cx: number,
    cz: number,
    lx: number,
    y: number,
    lz: number,
    id: BlockId,
    state: number,
  ): void {
    const key = chunkKey(cx, cz);
    const index = voxelIndex(lx, y, lz);
    const base = this.baseChunks.get(key);
    const baseId = base?.get(lx, y, lz);
    const baseState = base?.getState(lx, y, lz) ?? 0;
    let delta = this.deltas.get(key);
    if (baseId === id && baseState === state) {
      delta?.delete(index);
    } else {
      if (!delta) {
        delta = new Map();
        this.deltas.set(key, delta);
      }
      delta.set(index, packVoxel(id, state));
    }
    if (delta && delta.size === 0) this.deltas.delete(key);
  }
```

`applySavedDeltas` — write id + state:

```ts
  private applySavedDeltas(chunk: ChunkData, key: string): void {
    const delta = this.deltas.get(key);
    if (!delta) return;
    for (const [index, packed] of delta) {
      const { x, y, z } = indexToLocal(index);
      chunk.set(x, y, z, voxelId(packed));
      chunk.setState(x, y, z, voxelState(packed));
    }
  }
```

`getChunkDelta` — emit `[index, id, state?]`:

```ts
  getChunkDelta(key: string): ChunkDeltaEntries {
    return [...(this.deltas.get(key)?.entries() ?? [])]
      .sort((a, b) => a[0] - b[0])
      .map(([index, packed]): [number, number] | [number, number, number] => {
        const state = voxelState(packed);
        return state === 0 ? [index, voxelId(packed)] : [index, voxelId(packed), state];
      });
  }
```

(Update the `getChunkDelta` return type + the `onChunkDeltaChanged` signature to `ChunkDeltaEntries` if they still say `[number, BlockId]`. Import `ChunkDeltaEntries` from `../persistence/SaveTypes`.)

- [ ] **Step 5: Run the test + full suite + build**

Run: `npx vitest run tests/chunkManagerState.test.ts && npx vitest run && npm run -s build`
Expected: green.

- [ ] **Step 6: Commit**

```bash
git add src/edit/EditTypes.ts src/world/ChunkManager.ts tests/chunkManagerState.test.ts
git commit -m "feat(world): thread per-voxel state through edits, deltas, and base-revert"
```

---

### Task 4: EditService undo/redo carry state

**Files:**
- Modify: `src/edit/EditService.ts`
- Test: `tests/editServiceState.test.ts` (new)

**Interfaces:**
- Consumes: `VoxelChange.before/afterState`, `SetVoxel.state` (T3).
- Produces: undo replays `state: c.beforeState`; redo replays `state: c.afterState`.

- [ ] **Step 1: Write the failing test** — `tests/editServiceState.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { EditService } from '../src/edit/EditService';
import type { EditableWorld, SetVoxel, VoxelChange, WorldVoxel } from '../src/edit/EditTypes';

/** Minimal world: one voxel cell with id + state, recording applied edits. */
class Cell implements EditableWorld {
  id = 0;
  state = 0;
  applyEdits(edits: SetVoxel[]): VoxelChange[] {
    const out: VoxelChange[] = [];
    for (const e of edits) {
      const before = this.id;
      const beforeState = this.state;
      const after = e.id;
      const afterState = e.state ?? 0;
      if (before === after && beforeState === afterState) continue;
      this.id = after;
      this.state = afterState;
      out.push({ x: e.x, y: e.y, z: e.z, before, after, beforeState, afterState });
    }
    return out;
  }
  canApply(_v: readonly WorldVoxel[]): boolean {
    return true;
  }
}

describe('EditService undo/redo restores state', () => {
  it('undo restores the prior id AND state; redo re-applies', () => {
    const cell = new Cell();
    const svc = new EditService(cell);
    svc.apply([{ x: 0, y: 0, z: 0, id: 31, state: 6 }]);
    expect([cell.id, cell.state]).toEqual([31, 6]);
    svc.undo();
    expect([cell.id, cell.state]).toEqual([0, 0]);
    svc.redo();
    expect([cell.id, cell.state]).toEqual([31, 6]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/editServiceState.test.ts`
Expected: FAIL — after undo, `cell.state` is still 6 (undo replayed only `id`).

- [ ] **Step 3: Carry state in `src/edit/EditService.ts`**

In `undo`, the `reverseEdits` map:

```ts
    const reverseEdits: SetVoxel[] = [...batch.changes].reverse().map((c) => ({
      x: c.x,
      y: c.y,
      z: c.z,
      id: c.before,
      state: c.beforeState,
    }));
```

In `redo`, the `forwardEdits` map:

```ts
    const forwardEdits: SetVoxel[] = batch.changes.map((c) => ({
      x: c.x,
      y: c.y,
      z: c.z,
      id: c.after,
      state: c.afterState,
    }));
```

- [ ] **Step 4: Run the test + full suite**

Run: `npx vitest run tests/editServiceState.test.ts && npx vitest run`
Expected: green (existing EditService tests still pass — they don't set state, so before/afterState default through the world).

- [ ] **Step 5: Commit**

```bash
git add src/edit/EditService.ts tests/editServiceState.test.ts
git commit -m "feat(edit): undo/redo restore per-voxel orientation state"
```

---

### Task 5: `'stair'` shape — `emitBoxCulled`, `emitStair`, collision

**Files:**
- Modify: `src/world/VoxelView.ts` (`getState`)
- Modify: `src/mesh/emitShaped.ts` (extract `emitBoxCulled`; add `emitStair`; route `'stair'`)
- Modify: `src/blocks/blocks.ts` (`'stair'` in the `Shape` union)
- Modify: `src/blocks/BlockRegistry.ts` (`collisionBox`: stair → `lowerHalf`)
- Test: `tests/emitStair.test.ts` (new)

**Interfaces:**
- Consumes: `ChunkData.getState` (T1), `unpackState` (T1), E1's `pushBoxFace`/`emitShaped` plumbing.
- Produces: `VoxelView.getState(x,y,z): number`; `emitStair` emits two boxes; `registry.collisionBox(stair) === 'lowerHalf'`; `registry.occludes(stair) === false`.

- [ ] **Step 1: Write the failing test** — `tests/emitStair.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { ChunkData } from '../src/world/ChunkData';
import { VoxelView } from '../src/world/VoxelView';
import { BlockRegistry } from '../src/blocks/BlockRegistry';
import { buildBlockTextures, type BlockDef } from '../src/blocks/blocks';
import { emitShaped } from '../src/mesh/emitShaped';
import { packState, FACING } from '../src/world/VoxelState';

const stoneFaces = { pattern: 'stone' as const, colors: [[128, 128, 132] as [number, number, number]] };
const DEFS: BlockDef[] = [
  { id: 0, name: 'air', opaque: false, transparent: true },
  { id: 1, name: 'stair', opaque: true, transparent: false, shape: 'stair', faces: stoneFaces },
];
const reg = new BlockRegistry(DEFS, buildBlockTextures(DEFS));
const view = (d: ChunkData) => new VoxelView(d, () => undefined);

describe('emitStair', () => {
  it('emits two boxes (12 faces / 48 verts) for a stair in open air', () => {
    const d = new ChunkData(0, 0);
    d.set(2, 10, 2, 1);
    d.setState(2, 10, 2, packState(FACING.N, 0));
    const { slabs } = emitShaped(view(d), reg); // stairs share the opaque buffer
    expect(slabs.positions.length / 3).toBe(48); // 2 boxes × 6 faces × 4 verts (open air, nothing culled)
    let maxY = -Infinity;
    for (let i = 1; i < slabs.positions.length; i += 3) maxY = Math.max(maxY, slabs.positions[i]);
    expect(maxY).toBeCloseTo(11, 5); // the upper step reaches the voxel top
  });

  it('rotates the upper step with facing (a known vertex differs N vs E)', () => {
    const mk = (facing: number) => {
      const d = new ChunkData(0, 0);
      d.set(2, 10, 2, 1);
      d.setState(2, 10, 2, packState(facing, 0));
      return [...emitShaped(view(d), reg).slabs.positions];
    };
    expect(mk(FACING.N)).not.toEqual(mk(FACING.E));
  });
});

describe('registry stair flags', () => {
  it('stair collides as lowerHalf and does not occlude', () => {
    expect(reg.collisionBox(1)).toBe('lowerHalf');
    expect(reg.occludes(1)).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/emitStair.test.ts`
Expected: FAIL — `'stair'` not a valid `Shape`; `emitStair` absent.

- [ ] **Step 3: Add `'stair'` to the `Shape` union — `src/blocks/blocks.ts`**

```ts
export type Shape = 'cube' | 'slab' | 'cross' | 'stair';
```

Also update `isShape` in `src/blocks/BlockRegistry.ts`:

```ts
function isShape(value: string): value is Shape {
  return value === 'cube' || value === 'slab' || value === 'cross' || value === 'stair';
}
```

And `collisionBox` (add the stair case before the exhaustive end):

```ts
  collisionBox(id: BlockId): CollisionBox {
    switch (this.shape(id)) {
      case 'cube':
        return 'full';
      case 'slab':
      case 'stair':
        return 'lowerHalf';
      case 'cross':
        return 'none';
    }
  }
```

(`occludes` already returns false for any non-`'cube'` shape — no change.)

- [ ] **Step 4: Add `getState` to `src/world/VoxelView.ts`**

Mirroring `get` (center chunk only; neighbours/out-of-range read 0 — a stair reads its own voxel's state):

```ts
  /** Orientation state at a local voxel; 0 outside the center chunk or out of range. */
  getState(x: number, y: number, z: number): number {
    if (y < 0 || y >= WORLD_HEIGHT) return 0;
    const dcx = Math.floor(x / CHUNK_SIZE_X);
    const dcz = Math.floor(z / CHUNK_SIZE_Z);
    if (dcx !== 0 || dcz !== 0) return 0;
    return this.center.getState(x, y, z);
  }
```

(Import `CHUNK_SIZE_X`/`CHUNK_SIZE_Z`/`WORLD_HEIGHT` are already imported in this file.)

- [ ] **Step 5: Generalize `emitSlab` → `emitBoxCulled` and add `emitStair` in `src/mesh/emitShaped.ts`**

Replace the `emitSlab` function with a general box emitter that culls only faces sitting on a voxel boundary, then re-express the slab through it and add the stair:

```ts
/**
 * Emits one axis-aligned box [lo..hi] inside voxel (vx,vy,vz). A face is culled only when it lies
 * exactly on the voxel boundary AND the neighbour voxel in that direction is a full-cube occluder
 * (mid-voxel faces — slab tops, stair risers — are always emitted). Generalizes the slab box.
 */
function emitBoxCulled(
  buf: Buf,
  view: VoxelView,
  registry: BlockRegistry,
  id: number,
  vx: number,
  vy: number,
  vz: number,
  lo: [number, number, number],
  hi: [number, number, number],
): void {
  const vMin = [vx, vy, vz];
  const vMax = [vx + 1, vy + 1, vz + 1];
  for (const [axis, sign, face] of FACES) {
    const d = sign > 0 ? hi[axis] : lo[axis];
    const onBoundary = d === (sign > 0 ? vMax[axis] : vMin[axis]);
    const nx = vx + (axis === 0 ? sign : 0);
    const ny = vy + (axis === 1 ? sign : 0);
    const nz = vz + (axis === 2 ? sign : 0);
    if (onBoundary && registry.occludes(view.get(nx, ny, nz))) continue;
    pushBoxFace(buf, axis, sign, lo, hi, registry.faceLayer(id, face), packLight(view, nx, ny, nz));
  }
}

function emitSlab(
  buf: Buf,
  view: VoxelView,
  registry: BlockRegistry,
  id: number,
  x: number,
  y: number,
  z: number,
): void {
  emitBoxCulled(buf, view, registry, id, x, y, z, [x, y, z], [x + 1, y + 0.5, z + 1]);
}

/** The two boxes (bottom half-box + back upper-half box) of a stair, by facing + half. */
function stairBoxes(
  x: number,
  y: number,
  z: number,
  facing: number,
  half: number,
): Array<[[number, number, number], [number, number, number]]> {
  const yFullLo = half === 1 ? y + 0.5 : y;
  const yFullHi = half === 1 ? y + 1 : y + 0.5;
  const yStepLo = half === 1 ? y : y + 0.5;
  const yStepHi = half === 1 ? y + 0.5 : y + 1;
  let sx0 = x;
  let sx1 = x + 1;
  let sz0 = z;
  let sz1 = z + 1;
  if (facing === 0) sz0 = z + 0.5; // N → step on the south half
  else if (facing === 2) sz1 = z + 0.5; // S → north half
  else if (facing === 1) sx1 = x + 0.5; // E → west half
  else sx0 = x + 0.5; // W → east half
  return [
    [
      [x, yFullLo, z],
      [x + 1, yFullHi, z + 1],
    ],
    [
      [sx0, yStepLo, sz0],
      [sx1, yStepHi, sz1],
    ],
  ];
}

function emitStair(
  buf: Buf,
  view: VoxelView,
  registry: BlockRegistry,
  id: number,
  x: number,
  y: number,
  z: number,
): void {
  const { facing, half } = unpackState(view.getState(x, y, z));
  for (const [lo, hi] of stairBoxes(x, y, z, facing, half)) {
    emitBoxCulled(buf, view, registry, id, x, y, z, lo, hi);
  }
}
```

Add the import `import { unpackState } from '../world/VoxelState';` and route `'stair'` in the `emitShaped` dispatch loop (alongside `slab`/`cross`):

```ts
        if (shape === 'slab') emitSlab(slabs, view, registry, id, x, y, z);
        else if (shape === 'stair') emitStair(slabs, view, registry, id, x, y, z);
        else if (shape === 'cross') emitCross(cross, view, registry, id, x, y, z);
```

- [ ] **Step 6: Run the test + the existing slab/emitShaped tests + build**

Run: `npx vitest run tests/emitStair.test.ts tests/emitShaped.test.ts && npm run -s build`
Expected: PASS — `emitStair` counts hold AND the E1 slab tests still pass (the `emitBoxCulled` refactor is behavior-preserving for slabs: bottom/sides at voxel boundaries cull, the mid-voxel top always emits).

- [ ] **Step 7: Full suite + commit**

```bash
npx vitest run
git add src/world/VoxelView.ts src/mesh/emitShaped.ts src/blocks/blocks.ts src/blocks/BlockRegistry.ts tests/emitStair.test.ts
git commit -m "feat(mesh): 'stair' shape via emitBoxCulled + emitStair; lowerHalf collision"
```

---

### Task 6: Placement orientation

**Files:**
- Modify: `src/app/input.ts` (placed stairs get a facing from yaw)
- Modify: `src/app/DevControls.ts` (`__vr.place(x,y,z,id,state?)`)
- Test: `tests/placement.test.ts` (new — `facingFromYaw` boundary mapping; the in-game wiring is covered by the live smoke)

**Interfaces:**
- Consumes: `facingFromYaw`/`packState` (T1), `registry.shape` (E1), `SetVoxel.state` (T3).
- Produces: a placed stair carries `state = packState(facingFromYaw(yaw), 0)`; `__vr.place` accepts an optional 5th `state` arg.

- [ ] **Step 1: Write the failing test** — `tests/placement.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { facingFromYaw, packState } from '../src/world/VoxelState';

/** Pure helper the place path uses: a stair's state from the player's yaw. */
import { stairStateFromYaw } from '../src/app/placement';

describe('stairStateFromYaw', () => {
  it('packs facing from yaw with bottom half', () => {
    for (const yaw of [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2]) {
      expect(stairStateFromYaw(yaw)).toBe(packState(facingFromYaw(yaw), 0));
    }
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/placement.test.ts`
Expected: FAIL — `src/app/placement.ts` not found.

- [ ] **Step 3: Create `src/app/placement.ts`**

```ts
import { facingFromYaw, packState } from '../world/VoxelState';

/** Orientation state for a stair placed by a player looking along `yaw` (bottom half). */
export function stairStateFromYaw(yaw: number): number {
  return packState(facingFromYaw(yaw), 0);
}
```

- [ ] **Step 4: Set the state when placing a stair — `src/app/input.ts`**

At the placement call (`callbacks.onRun([{ ...hit.adjacent, id: selected }], 'Placed')`, ~line 130), set `state` when the selected block is a stair. The input handler already has `registry` and the camera rig (`rig.yaw`). Replace that line with:

```ts
        const placeState =
          registry.shape(selected) === 'stair' ? stairStateFromYaw(rig.yaw) : undefined;
        callbacks.onRun([{ ...hit.adjacent, id: selected, state: placeState }], 'Placed');
```

Add `import { stairStateFromYaw } from './placement';` (and confirm `rig` is in scope in the handler — it is used for the raycast).

- [ ] **Step 5: Add the optional state arg to `__vr.place` — `src/app/DevControls.ts`**

At `place: (x, y, z, id) => ...` (~line 421), add an optional `state`:

```ts
    place: (x: number, y: number, z: number, id: BlockId, state?: number): BatchedEditResult =>
```

and include `state` in the `SetVoxel` it builds for the edit (find where it constructs `{ x, y, z, id }` and add `state`). If it routes through a shared helper, pass `state` through to the `SetVoxel`.

- [ ] **Step 6: Run the test + full suite + build**

Run: `npx vitest run tests/placement.test.ts && npx vitest run && npm run -s build`
Expected: green.

- [ ] **Step 7: Commit**

```bash
git add src/app/placement.ts src/app/input.ts src/app/DevControls.ts tests/placement.test.ts
git commit -m "feat(app): placed stairs face the player; __vr.place accepts a state arg"
```

---

### Task 7: Content — the four stairs

**Files:**
- Modify: `src/blocks/blocks.ts` (ids 31–34)
- Test: `tests/stairContent.test.ts` (new)

**Interfaces:**
- Consumes: `Shape` `'stair'` (T5).
- Produces: `STAIRS_STONE=31`, `STAIRS_PLANK=32`, `STAIRS_COBBLE=33`, `STAIRS_BRICK=34`.

- [ ] **Step 1: Write the failing test** — `tests/stairContent.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { BlockRegistry } from '../src/blocks/BlockRegistry';
import { STAIRS_STONE, STAIRS_PLANK, STAIRS_COBBLE, STAIRS_BRICK } from '../src/blocks/blocks';

const reg = new BlockRegistry();

describe('stair content', () => {
  it('has stable ids 31-34', () => {
    expect([STAIRS_STONE, STAIRS_PLANK, STAIRS_COBBLE, STAIRS_BRICK]).toEqual([31, 32, 33, 34]);
  });
  it('all are stair-shaped, opaque, creative, lowerHalf, resolve faces', () => {
    for (const id of [STAIRS_STONE, STAIRS_PLANK, STAIRS_COBBLE, STAIRS_BRICK]) {
      expect(reg.shape(id)).toBe('stair');
      expect(reg.collisionBox(id)).toBe('lowerHalf');
      expect(reg.get(id).creative).toBe(true);
      expect(() => reg.faceLayer(id, 0)).not.toThrow();
    }
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/stairContent.test.ts`
Expected: FAIL — `STAIRS_STONE` not exported.

- [ ] **Step 3: Add the id constants in `src/blocks/blocks.ts`**

After `export const TALL_GRASS: BlockId = 30;`:

```ts
export const STAIRS_STONE: BlockId = 31;
export const STAIRS_PLANK: BlockId = 32;
export const STAIRS_COBBLE: BlockId = 33;
export const STAIRS_BRICK: BlockId = 34;
```

- [ ] **Step 4: Add the `BLOCK_DEFS` rows** (append, after `TALL_GRASS`)

```ts
  {
    id: STAIRS_STONE,
    name: 'stone stairs',
    opaque: true,
    transparent: false,
    creative: true,
    shape: 'stair',
    faces: stone([128, 128, 132]),
  },
  {
    id: STAIRS_PLANK,
    name: 'plank stairs',
    opaque: true,
    transparent: false,
    creative: true,
    shape: 'stair',
    faces: { pattern: 'planks', colors: [[165, 130, 80]] },
  },
  {
    id: STAIRS_COBBLE,
    name: 'cobblestone stairs',
    opaque: true,
    transparent: false,
    creative: true,
    shape: 'stair',
    faces: {
      pattern: 'cobble',
      colors: [
        [118, 118, 122],
        [70, 70, 74],
      ],
    },
  },
  {
    id: STAIRS_BRICK,
    name: 'brick stairs',
    opaque: true,
    transparent: false,
    creative: true,
    shape: 'stair',
    faces: {
      pattern: 'brick',
      colors: [
        [150, 70, 58],
        [198, 182, 162],
      ],
    },
  },
```

- [ ] **Step 5: Run the test + full suite + build**

Run: `npx vitest run tests/stairContent.test.ts && npx vitest run && npm run -s build`
Expected: green. (If a test asserts an exact `CREATIVE_BLOCKS`/layer count, update it to the new value and note old→new.)

- [ ] **Step 6: Commit**

```bash
git add src/blocks/blocks.ts tests/stairContent.test.ts
git commit -m "feat(blocks): stone/plank/cobble/brick stairs (ids 31-34)"
```

---

### Task 8: Final verification + docs

**Files:**
- Modify: `docs/specs/2026-06-29-stairs-track-e2-design.md` (Status → implemented)
- Test: none new — full suite + build + live smoke

- [ ] **Step 1: Lint + format + build + full suite**

Run: `npx prettier --check "src/**/*.ts" "tests/**/*.ts" && npx eslint src tests && npm run -s build && npx vitest run`
Expected: all clean/green (run `npx prettier --write` on anything flagged, re-check, commit).

- [ ] **Step 2: Live smoke (dev server + preview tools)** — verify the observable behaviour:
- Place each of the 4 stairs; place a stone stair in all 4 facings (via `__vr.place(x,y,z,31,packState(f,0))`) → 4 distinct rotations, no z-fighting on the back/sides, the tread + riser read correctly. Confirm the **player-facing** placement direction visually (tune `facingFromYaw` if the stair faces the wrong way).
- Place a top-half stair (`packState(facing,1)`) → upside-down stair.
- Walk a staircase → ascend via the bottom-step + step-up.
- **Save safety:** open an existing save (e.g. `?save=showcase` or `castle`) → it loads intact (no wipe). Place a stair, reload → the stair's orientation persists.
Capture a screenshot as proof.

- [ ] **Step 3: Update the spec status**

In `docs/specs/2026-06-29-stairs-track-e2-design.md` set `Status:` to `Implemented (PR pending)`.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "docs(specs): mark E2 stairs implemented; final verification"
```

- [ ] **Step 5: Hand off to finishing-a-development-branch**

The post-merge memory update (the state byte, stairs, `__vr.place(...,state)`) happens then.

---

## Self-Review

**Spec coverage** (7 components): 1 state storage → T1; 2 backward-compat save → T2; 3 deltas carry state → T2 (packing) + T3 (ChunkManager); 4 edit+undo carry state → T3 (EditTypes/ChunkManager) + T4 (EditService); 5 `'stair'` + mesher → T5; 6 placement orientation → T6; 7 collision + content → T5 (collisionBox) + T7 (content). ✅ Non-goals (no version bump, lowerHalf collision, no doors/fences/tint) respected.

**Type consistency:** `packState`/`unpackState`/`FACING`/`facingFromYaw` (T1) consumed by T5 (`emitStair`) + T6 (`placement`); `packVoxel`/`voxelId`/`voxelState` (T2) consumed by T3 (ChunkManager); `SetVoxel.state`/`VoxelChange.before/afterState` (T3) consumed by T4 (EditService); `ChunkDeltaEntries` superset (T2) is what `getChunkDelta` (T3) returns and the stores (T2) read; `Shape` `'stair'` (T5) consumed by T6/T7; `emitBoxCulled` (T5) reused by `emitSlab` (behavior-preserving). Consistent.

**Save-safety thread:** T2's parse accepts length-2 (v1) → state 0, serialize writes length-2 for state-0 → existing worlds load and re-serialize byte-identically; the live smoke (T8) loads a real existing save. No `SAVE_VERSION` bump anywhere.

**Placeholder scan:** every code step has full code; every test step has assertions. The one tuning note (exact `facingFromYaw` N/E/S/W assignment confirmed in the smoke) is explicit and structurally tested (4 quadrants → 4 distinct facings).
