# Interactive Fence Gate (Track E4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an openable `'gate'` block: a fence gate that toggles open/closed on right-click (a "use" action), with state-aware collision (solid closed, passable open) — reusing the E2 `state` byte's `open` bit, no save change.

**Architecture:** An `open` bit (bit 3) in the existing E2 state byte; a self-contained `'gate'` shape whose geometry (posts + a panel that spans the gap closed / swings aside open) comes from facing+open via `emitBoxCulled`; `collisionBoxFor(id,state)` makes a gate passable when open; `ChunkManager.solidBox` reads the voxel state; a context-sensitive right-click toggles a targeted gate instead of placing.

**Tech Stack:** TypeScript (strict), three.js, Vitest. Builds on E2 (state byte, `VoxelState`, `solidBox`) + E3 (`emitBoxCulled`, the shape system).

## Global Constraints

- Block ids append-only ∈ [0,255]; the gate is **38** (next free id).
- **No `SAVE_VERSION` / save-format change** — the `open` bit rides the E2 state byte, already persisted as `[index,id,state]`.
- Non-gate blocks are **byte-identical**: collision stays `collisionBox(id)` unless a block is a gate; the only `emitShaped` change is a new `'gate'` dispatch branch; the place handler is unchanged for non-toggleable targets.
- Strict TS, no `any`; prettier+eslint clean; `npm run -s build` green after type-touching tasks; full vitest suite green. `selfCheck()` passes; the `Shape` switch stays exhaustive.
- State bit layout: bits 0–1 facing, bit 2 half (stairs), **bit 3 = open (this track)**, bits 4–7 reserved.

## Spec

`docs/specs/2026-06-30-interactive-gate-track-e4-design.md`. This plan implements its 6 components.

## File Structure

- `src/world/VoxelState.ts` — `OPEN_BIT`/`isOpen`/`setOpen`/`toggleOpen`.
- `src/blocks/blocks.ts` — `'gate'` in `Shape`; the gate block (T5).
- `src/blocks/BlockRegistry.ts` — `isShape`/`collisionBox` `'gate'` case; `collisionBoxFor`; `isToggleable`.
- `src/world/ChunkManager.ts` — `solidBox` state-aware; `getState` accessor.
- `src/mesh/emitShaped.ts` — `gateBoxes` + `emitGate` + dispatch.
- `src/app/input.ts` — right-click toggles a targeted gate; places gates facing the player.
- `src/app/DevControls.ts` — `__vr.toggle(x,y,z)`.

---

### Task 1: Open-state helpers + `'gate'` shape + registry

**Files:**
- Modify: `src/world/VoxelState.ts`
- Modify: `src/blocks/blocks.ts` (`Shape`)
- Modify: `src/blocks/BlockRegistry.ts` (`isShape`, `collisionBox`, `collisionBoxFor`, `isToggleable`)
- Test: `tests/gateState.test.ts` (new)

**Interfaces:**
- Produces: `OPEN_BIT`, `isOpen(state):boolean`, `setOpen(state,open):number`, `toggleOpen(state):number`; `Shape` includes `'gate'`; `registry.collisionBoxFor(id,state):CollisionBox`; `registry.isToggleable(id):boolean`.

