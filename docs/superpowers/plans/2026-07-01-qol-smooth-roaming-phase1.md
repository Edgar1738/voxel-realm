# Phase 1 QoL: Targeting Overlay + Wheel Hotbar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a live in-world targeting outline + translucent placement ghost and mouse-wheel hotbar cycling, without touching the chunk streaming/meshing core, while keeping roaming smooth.

**Architecture:** A single pure `resolveTarget()` decides — from a raycast hit — whether the interaction is a *toggle* (gate/use) or a *place*, and where the outline/ghost go. Both the actual click path (`input.ts` right-click) and the per-frame preview call it, so preview and action can never disagree. Rendering uses two persistent, reusable three.js overlays (one `LineSegments` outline, one translucent `Mesh` ghost) that are only moved/toggled per frame — never allocated or disposed. Wheel cycling reuses the existing edit-gate predicate and a new pure wrap helper.

**Tech Stack:** TypeScript, three.js, Vitest, Vite.

## Global Constraints

- Pinned base: `main` / `origin/main` at `3748a8f`. Work in the worktree `.claude/worktrees/feat+qol-core` (branch `worktree-feat+qol-core`). Never edit the primary checkout.
- Do NOT touch chunk streaming/meshing internals (`ChunkManager` streaming loop, `GreedyMesher`, `buildChunkMesh`, `ChunkMeshRegistry` geometry pipeline). Reading public methods is fine.
- Do NOT use `OutlinePass` / postprocessing. Do NOT allocate or dispose three.js meshes/materials every frame.
- Do NOT add: inventory categories, inventory search, builder-tools UI, Web Worker meshing (P6), save-format or block-id changes, worldgen changes.
- Preserve existing behavior: `E` toggles inventory, `Esc` closes it, number keys 1-9 select hotbar, middle-click pick-block, edit-gate blocks edits while inventory open.
- Ghost validity MUST use the same loaded/in-range check the edit path uses (`ChunkManager.canApply`), so the ghost never promises an edit `applyEdits` would silently drop.
- Invalid state must NOT rely on color alone (also use opacity + wireframe).
- No status-toast spam from preview or rapid wheel movement (preview never calls `onStatusChange`; wheel only re-renders the hotbar).
- Verification gate for every code task: `npx tsc --noEmit` and `npx vitest run` green. Final gate also runs `npm run lint` and `npm run build`.

---

## File Structure

- **Create** `src/app/targetPreview.ts` — pure `resolveTarget()` + `PreviewDeps` type + `ResolvedTarget` union. No three.js, no imports of ChunkManager/BlockRegistry (deps injected).
- **Create** `tests/targetPreview.test.ts` — unit tests for the resolver.
- **Create** `src/render/TargetOverlay.ts` — reusable outline + ghost scene overlays.
- **Create** `tests/targetOverlay.test.ts` — construction + apply()/visibility logic (three.js objects instantiate fine under jsdom for property checks).
- **Modify** `src/app/input.ts` — export `REACH`; add `previewDeps` to `InputContext`; route right-click through `resolveTarget`; add `hotbarWheelDelta` helper + `wheel` listener.
- **Modify** `src/app/CreativeInventory.ts` — add pure `cycleSlot(delta)` with wraparound.
- **Modify** `src/app/Game.ts` — build `previewDeps` once, pass to `registerInputListeners`, create `TargetOverlay`, drive per-frame preview in the render loop.
- **Modify** `tests/creativeInventory.test.ts` — `cycleSlot` wraparound tests.
- **Modify** `tests/inputHelpers.test.ts` — `hotbarWheelDelta` tests.

---

## Task 1: Pure `resolveTarget` helper + route the click path through it

**Files:**
- Create: `src/app/targetPreview.ts`
- Create: `tests/targetPreview.test.ts`
- Modify: `src/app/input.ts` (imports; `InputContext`; `REACH` export; right-click branch ~140-151)
- Modify: `src/app/Game.ts` (build `previewDeps`, pass into `registerInputListeners` ~203-224)