- [ ] **Step 1: Write the failing test** — `tests/gateState.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { OPEN_BIT, isOpen, setOpen, toggleOpen, packState, FACING } from '../src/world/VoxelState';
import { BlockRegistry } from '../src/blocks/BlockRegistry';
import { buildBlockTextures, type BlockDef } from '../src/blocks/blocks';

describe('open-state helpers', () => {
  it('OPEN_BIT is bit 3 and round-trips, preserving facing', () => {
    expect(OPEN_BIT).toBe(0b1000);
    const closed = packState(FACING.E, 0); // facing E, closed
    expect(isOpen(closed)).toBe(false);
    const opened = setOpen(closed, true);
    expect(isOpen(opened)).toBe(true);
    expect(opened & 0b11).toBe(FACING.E); // facing preserved
    expect(toggleOpen(opened)).toBe(closed); // toggle back
    expect(isOpen(toggleOpen(closed))).toBe(true);
  });
});

const planks = { pattern: 'planks' as const, colors: [[150, 116, 70] as [number, number, number]] };
const DEFS: BlockDef[] = [
  { id: 0, name: 'air', opaque: false, transparent: true },
  { id: 1, name: 'stone', opaque: true, transparent: false, faces: { pattern: 'stone', colors: [[128,128,132]] } },
  { id: 2, name: 'gate', opaque: true, transparent: false, shape: 'gate', faces: planks },
];
const reg = new BlockRegistry(DEFS, buildBlockTextures(DEFS));

describe('gate registry', () => {
  it('isToggleable only for gates; state-aware collisionBoxFor', () => {
    expect(reg.isToggleable(2)).toBe(true);
    expect(reg.isToggleable(1)).toBe(false);
    expect(reg.collisionBoxFor(2, packState(FACING.N, 0))).toBe('full');   // closed
    expect(reg.collisionBoxFor(2, setOpen(packState(FACING.N, 0), true))).toBe('none'); // open
    expect(reg.collisionBoxFor(1, 0)).toBe('full'); // non-gate ignores state
    expect(reg.collisionBox(2)).toBe('full'); // gate's stateless default = closed
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/gateState.test.ts`
Expected: FAIL — `OPEN_BIT`/`isOpen` not exported; `'gate'` not a `Shape`.

- [ ] **Step 3: Add open helpers to `src/world/VoxelState.ts`**

After `unpackState`, add:

```ts
/** The 'open' bit of the state byte (bit 3) — used by gates/doors. */
export const OPEN_BIT = 0b1000;

export function isOpen(state: number): boolean {
  return (state & OPEN_BIT) !== 0;
}
export function setOpen(state: number, open: boolean): number {
  return open ? state | OPEN_BIT : state & ~OPEN_BIT;
}
export function toggleOpen(state: number): number {
  return state ^ OPEN_BIT;
}
```

- [ ] **Step 4: Add `'gate'` to `src/blocks/blocks.ts`**

```ts
export type Shape = 'cube' | 'slab' | 'cross' | 'stair' | 'fence' | 'wall' | 'gate';
```

- [ ] **Step 5: Update `src/blocks/BlockRegistry.ts`**

Add the import: `import { isOpen } from '../world/VoxelState';`

In `isShape`, add `|| value === 'gate'`.

In `collisionBox`, add `'gate'` to the `'full'` group (closed default):

```ts
      case 'cube':
      case 'fence':
      case 'wall':
      case 'gate':
        return 'full';
```

Add `collisionBoxFor` + `isToggleable` (after `collisionBox`):

```ts
  /** State-aware collision: an open gate is passable; everything else ignores state. */
  collisionBoxFor(id: BlockId, state: number): CollisionBox {
    if (this.shape(id) === 'gate') return isOpen(state) ? 'none' : 'full';
    return this.collisionBox(id);
  }

  /** True if right-click should toggle the block's `open` state instead of placing. */
  isToggleable(id: BlockId): boolean {
    return this.shape(id) === 'gate';
  }
```

- [ ] **Step 6: Run the test + full suite + build**

Run: `npx vitest run tests/gateState.test.ts && npx vitest run && npm run -s build`
Expected: green (additive; non-gate collision via `collisionBox` unchanged).

- [ ] **Step 7: Commit**

```bash
git add src/world/VoxelState.ts src/blocks/blocks.ts src/blocks/BlockRegistry.ts tests/gateState.test.ts
git commit -m "feat(blocks): open-state helpers + 'gate' shape + state-aware collisionBoxFor"
```

---

### Task 2: State-aware `solidBox` + `getState` accessor

**Files:**
- Modify: `src/world/ChunkManager.ts` (`solidBox`, new `getState`)
- Test: `tests/gateSolidBox.test.ts` (new)

**Interfaces:**
- Consumes: `registry.collisionBoxFor` (T1), `ChunkData.getState` (E2).
- Produces: `ChunkManager.solidBox` is state-aware; `ChunkManager.getState(wx,wy,wz):number`.

- [ ] **Step 1: Write the failing test** — `tests/gateSolidBox.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { ChunkManager } from '../src/world/ChunkManager';
import { GreedyMesher } from '../src/mesh/GreedyMesher';
import { BlockRegistry } from '../src/blocks/BlockRegistry';
import { buildBlockTextures, type BlockDef } from '../src/blocks/blocks';
import { ChunkData } from '../src/world/ChunkData';
import { packState, FACING, setOpen } from '../src/world/VoxelState';
import type { Generator } from '../src/worldgen/Generator';

const planks = { pattern: 'planks' as const, colors: [[150, 116, 70] as [number, number, number]] };
const DEFS: BlockDef[] = [
  { id: 0, name: 'air', opaque: false, transparent: true },
  { id: 1, name: 'gate', opaque: true, transparent: false, shape: 'gate', faces: planks },
];
const GATE = 1;
const reg = new BlockRegistry(DEFS, buildBlockTextures(DEFS));
const sink = { upload: () => {}, dispose: () => {} };

class GateAt implements Generator {
  constructor(private readonly state: number) {}
  generateBaseChunk(_s: number, cx: number, cz: number): ChunkData {
    const d = new ChunkData(cx, cz);
    if (cx === 0 && cz === 0) {
      d.set(2, 5, 2, GATE);
      d.setState(2, 5, 2, this.state);
    }
    return d;
  }
}
function mgr(state: number) {
  const m = new ChunkManager(new GateAt(state), new GreedyMesher(reg), reg, sink, 1, []);
  m.preload(0, 0, 0);
  return m;
}

describe('state-aware solidBox', () => {
  it('a closed gate is full, an open gate is none', () => {
    expect(mgr(packState(FACING.N, 0)).solidBox(2, 5, 2)).toBe('full');
    expect(mgr(setOpen(packState(FACING.N, 0), true)).solidBox(2, 5, 2)).toBe('none');
  });
  it('getState reads the voxel state', () => {
    const open = setOpen(packState(FACING.E, 0), true);
    expect(mgr(open).getState(2, 5, 2)).toBe(open);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/gateSolidBox.test.ts`
Expected: FAIL — `solidBox` returns 'full' for the open gate (uses `collisionBox`, not state); `getState` absent.

- [ ] **Step 3: Make `solidBox` state-aware + add `getState` in `src/world/ChunkManager.ts`**

Replace the last two lines of `solidBox`:

```ts
    const id = entry.data.get(worldToLocal(wx), wy, worldToLocal(wz));
    if (!this.registry.isOpaque(id)) return 'none';
    const state = entry.data.getState(worldToLocal(wx), wy, worldToLocal(wz));
    return this.registry.collisionBoxFor(id, state);
```

Add a `getState` accessor (next to `getBlock`):

```ts
  /** Orientation/open state at a world coord; 0 for out-of-world or unloaded chunks. */
  getState(wx: number, wy: number, wz: number): number {
    if (wy < 0 || wy >= WORLD_HEIGHT) return 0;
    const entry = this.store.get(worldToChunkCoord(wx), worldToChunkCoord(wz));
    if (!entry) return 0;
    return entry.data.getState(worldToLocal(wx), wy, worldToLocal(wz));
  }
```

- [ ] **Step 4: Run the test + full suite + build**

Run: `npx vitest run tests/gateSolidBox.test.ts && npx vitest run && npm run -s build`
Expected: green. (For a state-0 non-gate, `collisionBoxFor` returns `collisionBox(id)` — existing collision unchanged; the E2 stair/slab collision tests still pass.)

- [ ] **Step 5: Commit**

```bash
git add src/world/ChunkManager.ts tests/gateSolidBox.test.ts
git commit -m "feat(world): state-aware solidBox (open gate passable) + getState accessor"
```