**Interfaces:**
- Consumes: `VoxelRaycastHit` from `src/edit/VoxelRaycast.ts` (`{ block, adjacent, normal, id }`); `BlockId` from `src/core/types`.
- Produces:
  - `interface PreviewDeps { isToggleable(id: BlockId): boolean; shapeOf(id: BlockId): string; stateFromYaw(yaw: number): number; canPlaceAt(x: number, y: number, z: number): boolean; }`
  - `type ResolvedTarget = { kind: 'toggle'; outline: {x:number;y:number;z:number}; targetId: BlockId } | { kind: 'place'; outline: {x:number;y:number;z:number}; ghost: {x:number;y:number;z:number;id:BlockId;state:number;valid:boolean} }`
  - `function resolveTarget(hit: VoxelRaycastHit, selected: BlockId, yaw: number, deps: PreviewDeps): ResolvedTarget`
  - `export const REACH = 6` (moved from private const in `input.ts`).

- [ ] **Step 1: Write the failing test**

Create `tests/targetPreview.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { resolveTarget, type PreviewDeps } from '../src/app/targetPreview';
import type { VoxelRaycastHit } from '../src/edit/VoxelRaycast';

const CUBE = 1 as const;
const STAIR = 2 as const;
const GATE = 3 as const;
const PLANT = 4 as const;

function hit(id: number, block = { x: 5, y: 6, z: 7 }, adjacent = { x: 5, y: 7, z: 7 }): VoxelRaycastHit {
  return { block, adjacent, normal: { x: 0, y: 1, z: 0 }, id: id as never };
}

const deps: PreviewDeps = {
  isToggleable: (id) => id === GATE,
  shapeOf: (id) => (id === STAIR ? 'stair' : id === GATE ? 'gate' : id === PLANT ? 'cross' : 'cube'),
  stateFromYaw: () => 3,
  canPlaceAt: (x) => x >= 0, // simulate unloaded/out-of-range when x < 0
};

describe('resolveTarget', () => {
  it('normal adjacent placement: outline on target, valid ghost on adjacent', () => {
    const r = resolveTarget(hit(CUBE), CUBE as never, 0, deps);
    expect(r.kind).toBe('place');
    expect(r.outline).toEqual({ x: 5, y: 6, z: 7 });
    if (r.kind === 'place') {
      expect(r.ghost).toEqual({ x: 5, y: 7, z: 7, id: CUBE, state: 0, valid: true });
    }
  });

  it('toggleable target (gate) resolves to toggle with outline and no ghost', () => {
    const r = resolveTarget(hit(GATE), CUBE as never, 0, deps);
    expect(r.kind).toBe('toggle');
    expect(r.outline).toEqual({ x: 5, y: 6, z: 7 });
    if (r.kind === 'toggle') expect(r.targetId).toBe(GATE);
  });

  it('stair/gate selected block gets yaw-derived state', () => {
    const r = resolveTarget(hit(CUBE), STAIR as never, 1.2, deps);
    if (r.kind === 'place') expect(r.ghost.state).toBe(3);
  });

  it('unloaded/out-of-range adjacent target is marked invalid, not hidden', () => {
    const r = resolveTarget(hit(CUBE, { x: 5, y: 6, z: 7 }, { x: -1, y: 7, z: 7 }), CUBE as never, 0, deps);
    if (r.kind === 'place') {
      expect(r.ghost.valid).toBe(false);
      expect(r.ghost).toMatchObject({ x: -1, y: 7, z: 7 });
    }
  });

  it('zero-collision block (plant) still yields a usable outline + ghost', () => {
    const r = resolveTarget(hit(PLANT), PLANT as never, 0, deps);
    expect(r.kind).toBe('place');
    if (r.kind === 'place') expect(r.ghost.valid).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/targetPreview.test.ts`