---

### Task 3: `emitGate` geometry

**Files:**
- Modify: `src/mesh/emitShaped.ts` (`gateBoxes` + `emitGate` + dispatch)
- Test: `tests/emitGate.test.ts` (new)

**Interfaces:**
- Consumes: `unpackState`/`isOpen` (T1), `view.getState`, the existing `emitBoxCulled`/`Buf`/`FACING`.
- Produces: `'gate'` routed from `emitShaped` to `emitGate`; emits into the opaque buffer.

- [ ] **Step 1: Write the failing test** — `tests/emitGate.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { ChunkData } from '../src/world/ChunkData';
import { VoxelView } from '../src/world/VoxelView';
import { BlockRegistry } from '../src/blocks/BlockRegistry';
import { buildBlockTextures, type BlockDef } from '../src/blocks/blocks';
import { emitShaped } from '../src/mesh/emitShaped';
import { packState, FACING, setOpen } from '../src/world/VoxelState';

const planks = { pattern: 'planks' as const, colors: [[150, 116, 70] as [number, number, number]] };
const DEFS: BlockDef[] = [
  { id: 0, name: 'air', opaque: false, transparent: true },
  { id: 1, name: 'gate', opaque: true, transparent: false, shape: 'gate', faces: planks },
];
const reg = new BlockRegistry(DEFS, buildBlockTextures(DEFS));
const view = (d: ChunkData) => new VoxelView(d, () => undefined);
function positions(state: number): number[] {
  const d = new ChunkData(0, 0);
  d.set(4, 10, 4, 1);
  d.setState(4, 10, 4, state);
  return [...emitShaped(view(d), reg).slabs.positions];
}

describe('emitGate', () => {
  it('a closed gate emits 4 boxes (2 posts + 2 rails) = 96 verts in open air', () => {
    expect(positions(packState(FACING.N, 0)).length / 3).toBe(96);
  });
  it('open geometry differs from closed', () => {
    expect(positions(setOpen(packState(FACING.N, 0), true))).not.toEqual(positions(packState(FACING.N, 0)));
  });
  it('facing changes the span axis (N differs from E)', () => {
    expect(positions(packState(FACING.N, 0))).not.toEqual(positions(packState(FACING.E, 0)));
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/emitGate.test.ts`
Expected: FAIL — gates not emitted (`positions.length === 0`).

- [ ] **Step 3: Add `gateBoxes` + `emitGate` to `src/mesh/emitShaped.ts`**

After `emitConnected` (before `emitCross`), add. Update the import line to include `isOpen`:

```ts
import { unpackState, FACING, isOpen } from '../world/VoxelState';
```

```ts
/**
 * The boxes of a fence gate. `facing` N/S → the gate spans the Z axis (posts at the z ends);
 * E/W → spans the X axis. Closed: two rails fill the gap between the posts (blocking the cross
 * passage). Open: the rails swing 90° to lie flat against the near post, clearing the gap.
 */
function gateBoxes(
  x: number,
  y: number,
  z: number,
  facing: number,
  open: boolean,
): Array<[[number, number, number], [number, number, number]]> {
  const spanZ = facing === FACING.N || facing === FACING.S;
  const boxes: Array<[[number, number, number], [number, number, number]]> = [];
  const railYs: Array<[number, number]> = [
    [0.3, 0.45],
    [0.62, 0.77],
  ];
  if (spanZ) {
    // posts at z=0 and z=1 ends, centred on x
    boxes.push([[x + 0.4, y, z], [x + 0.6, y + 1, z + 0.16]]);
    boxes.push([[x + 0.4, y, z + 0.84], [x + 0.6, y + 1, z + 1]]);
    for (const [yLo, yHi] of railYs) {
      if (open)
        // swung: rail lies along X near the z=0 post
        boxes.push([[x + 0.16, y + yLo, z], [x + 0.84, y + yHi, z + 0.16]]);
      else
        // closed: rail spans Z between the posts, centred on x
        boxes.push([[x + 0.45, y + yLo, z + 0.16], [x + 0.55, y + yHi, z + 0.84]]);
    }
  } else {
    // posts at x=0 and x=1 ends, centred on z
    boxes.push([[x, y, z + 0.4], [x + 0.16, y + 1, z + 0.6]]);
    boxes.push([[x + 0.84, y, z + 0.4], [x + 1, y + 1, z + 0.6]]);
    for (const [yLo, yHi] of railYs) {
      if (open) boxes.push([[x, y + yLo, z + 0.16], [x + 0.16, y + yHi, z + 0.84]]);
      else boxes.push([[x + 0.16, y + yLo, z + 0.45], [x + 0.84, y + yHi, z + 0.55]]);
    }
  }
  return boxes;
}

function emitGate(
  buf: Buf,
  view: VoxelView,
  registry: BlockRegistry,
  id: number,
  x: number,
  y: number,
  z: number,
): void {
  const state = view.getState(x, y, z);
  const { facing } = unpackState(state);
  for (const [lo, hi] of gateBoxes(x, y, z, facing, isOpen(state))) {
    emitBoxCulled(buf, view, registry, id, x, y, z, lo, hi);
  }
}
```

In the `emitShaped` dispatch loop, add (alongside `fence`/`wall`):

```ts
        else if (shape === 'gate') emitGate(slabs, view, registry, id, x, y, z);
```

- [ ] **Step 4: Run the test + the E1/E2/E3 mesh regressions + build**

Run: `npx vitest run tests/emitGate.test.ts tests/emitShaped.test.ts tests/emitStair.test.ts tests/emitConnected.test.ts && npm run -s build`
Expected: new test PASS; the slab/stair/fence tests still pass (only a new dispatch branch + new emitter were added).

- [ ] **Step 5: Full suite + commit**

```bash
npx vitest run
git add src/mesh/emitShaped.ts tests/emitGate.test.ts
git commit -m "feat(mesh): emitGate — fence gate posts + swing-open panel"
```

---

### Task 4: The "use" interaction (right-click toggle + `__vr.toggle`)

**Files:**
- Create: `src/app/useAction.ts` (the pure decision)
- Modify: `src/app/input.ts` (right-click toggles a targeted gate; gates placed facing the player)
- Modify: `src/app/DevControls.ts` (`__vr.toggle`)
- Test: `tests/useAction.test.ts` (new)

**Interfaces:**
- Consumes: `registry.isToggleable`/`shape` (T1), `toggleOpen`/`packState`/`facingFromYaw` (T1/E2), `ChunkManager.getState`/`getBlock` (T2), `SetVoxel.state` (E2), `stairStateFromYaw` (E2, in `src/app/placement.ts`).
- Produces: `useOrPlace(...)` decides toggle-vs-place; `__vr.toggle(x,y,z)`.

- [ ] **Step 1: Write the failing test** — `tests/useAction.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { gateToggleEdit } from '../src/app/useAction';
import { packState, FACING, isOpen, setOpen } from '../src/world/VoxelState';

describe('gateToggleEdit', () => {
  it('returns a SetVoxel flipping the open bit, same id, at the target', () => {
    const closed = packState(FACING.N, 0);
    const edit = gateToggleEdit({ x: 3, y: 4, z: 5 }, 7, closed);
    expect(edit).toEqual({ x: 3, y: 4, z: 5, id: 7, state: setOpen(closed, true) });
    expect(isOpen(edit.state!)).toBe(true);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/useAction.test.ts`
Expected: FAIL — `src/app/useAction.ts` not found.

- [ ] **Step 3: Create `src/app/useAction.ts`**

```ts
import { toggleOpen } from '../world/VoxelState';
import type { SetVoxel, WorldVoxel } from '../edit/EditTypes';

/** The edit that toggles a gate's open bit in place (same id, same position, flipped open). */
export function gateToggleEdit(target: WorldVoxel, id: number, state: number): SetVoxel {
  return { x: target.x, y: target.y, z: target.z, id, state: toggleOpen(state) };
}
```