Expected: FAIL — cannot resolve `../src/app/targetPreview`.

- [ ] **Step 3: Write minimal implementation**

Create `src/app/targetPreview.ts`:

```ts
import type { VoxelRaycastHit } from '../edit/VoxelRaycast';
import type { BlockId } from '../core/types';

/** Runtime dependencies the pure resolver needs, injected so it stays testable. */
export interface PreviewDeps {
  /** Right-clicking this block id resolves to a toggle/use, not a placement. */
  isToggleable(id: BlockId): boolean;
  /** Shape name of a block id ('cube' | 'slab' | 'stair' | 'gate' | 'cross' | ...). */
  shapeOf(id: BlockId): string;
  /** Orientation/open state derived from the player yaw (for stairs/gates). */
  stateFromYaw(yaw: number): number;
  /** Whether an edit at (x,y,z) would land in a loaded, in-range chunk (mirrors the edit path). */
  canPlaceAt(x: number, y: number, z: number): boolean;
}

/** The interaction a hit resolves to, shared by the click path and the live preview. */
export type ResolvedTarget =
  | { kind: 'toggle'; outline: { x: number; y: number; z: number }; targetId: BlockId }
  | {
      kind: 'place';
      outline: { x: number; y: number; z: number };
      ghost: { x: number; y: number; z: number; id: BlockId; state: number; valid: boolean };
    };

/**
 * Decides what a hit means: right-clicking a toggleable block is a use/toggle (outline only),
 * otherwise it is a placement at the adjacent cell (outline + ghost). The ghost carries the
 * yaw-derived state for stairs/gates and a `valid` flag from `canPlaceAt`. Pure and deterministic.
 */
export function resolveTarget(
  hit: VoxelRaycastHit,
  selected: BlockId,
  yaw: number,
  deps: PreviewDeps,
): ResolvedTarget {
  const outline = { x: hit.block.x, y: hit.block.y, z: hit.block.z };
  if (deps.isToggleable(hit.id)) {
    return { kind: 'toggle', outline, targetId: hit.id };
  }
  const shape = deps.shapeOf(selected);
  const state = shape === 'stair' || shape === 'gate' ? deps.stateFromYaw(yaw) : 0;
  const g = hit.adjacent;
  return {
    kind: 'place',
    outline,
    ghost: { x: g.x, y: g.y, z: g.z, id: selected, state, valid: deps.canPlaceAt(g.x, g.y, g.z) },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/targetPreview.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Route the actual right-click path through the resolver**

In `src/app/input.ts`:

1. Change the private reach constant to an export. Replace:
```ts
const REACH = 6;
```
with:
```ts
export const REACH = 6;
```

2. Add imports at the top (next to the existing `./useAction` import):
```ts
import { resolveTarget, type PreviewDeps } from './targetPreview';
```

3. Add `previewDeps` to `InputContext`:
```ts
export interface InputContext {
  canvas: HTMLCanvasElement;
  rig: CameraRig;
  renderer: Renderer;
  manager: ChunkManager;
  inventory: CreativeInventory;
  registry: BlockRegistry;
  edit: EditService;
  previewDeps: PreviewDeps;
  callbacks: InputCallbacks;
}
```

4. Destructure it in `registerInputListeners`:
```ts
  const { canvas, rig, renderer, manager, inventory, registry, edit, previewDeps, callbacks } = ctx;
```

5. Replace the entire `if (e.button === 2) { ... }` block (currently building the place voxel inline) with:
```ts
      if (e.button === 2) {
        const resolved = resolveTarget(hit, selected, rig.yaw, previewDeps);
        if (resolved.kind === 'toggle') {
          const state = manager.getState(hit.block.x, hit.block.y, hit.block.z);
          callbacks.onRun([gateToggleEdit(hit.block, hit.id, state)], 'Toggled');
          return;
        }
        const voxel: SetVoxel = {
          x: resolved.ghost.x,
          y: resolved.ghost.y,
          z: resolved.ghost.z,
          id: resolved.ghost.id,
          state: resolved.ghost.state,
        };
        callbacks.onRun([voxel], 'Placed');
        return;
      }