- [ ] **Step 4: Wire the right-click handler in `src/app/input.ts`**

Replace the `e.button === 2` block (the place branch, ~line 130–135) with a toggle-or-place:

```ts
      if (e.button === 2) {
        if (registry.isToggleable(hit.id)) {
          const state = manager.getState(hit.block.x, hit.block.y, hit.block.z);
          callbacks.onRun([gateToggleEdit(hit.block, hit.id, state)], 'Toggled');
          return;
        }
        const voxel: SetVoxel = { ...hit.adjacent, id: selected };
        const shape = registry.shape(selected);
        if (shape === 'stair' || shape === 'gate') voxel.state = stairStateFromYaw(rig.yaw);
        callbacks.onRun([voxel], 'Placed');
        return;
      }
```

Add the import: `import { gateToggleEdit } from './useAction';` (and confirm `stairStateFromYaw` is already imported from `./placement` — it is, from E2). `manager` and `registry` are already in scope in this handler.

- [ ] **Step 5: Add `__vr.toggle` in `src/app/DevControls.ts`**

Near `place` (~line 421), add a `toggle` method to the `__vr` object. It reads the block + state and, if toggleable, applies the flipped-open edit via the same `edit`/batched path `place` uses:

```ts
    toggle: (x: number, y: number, z: number): BatchedEditResult | { toggled: false } => {
      const id = manager.getBlock(x, y, z);
      if (!registry.isToggleable(id)) return { toggled: false };
      const state = manager.getState(x, y, z);
      return applyEdit([{ x, y, z, id, state: toggleOpen(state) }]); // same helper place() uses
    },
```

(Use whatever the file's place() actually calls to apply a `SetVoxel[]` — find `place`'s body and reuse its edit-apply helper. Add imports `toggleOpen` from `../world/VoxelState`; `registry`/`manager` are in the dev context.)

- [ ] **Step 6: Run the test + full suite + build**

Run: `npx vitest run tests/useAction.test.ts && npx vitest run && npm run -s build`
Expected: green. (The pure `gateToggleEdit` is unit-tested; the in-game wiring + `__vr.toggle` are verified by the live smoke in Task 6.)

- [ ] **Step 7: Commit**

```bash
git add src/app/useAction.ts src/app/input.ts src/app/DevControls.ts tests/useAction.test.ts
git commit -m "feat(app): right-click 'use' toggles a gate; __vr.toggle"
```

---

### Task 5: Content — oak fence gate

**Files:**
- Modify: `src/blocks/blocks.ts` (id 38)
- Test: `tests/gateContent.test.ts` (new)

**Interfaces:**
- Consumes: `'gate'` shape (T1).
- Produces: `OAK_FENCE_GATE = 38`.

- [ ] **Step 1: Write the failing test** — `tests/gateContent.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { BlockRegistry } from '../src/blocks/BlockRegistry';
import { OAK_FENCE_GATE } from '../src/blocks/blocks';

const reg = new BlockRegistry();

describe('gate content', () => {
  it('has stable id 38, gate-shaped, toggleable, creative, faces resolve', () => {
    expect(OAK_FENCE_GATE).toBe(38);
    expect(reg.shape(OAK_FENCE_GATE)).toBe('gate');
    expect(reg.isToggleable(OAK_FENCE_GATE)).toBe(true);
    expect(reg.collisionBox(OAK_FENCE_GATE)).toBe('full');
    expect(reg.get(OAK_FENCE_GATE).creative).toBe(true);
    expect(() => reg.faceLayer(OAK_FENCE_GATE, 0)).not.toThrow();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/gateContent.test.ts`
Expected: FAIL — `OAK_FENCE_GATE` not exported.

- [ ] **Step 3: Add the id + `BLOCK_DEFS` row in `src/blocks/blocks.ts`**

After `export const STONEBRICK_WALL: BlockId = 37;`:

```ts
export const OAK_FENCE_GATE: BlockId = 38;
```

Append to `BLOCK_DEFS` (after `STONEBRICK_WALL`):

```ts
  {
    id: OAK_FENCE_GATE,
    name: 'oak fence gate',
    opaque: true,
    transparent: false,
    creative: true,
    shape: 'gate',
    faces: { pattern: 'planks', colors: [[150, 116, 70]] },
  },
```

- [ ] **Step 4: Run the test + full suite + build**

Run: `npx vitest run tests/gateContent.test.ts && npx vitest run && npm run -s build`
Expected: green. (If a test asserts an exact `TEXTURE_LAYER_COUNT`/`CREATIVE_BLOCKS` count, update old→new and report; prior tracks used dynamic assertions, so likely none.)

- [ ] **Step 5: Commit**

```bash
git add src/blocks/blocks.ts tests/gateContent.test.ts
git commit -m "feat(blocks): oak fence gate (id 38)"
```

---

### Task 6: Final verification + docs

**Files:**
- Modify: `docs/specs/2026-06-30-interactive-gate-track-e4-design.md` (Status → implemented)
- Test: none new — full suite + build + live smoke

- [ ] **Step 1: Lint + format + build + full suite**

Run: `npx prettier --check "src/**/*.ts" "tests/**/*.ts" && npx eslint src tests && npm run -s build && npx vitest run`
Expected: all clean/green (run `npx prettier --write` on anything flagged, re-check, commit).

- [ ] **Step 2: Live smoke (dev server + preview tools)** — verify the observable behaviour (use a throwaway `?save=<name>&world=flat`; do not touch real saves):
- Place an `OAK_FENCE_GATE` (38) between two oak fences → it renders as a gate panel spanning the gap.
- `__vr.toggle(x,y,z)` on the gate → geometry changes to open; toggle again → closed. Confirm `manager.solidBox` (via a closed vs open placement) reports `'full'` then `'none'`.
- Reload the save → the gate's open/closed state persists.
Capture a screenshot as proof.

- [ ] **Step 3: Update the spec status**

In `docs/specs/2026-06-30-interactive-gate-track-e4-design.md` set `Status:` to `Implemented (PR pending)`.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "docs(specs): mark E4 fence gate implemented; final verification"
```

- [ ] **Step 5: Hand off to finishing-a-development-branch**

Post-merge memory update (the open bit, the use/toggle action, state-aware collision, the gate) happens then.

---

## Self-Review

**Spec coverage** (6 components): 1 open helpers → T1; 2 `'gate'` shape + registry → T1; 3 state-aware collision → T1 (`collisionBoxFor`) + T2 (`solidBox`); 4 `emitGate` → T3; 5 use interaction → T4; 6 content → T5. ✅ Non-goals (no trapdoors/2-tall doors, no save change, instant toggle) respected.

**Type consistency:** `OPEN_BIT`/`isOpen`/`setOpen`/`toggleOpen` (T1) consumed by `collisionBoxFor` (T1), `emitGate` (T3), `gateToggleEdit`/`__vr.toggle` (T4); `Shape` `'gate'` (T1) consumed by T2/T3/T4/T5; `collisionBoxFor` (T1) consumed by `solidBox` (T2); `ChunkManager.getState` (T2) consumed by the input handler + `__vr.toggle` (T4); `gateToggleEdit(target,id,state)` (T4) used in `input.ts`. Consistent.

**No-save-change:** the `open` bit is bit 3 of the existing E2 state byte, already serialized as `[index,id,state]`; no persistence file is touched. Existing-world byte-identicality holds (gate is a new id; non-gate collision via `collisionBox` unchanged; `collisionBoxFor` returns `collisionBox(id)` for state-0 non-gates).

**Placeholder scan:** every code step has full code; every test step has assertions. The one "find the actual edit-apply helper `place()` uses" note in T4 Step 5 is a precise instruction (read `place`'s body), not a vague placeholder — the surrounding code shows exactly what to reuse.