```

Note: `stairStateFromYaw` is still imported for `previewDeps` construction in `Game.ts`; if `input.ts` no longer references `stairStateFromYaw` directly, remove its now-unused import to keep lint green (verify with tsc/lint in Step 7).

- [ ] **Step 6: Build `previewDeps` in Game.ts and pass it in**

In `src/app/Game.ts`:

1. Add imports near the existing `./input` and `./placement` imports:
```ts
import { stairStateFromYaw } from './placement';
import type { PreviewDeps } from './targetPreview';
```
(If `./placement`'s `stairStateFromYaw` is already imported, do not duplicate.)

2. Immediately before `const abortInput = registerInputListeners({` (line ~203), construct the deps:
```ts
    const previewDeps: PreviewDeps = {
      isToggleable: (id) => registry.isToggleable(id),
      shapeOf: (id) => registry.shape(id),
      stateFromYaw: (yaw) => stairStateFromYaw(yaw),
      canPlaceAt: (x, y, z) => manager.canApply([{ x, y, z }]),
    };
```

3. Add `previewDeps,` to the `registerInputListeners({ ... })` context object (alongside `edit,`).

- [ ] **Step 7: Verify the whole suite + types are green**

Run: `npx tsc --noEmit && npx vitest run`
Expected: tsc clean; all tests pass (existing 699 + 5 new). Behavior of right-click place/toggle is unchanged.

- [ ] **Step 8: Commit**

```bash
git add src/app/targetPreview.ts tests/targetPreview.test.ts src/app/input.ts src/app/Game.ts
git commit -m "feat(edit): shared pure resolveTarget for click path (preview foundation)"
```

---

## Task 2: Reusable outline + ghost overlays wired into the frame loop

**Files:**
- Create: `src/render/TargetOverlay.ts`
- Create: `tests/targetOverlay.test.ts`
- Modify: `src/app/Game.ts` (create overlay before `renderer.start`; update inside the loop after `manager.update`, ~238-245)

**Interfaces:**
- Consumes: `ResolvedTarget` from `src/app/targetPreview.ts`; `resolveTarget`, `REACH` (from `input.ts`); `raycastVoxels` from `src/edit/VoxelRaycast.ts`; `renderer.add`, `renderer.camera.position`, `rig.forward()`, `rig.yaw`, `rig.locked`, `inventory.selectedBlock`, `ui.isInventoryOpen()`, `manager.getBlock` (all already in `Game.boot` scope).
- Produces: `class TargetOverlay { readonly outline: LineSegments; readonly ghost: Mesh; attach(add: (o: Object3D) => void): void; apply(resolved: ResolvedTarget | undefined, show: boolean): void }`.

- [ ] **Step 1: Write the failing test**

Create `tests/targetOverlay.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { TargetOverlay } from '../src/render/TargetOverlay';
import type { ResolvedTarget } from '../src/app/targetPreview';

const placeValid: ResolvedTarget = {
  kind: 'place',
  outline: { x: 2, y: 3, z: 4 },
  ghost: { x: 2, y: 4, z: 4, id: 1 as never, state: 0, valid: true },
};
const placeInvalid: ResolvedTarget = { ...placeValid, ghost: { ...placeValid.ghost, valid: false } };
const toggle: ResolvedTarget = { kind: 'toggle', outline: { x: 2, y: 3, z: 4 }, targetId: 3 as never };

describe('TargetOverlay', () => {
  it('starts hidden', () => {
    const o = new TargetOverlay();
    expect(o.outline.visible).toBe(false);
    expect(o.ghost.visible).toBe(false);
  });

  it('attach() adds both overlays exactly once', () => {
    const o = new TargetOverlay();
    const added: unknown[] = [];
    o.attach((obj) => added.push(obj));
    expect(added).toContain(o.outline);
    expect(added).toContain(o.ghost);
    expect(added).toHaveLength(2);
  });

  it('place: outline + ghost visible and centered on their voxels', () => {
    const o = new TargetOverlay();
    o.apply(placeValid, true);
    expect(o.outline.visible).toBe(true);
    expect(o.ghost.visible).toBe(true);
    expect([o.outline.position.x, o.outline.position.y, o.outline.position.z]).toEqual([2.5, 3.5, 4.5]);
    expect([o.ghost.position.x, o.ghost.position.y, o.ghost.position.z]).toEqual([2.5, 4.5, 4.5]);
  });

  it('invalid place uses a different material than valid (not color-only)', () => {
    const o = new TargetOverlay();
    o.apply(placeValid, true);
    const validMat = o.ghost.material;
    o.apply(placeInvalid, true);
    expect(o.ghost.material).not.toBe(validMat);
  });

  it('toggle target shows outline only, hides ghost', () => {
    const o = new TargetOverlay();
    o.apply(toggle, true);
    expect(o.outline.visible).toBe(true);
    expect(o.ghost.visible).toBe(false);
  });

  it('show=false hides everything', () => {
    const o = new TargetOverlay();
    o.apply(placeValid, true);
    o.apply(placeValid, false);
    expect(o.outline.visible).toBe(false);
    expect(o.ghost.visible).toBe(false);
  });

  it('reuses the same material instances across frames (no per-frame allocation)', () => {
    const o = new TargetOverlay();
    o.apply(placeInvalid, true);
    const m1 = o.ghost.material;
    o.apply(placeValid, true);
    o.apply(placeInvalid, true);
    expect(o.ghost.material).toBe(m1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/targetOverlay.test.ts`
Expected: FAIL — cannot resolve `../src/render/TargetOverlay`.

- [ ] **Step 3: Write minimal implementation**

Create `src/render/TargetOverlay.ts`:

```ts
import {
  BoxGeometry,
  EdgesGeometry,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  type Object3D,
} from 'three';
import type { ResolvedTarget } from '../app/targetPreview';

/**
 * Two persistent, reusable scene overlays: a wireframe outline on the targeted voxel and a
 * translucent ghost on the adjacent place target. Geometry and both ghost materials are created
 * once; `apply()` only repositions, toggles visibility, and swaps between the two preallocated
 * materials. Never allocates or disposes three.js resources per frame.
 */
export class TargetOverlay {
  readonly outline: LineSegments;
  readonly ghost: Mesh;
  private readonly validMat: MeshBasicMaterial;
  private readonly invalidMat: MeshBasicMaterial;

  constructor() {
    this.outline = new LineSegments(
      new EdgesGeometry(new BoxGeometry(1.002, 1.002, 1.002)),
      new LineBasicMaterial({ color: 0x111111, transparent: true, opacity: 0.6 }),
    );
    this.outline.visible = false;
    this.outline.renderOrder = 999;

    // Valid: solid translucent green. Invalid: sparse red wireframe + lower opacity — differs by
    // more than hue so it reads correctly without relying on color alone.
    this.validMat = new MeshBasicMaterial({ color: 0x66ff88, transparent: true, opacity: 0.35, depthWrite: false });
    this.invalidMat = new MeshBasicMaterial({
      color: 0xff4444,
      transparent: true,
      opacity: 0.25,
      depthWrite: false,
      wireframe: true,
    });
    this.ghost = new Mesh(new BoxGeometry(1, 1, 1), this.validMat);
    this.ghost.visible = false;
    this.ghost.renderOrder = 999;
  }

  /** Adds both overlays to the scene graph. Call once, after construction. */
  attach(add: (o: Object3D) => void): void {
    add(this.outline);
    add(this.ghost);
  }

  /**
   * Positions and shows/hides both overlays for the current frame. `show=false` (pointer
   * unlocked or inventory open) hides everything. Toggle targets show the outline only.
   */
  apply(resolved: ResolvedTarget | undefined, show: boolean): void {
    if (!show || !resolved) {
      this.outline.visible = false;
      this.ghost.visible = false;
      return;
    }
    const o = resolved.outline;
    this.outline.position.set(o.x + 0.5, o.y + 0.5, o.z + 0.5);
    this.outline.visible = true;

    if (resolved.kind === 'place') {
      const g = resolved.ghost;
      this.ghost.position.set(g.x + 0.5, g.y + 0.5, g.z + 0.5);
      this.ghost.material = g.valid ? this.validMat : this.invalidMat;
      this.ghost.visible = true;
    } else {
      this.ghost.visible = false;
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/targetOverlay.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Wire the overlay into Game.ts**

In `src/app/Game.ts`:

1. Add imports near the other render/app imports:
```ts
import { TargetOverlay } from '../render/TargetOverlay';
import { resolveTarget } from './targetPreview';
import { raycastVoxels } from '../edit/VoxelRaycast';
import { REACH } from './input';
```
(`registerInputListeners`, `TOOLS`, etc. are already imported from `./input` — add `REACH` to that existing import instead of a second import line if the file style prefers it.)

2. After `const abortInput = registerInputListeners({ ... });` and before `renderer.start(...)`, create and attach the overlay:
```ts
    const overlay = new TargetOverlay();
    overlay.attach((o) => renderer.add(o));
    const previewSampler = { getBlock: (x: number, y: number, z: number) => manager.getBlock(x, y, z) };
```

3. Inside the `renderer.start((dt) => { ... })` callback, after the `manager.update(...)` call (line ~241) and before `sink.sortTransparent(...)`, add:
```ts
      const previewOn = rig.locked && !ui.isInventoryOpen();
      if (previewOn) {
        const previewHit = raycastVoxels(previewSampler, renderer.camera.position, rig.forward(), REACH);
        overlay.apply(
          previewHit ? resolveTarget(previewHit, inventory.selectedBlock, rig.yaw, previewDeps) : undefined,
          true,
        );
      } else {
        overlay.apply(undefined, false);
      }
```
(`previewDeps` is the object built in Task 1, Step 6 — already in scope here.)

- [ ] **Step 6: Verify types + full suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: tsc clean; all tests pass (704 + 7 = 711 total expected at this point).

- [ ] **Step 7: Commit**

```bash
git add src/render/TargetOverlay.ts tests/targetOverlay.test.ts src/app/Game.ts
git commit -m "feat(render): live targeting outline + placement ghost overlays"
```

---

## Task 3: Mouse-wheel hotbar cycling

**Files:**
- Modify: `src/app/CreativeInventory.ts` (add `cycleSlot`)
- Modify: `tests/creativeInventory.test.ts` (wraparound tests)
- Modify: `src/app/input.ts` (add `hotbarWheelDelta` + `wheel` listener)
- Modify: `tests/inputHelpers.test.ts` (`hotbarWheelDelta` tests)

**Interfaces:**
- Consumes: existing `canEdit(pointerLocked, inventoryOpen)` from `input.ts`; `CreativeInventory.selectedSlot`, `.hotbar`.
- Produces:
  - `CreativeInventory.cycleSlot(delta: number): void` — moves selection by `delta` with wraparound over the slot count.
  - `hotbarWheelDelta(deltaY: number, canEditNow: boolean): number` — returns `+1`/`-1`/`0`; `0` when blocked or `deltaY === 0`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/creativeInventory.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { CreativeInventory } from '../src/app/CreativeInventory';

describe('CreativeInventory.cycleSlot', () => {
  it('advances by one', () => {
    const inv = new CreativeInventory([1, 2, 3] as never);
    inv.selectSlot(0);
    inv.cycleSlot(1);
    expect(inv.selectedSlot).toBe(1);
  });

  it('wraps forward past the last slot to the first', () => {
    const inv = new CreativeInventory([1, 2, 3] as never);
    inv.selectSlot(2);
    inv.cycleSlot(1);
    expect(inv.selectedSlot).toBe(0);
  });

  it('wraps backward past the first slot to the last', () => {
    const inv = new CreativeInventory([1, 2, 3] as never);
    inv.selectSlot(0);
    inv.cycleSlot(-1);
    expect(inv.selectedSlot).toBe(2);
  });
});
```

Append to `tests/inputHelpers.test.ts`:

```ts
import { hotbarWheelDelta } from '../src/app/input';

describe('hotbarWheelDelta', () => {
  it('returns 0 when editing is blocked (pointer unlocked or inventory open)', () => {
    expect(hotbarWheelDelta(120, false)).toBe(0);
    expect(hotbarWheelDelta(-120, false)).toBe(0);
  });

  it('maps positive deltaY to +1 and negative to -1 when editing is allowed', () => {
    expect(hotbarWheelDelta(120, true)).toBe(1);
    expect(hotbarWheelDelta(-120, true)).toBe(-1);
  });

  it('returns 0 for zero delta', () => {
    expect(hotbarWheelDelta(0, true)).toBe(0);
  });
});
```
(If `tests/inputHelpers.test.ts` already imports from `../src/app/input`, merge `hotbarWheelDelta` into the existing import and place the new `describe` block alongside the others rather than re-importing vitest.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/creativeInventory.test.ts tests/inputHelpers.test.ts`
Expected: FAIL — `cycleSlot` / `hotbarWheelDelta` are not defined.

- [ ] **Step 3: Implement `cycleSlot`**

In `src/app/CreativeInventory.ts`, add after `selectSlot`:

```ts
  /** Moves the selection by `delta` slots, wrapping around both ends. */
  cycleSlot(delta: number): void {
    const n = this.slots.length;
    if (n === 0) return;
    this.selectedSlot = (((this.selectedSlot + delta) % n) + n) % n;
  }
```

- [ ] **Step 4: Implement `hotbarWheelDelta` + the wheel listener**

In `src/app/input.ts`:

1. Add the pure helper near `canEdit` / `toolLabel`:
```ts
/** Wheel-to-hotbar-step mapping. Returns 0 when editing is blocked or there is no scroll delta. */
export function hotbarWheelDelta(deltaY: number, canEditNow: boolean): number {
  if (!canEditNow) return 0;
  return deltaY > 0 ? 1 : deltaY < 0 ? -1 : 0;
}
```

2. In `registerInputListeners`, after the `canvas.addEventListener('contextmenu', ...)` line, add the wheel listener:
```ts
  canvas.addEventListener(
    'wheel',
    (e) => {
      const delta = hotbarWheelDelta(e.deltaY, canEdit(rig.locked, callbacks.isInventoryOpen()));
      if (delta === 0) return;
      inventory.cycleSlot(delta);
      callbacks.onHotbarRender();
    },
    { signal, passive: true },
  );
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/creativeInventory.test.ts tests/inputHelpers.test.ts`
Expected: PASS (3 + 3 new).

- [ ] **Step 6: Verify types + full suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: tsc clean; all tests pass (711 + 6 = 717 total expected).

- [ ] **Step 7: Commit**

```bash
git add src/app/CreativeInventory.ts tests/creativeInventory.test.ts src/app/input.ts tests/inputHelpers.test.ts
git commit -m "feat(input): mouse-wheel hotbar cycling with wraparound"
```

---

## Task 4: Full verification gate + live smoke + before/after bench

**Files:** none (verification only). Orchestrator-driven; the live browser steps are performed by the human/orchestrator, not a code subagent.

- [ ] **Step 1: Static gate**

Run:
```powershell
npm run lint
npx tsc --noEmit
npx vitest run
npm run build
```
Expected: lint clean, tsc clean, all tests green, build succeeds. Fix any failure before proceeding.

- [ ] **Step 2: Baseline bench (before) — capture once against the pre-overlay build**

The "before" reference is `main` at `3748a8f` (no overlay). If a baseline bench JSON was not captured before Task 2 landed, capture it by benching the pinned build separately. Record at minimum the portable metrics `totalGens` and `totalMeshes`, plus the same-machine guardrails: `updateMs.p50/p95/p99/max`, `frameMs.p95/p99/max`, `peakMeshesPerFrame`, `peakGensPerFrame`, `longFrames16`, `longFrames33`, `meanFps`, `framesSampled`.

- [ ] **Step 3: After bench — same options, same machine, focused visible Chromium**

Start the dev server (use the `.claude/launch.json` `citadel-preview` config, port `5191`, or `npm run dev`). Open `?world=citadel`. In the console:
```js
await window.__vr.bench({ /* identical opts to the before run: axis, distance, speed, warmupMs */ })
```
Use the same world/save, start pose, axis, distance, speed, warmupMs, and browser-focus state as the before run. Save the returned JSON.

- [ ] **Step 4: Compare**

`totalGens` and `totalMeshes` must be identical before/after (overlay must not perturb streaming). Frame/update percentiles must show no material regression on the same machine. If a regression appears, investigate the per-frame raycast/preview path before shipping — do NOT jump to P6/workers.

- [ ] **Step 5: Manual look-sweep smoke (20-30s stationary over dense geometry)**

With the server running, verify live:
- Outline appears on the targeted block; ghost follows the valid adjacent target.
- Right-clicking a fence gate outlines it but shows NO placement ghost; the gate still toggles.
- Ghost reads invalid (wireframe/red) when aimed past the loaded edge.
- Placing, breaking, toggling, number-key selection, middle-click pick, **wheel cycling (wraparound)**, `E` toggle, `Esc` close all work.
- Inventory open hides the outline+ghost and blocks edits.
- Stationary 20-30s look-sweep across stairs/fences/walls/gates/plants shows no obvious hitch.

- [ ] **Step 6: Summarize**

Report: files changed, verification output, before/after bench JSON comparison, and deferred Phase 2 ideas (builder-tools UI: two-corner selection box, fill/clear/replace/copy/paste/rotate/mirror/array with progress + group undo).

---

## Self-Review Notes

- **Spec coverage:** outline (Task 2) ✓; placement ghost (Task 2) ✓; shared decision logic (Task 1, used by both click path and preview) ✓; reuse shape/state/collision rules (Task 1 via `shapeOf`/`stateFromYaw`/`isToggleable`) ✓; gate → outline-no-ghost (Task 1 `toggle` kind) ✓; hide when unlocked/inventory-open (Task 2 `show` flag) ✓; invalid for unloaded (Task 1 `canPlaceAt` = `canApply`) ✓; not color-only (Task 2 wireframe material) ✓; no preview toasts (preview never calls `onStatusChange`) ✓; wheel cycling + wraparound + guards + no toast spam (Task 3) ✓; preserve `E`/`Esc`/number-keys/middle-click/edit-gate (untouched + covered) ✓; performance guardrails + bench (Task 4) ✓; explicit deferrals honored (no categories/search/builder-UI/P6/save/worldgen changes) ✓.
- **Type consistency:** `PreviewDeps`/`ResolvedTarget`/`resolveTarget` names identical across Tasks 1-2; `REACH` exported once (Task 1) and imported (Task 2); `previewDeps` built once (Task 1 Step 6) and reused (Task 2 Step 5); `cycleSlot`/`hotbarWheelDelta` names consistent across Task 3.
- **Known minor cost:** the per-frame preview allocates small plain JS objects (raycast hit + resolved target) — not three.js resources. Acceptable; Task 4 bench confirms. If GC churn ever shows up, reuse scratch objects — out of scope for Phase 1.
