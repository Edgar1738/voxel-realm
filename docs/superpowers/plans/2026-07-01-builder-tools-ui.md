# Phase 2 — In-game Builder Tools Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a production, in-game builder UI — a visible two-corner selection box and hotkeys that drive the existing region/prefab operations (fill/clear/replace/copy/paste with rotate/mirror/array) via a live clipboard ghost.

**Architecture:** A thin interaction + render layer over already-tested ops. Pure logic lives in `RegionOps` (region→prefab capture, box edit builders) and a new `BuilderState` (selection corners, clipboard, transform) + `builderInput` (key→intent). Rendering uses two persistent reusable overlays (`SelectionBox`, `PasteGhost`) in the Phase 1 pattern (created once, `update()` only mutates). `Game.ts` orchestrates; `input.ts` maps events to intents. Every op goes through the existing `run()` path (cap + one `EditService` undo batch + status).

**Tech Stack:** TypeScript, three.js, Vitest, Vite.

## Global Constraints

- Base: worktree `.claude/worktrees/feat+builder-tools` (branch `worktree-feat+builder-tools`) off `main` at `f55b41a`. Never edit the primary checkout.
- Reuse existing ops; do NOT reimplement them: `Prefab.rotateY/mirror/repeat/normalize`, `RegionOps.replaceVoxels/prefabToVoxels/unloadedChunksInBox`, `ChunkManager.preloadBox/getBlock/canApply`, `EditService.apply`, the Game `run()` path, `MAX_EDIT_VOXELS`.
- Do NOT touch the streaming/meshing core. No new block ids / save-format / worldgen changes. No blueprint disk save/load in-game (clipboard is in-memory). No on-screen button panel (hotkeys only).
- Overlays: persistent, reusable, created once; `update()` only repositions/toggles/swaps — NO per-frame three.js allocation or disposal. No postprocessing.
- Overlays hidden when pointer unlocked or inventory open. Status readout updates on change only — never per frame (no toast spam).
- Each op is exactly one `EditService` batch (group undo). Respect `MAX_EDIT_VOXELS` via the existing `run()` cap.
- In Build mode, suspend the Phase 1 targeting overlay and the normal break/place/pick clicks.
- Verification gate per code task: `npx tsc --noEmit` and `npx vitest run` green. Final gate also runs `npm run lint` and `npm run build`.

## File Structure

- **Modify** `src/app/RegionOps.ts` — add `captureRegion`, `fillBox`, `clearBox`.
- **Modify** `src/app/DevControls.ts` — dev `copy` reuses `captureRegion` (no behavior change).
- **Create** `src/app/BuilderState.ts` — selection/clipboard/transform state + derived geometry (pure, no three.js/DOM).
- **Create** `src/app/builderInput.ts` — `resolveBuilderIntent` + `dominantHorizontalAxis` (pure).
- **Create** `src/render/SelectionBox.ts` — reusable selection wireframe overlay.
- **Create** `src/render/PasteGhost.ts` — reusable translucent clipboard-footprint overlay.
- **Modify** `src/app/Game.ts` — own state + overlays; per-frame update; builder intent/click handlers.
- **Modify** `src/app/input.ts` — route keys/clicks to builder intents; suspend normal clicks in Build mode.
- **Tests:** `tests/regionOpsBuilder.test.ts`, `tests/builderState.test.ts`, `tests/builderInput.test.ts`, `tests/selectionBox.test.ts`, `tests/pasteGhost.test.ts`.

---

## Task 1: RegionOps — captureRegion + fillBox + clearBox (and dev reuse)

**Files:**
- Modify: `src/app/RegionOps.ts`
- Modify: `src/app/DevControls.ts` (the `copy` closure, ~475-510)
- Test: `tests/regionOpsBuilder.test.ts`

**Interfaces:**
- Consumes: `Box` (`{x1,y1,z1,x2,y2,z2}`) and `SetVoxel` (`{x,y,z,id,state?}`); `Prefab`/`PrefabVoxel` from `../core/Prefab`; `AIR` from `../blocks/blocks`; `BlockId` from `../core/types`.
- Produces:
  - `captureRegion(read: (x: number, y: number, z: number) => BlockId, box: Box): Prefab` — non-air voxels, offsets from the box min corner; `dims` = full box extents.
  - `fillBox(box: Box, id: BlockId): SetVoxel[]` — every voxel in the box set to `id`.
  - `clearBox(box: Box): SetVoxel[]` — every voxel in the box set to `AIR`.

- [ ] **Step 1: Write the failing test**

Create `tests/regionOpsBuilder.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { captureRegion, fillBox, clearBox, prefabToVoxels } from '../src/app/RegionOps';
import { AIR } from '../src/blocks/blocks';

const A = 0 as never; // treated as AIR-equivalent id in reads below via explicit AIR
const STONE = 5 as never;

describe('captureRegion', () => {
  it('captures non-air voxels as min-corner-relative offsets and full box dims', () => {
    // A 2x1x2 box at (10,4,10); only (10,4,11) and (11,4,10) are stone.
    const read = (x: number, y: number, z: number) =>
      (x === 10 && y === 4 && z === 11) || (x === 11 && y === 4 && z === 10) ? STONE : AIR;
    const p = captureRegion(read, { x1: 10, y1: 4, z1: 10, x2: 11, y2: 4, z2: 11 });
    expect(p.dims).toEqual([2, 1, 2]);
    expect(p.blocks).toContainEqual([0, 0, 1, STONE]);
    expect(p.blocks).toContainEqual([1, 0, 0, STONE]);
    expect(p.blocks).toHaveLength(2);
  });

  it('round-trips: capture then prefabToVoxels at the same origin reproduces the non-air set', () => {
    const read = (x: number, y: number, z: number) => (x === 3 && y === 0 && z === 0 ? STONE : AIR);
    const p = captureRegion(read, { x1: 2, y1: 0, z1: 0, x2: 4, y2: 0, z2: 0 });
    expect(prefabToVoxels(p, 2, 0, 0)).toEqual([{ x: 3, y: 0, z: 0, id: STONE }]);
  });
});

describe('fillBox / clearBox', () => {
  it('fillBox sets every voxel in the box to the id (order-independent corners)', () => {
    const edits = fillBox({ x1: 1, y1: 0, z1: 0, x2: 0, y2: 0, z2: 0 }, STONE);
    expect(edits).toEqual([
      { x: 0, y: 0, z: 0, id: STONE },
      { x: 1, y: 0, z: 0, id: STONE },
    ]);
  });

  it('clearBox sets every voxel to AIR', () => {
    const edits = clearBox({ x1: 0, y1: 0, z1: 0, x2: 0, y2: 1, z2: 0 });
    expect(edits).toEqual([
      { x: 0, y: 0, z: 0, id: AIR },
      { x: 0, y: 1, z: 0, id: AIR },
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/regionOpsBuilder.test.ts`
Expected: FAIL — `captureRegion`/`fillBox`/`clearBox` are not exported.

- [ ] **Step 3: Write minimal implementation**

In `src/app/RegionOps.ts`, add imports and the three functions:

```ts
import { AIR } from '../blocks/blocks';
import { normalize, type Prefab, type PrefabVoxel } from '../core/Prefab';
```
(Keep the existing imports; `Prefab` may already be type-imported — merge, don't duplicate.)

```ts
/** Capture a region's non-air voxels into a Prefab (offsets from the box min corner; dims = box extents). */
export function captureRegion(
  read: (x: number, y: number, z: number) => BlockId,
  box: Box,
): Prefab {
  const [ax, bx] = [Math.min(box.x1, box.x2), Math.max(box.x1, box.x2)];
  const [ay, by] = [Math.min(box.y1, box.y2), Math.max(box.y1, box.y2)];
  const [az, bz] = [Math.min(box.z1, box.z2), Math.max(box.z1, box.z2)];
  if ((bx - ax + 1) * (by - ay + 1) * (bz - az + 1) > 200000)
    throw new Error('capture region too large (>200000)');
  const blocks: PrefabVoxel[] = [];
  for (let y = ay; y <= by; y++)
    for (let z = az; z <= bz; z++)
      for (let x = ax; x <= bx; x++) {
        const id = read(x, y, z);
        if (id !== AIR) blocks.push([x - ax, y - ay, z - az, id]);
      }
  return { dims: [bx - ax + 1, by - ay + 1, bz - az + 1], blocks };
}

/** Every voxel in the box set to `id` (sorted x→y→z, corners order-independent). */
export function fillBox(box: Box, id: BlockId): SetVoxel[] {
  const [ax, bx] = [Math.min(box.x1, box.x2), Math.max(box.x1, box.x2)];
  const [ay, by] = [Math.min(box.y1, box.y2), Math.max(box.y1, box.y2)];
  const [az, bz] = [Math.min(box.z1, box.z2), Math.max(box.z1, box.z2)];
  const out: SetVoxel[] = [];
  for (let x = ax; x <= bx; x++)
    for (let y = ay; y <= by; y++)
      for (let z = az; z <= bz; z++) out.push({ x, y, z, id });
  return out;
}

/** Every voxel in the box set to AIR. */
export function clearBox(box: Box): SetVoxel[] {
  return fillBox(box, AIR);
}
```
(`normalize` is imported for consistency but `captureRegion` intentionally keeps full box dims to match the dev `copy` contract; do not normalize here. If lint flags `normalize` as unused, drop it from the import.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/regionOpsBuilder.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Reuse captureRegion in the dev copy**

In `src/app/DevControls.ts`, import `captureRegion` from `./RegionOps` (merge into the existing `import { replaceVoxels, prefabToVoxels, unloadedChunksInBox } from './RegionOps';` line). Replace the manual capture loop inside the `copy` closure so it becomes:

```ts
      try {
        manager.preloadBox(ax, az, bx, bz);
      } catch {
        /* region too large to auto-preload */
      }
      const captured = captureRegion((x, y, z) => manager.getBlock(x, y, z), {
        x1: ax, y1: ay, z1: az, x2: bx, y2: by, z2: bz,
      });
      const unloaded = unloadedChunksInBox((x, z) => manager.isLoaded(x, z), {
        x1: ax, y1: ay, z1: az, x2: bx, y2: by, z2: bz,
      });
      return { ...captured, unloaded };
```
(Remove the now-dead `const blocks: ... = []` loop. `captured` already has `dims` + `blocks`.)

- [ ] **Step 6: Verify types + full suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: tsc clean; all tests pass (existing + 5 new). Dev `copy` behavior unchanged.

- [ ] **Step 7: Commit**

```bash
git add src/app/RegionOps.ts src/app/DevControls.ts tests/regionOpsBuilder.test.ts
git commit -m "feat(edit): captureRegion + fillBox/clearBox region ops (shared with dev copy)"
```

---

## Task 2: BuilderState (pure selection/clipboard/transform)

**Files:**
- Create: `src/app/BuilderState.ts`
- Test: `tests/builderState.test.ts`

**Interfaces:**
- Consumes: `Box` from `./RegionOps`; `Prefab` + `rotateY`, `mirror`, `repeat` from `../core/Prefab`.
- Produces:
  - `type BuilderMode = 'off' | 'selecting' | 'pasting'`
  - `class BuilderState` with fields `mode`, `cornerA?`, `cornerB?`, `clipboard?`, `transform` and methods:
    - `toggleMode(): void`, `setCorner(v: {x;y;z}): void`, `clearSelection(): void`, `selectionBox(): Box | undefined`
    - `setClipboard(p: Prefab): void`, `exitPaste(): void`
    - `rotate(delta: number): void`, `mirrorAxis(axis: 'x' | 'z'): void`, `arrayAdjust(delta: number, axis: 'x' | 'z'): void`
    - `transformedClipboard(): Prefab | undefined`

- [ ] **Step 1: Write the failing test**

Create `tests/builderState.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { BuilderState } from '../src/app/BuilderState';

const ID = 7 as never;

describe('BuilderState selection', () => {
  it('toggleMode goes off → selecting → off', () => {
    const b = new BuilderState();
    expect(b.mode).toBe('off');
    b.toggleMode();
    expect(b.mode).toBe('selecting');
    b.toggleMode();
    expect(b.mode).toBe('off');
  });

  it('setCorner fills A then B then cycles back to A; selectionBox spans both', () => {
    const b = new BuilderState();
    b.toggleMode();
    b.setCorner({ x: 1, y: 2, z: 3 });
    b.setCorner({ x: 4, y: 5, z: 6 });
    expect(b.selectionBox()).toEqual({ x1: 1, y1: 2, z1: 3, x2: 4, y2: 5, z2: 6 });
    b.setCorner({ x: 9, y: 9, z: 9 }); // cycles: replaces A
    expect(b.selectionBox()).toEqual({ x1: 9, y1: 9, z1: 9, x2: 4, y2: 5, z2: 6 });
  });

  it('selectionBox is undefined until both corners are set', () => {
    const b = new BuilderState();
    b.toggleMode();
    expect(b.selectionBox()).toBeUndefined();
    b.setCorner({ x: 0, y: 0, z: 0 });
    expect(b.selectionBox()).toBeUndefined();
  });
});

describe('BuilderState clipboard + transform', () => {
  it('setClipboard enters pasting mode with a reset transform', () => {
    const b = new BuilderState();
    b.setClipboard({ dims: [2, 1, 1], blocks: [[0, 0, 0, ID]] });
    expect(b.mode).toBe('pasting');
    expect(b.transform).toEqual({ turns: 0, mirrorX: false, mirrorZ: false, arrayCount: 1, arrayAxis: 'x' });
  });

  it('rotate wraps modulo 4 in both directions', () => {
    const b = new BuilderState();
    b.setClipboard({ dims: [1, 1, 1], blocks: [[0, 0, 0, ID]] });
    b.rotate(1);
    expect(b.transform.turns).toBe(1);
    b.rotate(-2);
    expect(b.transform.turns).toBe(3);
  });

  it('arrayAdjust never drops below 1 and records the axis', () => {
    const b = new BuilderState();
    b.setClipboard({ dims: [1, 1, 1], blocks: [[0, 0, 0, ID]] });
    b.arrayAdjust(-5, 'z');
    expect(b.transform.arrayCount).toBe(1);
    expect(b.transform.arrayAxis).toBe('z');
    b.arrayAdjust(2, 'z');
    expect(b.transform.arrayCount).toBe(3);
  });

  it('transformedClipboard tiles along the array axis (count 3 on x doubles+ the block count)', () => {
    const b = new BuilderState();
    b.setClipboard({ dims: [1, 1, 1], blocks: [[0, 0, 0, ID]] });
    b.arrayAdjust(2, 'x'); // count 3
    const p = b.transformedClipboard()!;
    expect(p.blocks).toHaveLength(3);
    expect(p.dims[0]).toBe(3);
  });

  it('transformedClipboard is undefined with no clipboard', () => {
    expect(new BuilderState().transformedClipboard()).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/builderState.test.ts`
Expected: FAIL — cannot resolve `../src/app/BuilderState`.

- [ ] **Step 3: Write minimal implementation**

Create `src/app/BuilderState.ts`:

```ts
import type { Box } from './RegionOps';
import { rotateY, mirror, repeat, type Prefab } from '../core/Prefab';

export type BuilderMode = 'off' | 'selecting' | 'pasting';

export interface BuilderTransform {
  turns: number; // 0..3 quarter-turns about Y
  mirrorX: boolean;
  mirrorZ: boolean;
  arrayCount: number; // >= 1
  arrayAxis: 'x' | 'z';
}

interface Vec3i {
  x: number;
  y: number;
  z: number;
}

/** All builder-tool state and the geometry it derives. No three.js, no DOM — pure and testable. */
export class BuilderState {
  mode: BuilderMode = 'off';
  cornerA?: Vec3i;
  cornerB?: Vec3i;
  clipboard?: Prefab;
  transform: BuilderTransform = { turns: 0, mirrorX: false, mirrorZ: false, arrayCount: 1, arrayAxis: 'x' };
  private nextCorner: 'a' | 'b' = 'a';

  /** off ↔ selecting. Leaving Build mode clears the selection and any paste session. */
  toggleMode(): void {
    if (this.mode === 'off') {
      this.mode = 'selecting';
    } else {
      this.mode = 'off';
      this.clearSelection();
    }
  }

  /** Sets the next corner (A, then B, then cycles back to A). */
  setCorner(v: Vec3i): void {
    if (this.nextCorner === 'a') {
      this.cornerA = { ...v };
      this.nextCorner = 'b';
    } else {
      this.cornerB = { ...v };
      this.nextCorner = 'a';
    }
  }

  clearSelection(): void {
    this.cornerA = undefined;
    this.cornerB = undefined;
    this.nextCorner = 'a';
  }

  selectionBox(): Box | undefined {
    if (!this.cornerA || !this.cornerB) return undefined;
    return {
      x1: this.cornerA.x, y1: this.cornerA.y, z1: this.cornerA.z,
      x2: this.cornerB.x, y2: this.cornerB.y, z2: this.cornerB.z,
    };
  }

  setClipboard(p: Prefab): void {
    this.clipboard = p;
    this.transform = { turns: 0, mirrorX: false, mirrorZ: false, arrayCount: 1, arrayAxis: 'x' };
    this.mode = 'pasting';
  }

  /** Leave paste mode but keep the clipboard for another paste. */
  exitPaste(): void {
    if (this.mode === 'pasting') this.mode = 'selecting';
  }

  rotate(delta: number): void {
    this.transform.turns = (((this.transform.turns + delta) % 4) + 4) % 4;
  }

  mirrorAxis(axis: 'x' | 'z'): void {
    if (axis === 'x') this.transform.mirrorX = !this.transform.mirrorX;
    else this.transform.mirrorZ = !this.transform.mirrorZ;
  }

  arrayAdjust(delta: number, axis: 'x' | 'z'): void {
    this.transform.arrayAxis = axis;
    this.transform.arrayCount = Math.max(1, this.transform.arrayCount + delta);
  }

  /** Apply mirror(x) → mirror(z) → rotate → array, composing the tested Prefab functions. */
  transformedClipboard(): Prefab | undefined {
    if (!this.clipboard) return undefined;
    let p = this.clipboard;
    if (this.transform.mirrorX) p = mirror(p, 'x');
    if (this.transform.mirrorZ) p = mirror(p, 'z');
    p = rotateY(p, this.transform.turns);
    const n = this.transform.arrayCount;
    if (n > 1) {
      const stride: [number, number, number] =
        this.transform.arrayAxis === 'x' ? [p.dims[0], 0, 0] : [0, 0, p.dims[2]];
      p = this.transform.arrayAxis === 'x' ? repeat(p, n, 1, 1, stride) : repeat(p, 1, 1, n, stride);
    }
    return p;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/builderState.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/BuilderState.ts tests/builderState.test.ts
git commit -m "feat(app): BuilderState — selection, clipboard, and transform composition"
```

---

## Task 3: builderInput (pure key→intent + facing axis)

**Files:**
- Create: `src/app/builderInput.ts`
- Test: `tests/builderInput.test.ts`

**Interfaces:**
- Consumes: `BuilderMode` from `./BuilderState`.
- Produces:
  - `type BuilderIntent = 'toggleMode' | 'fill' | 'clear' | 'replace' | 'copy' | 'rotateCW' | 'rotateCCW' | 'mirror' | 'arrayInc' | 'arrayDec' | 'cancel' | 'none'`
  - `resolveBuilderIntent(code: string, mode: BuilderMode): BuilderIntent`
  - `dominantHorizontalAxis(forwardX: number, forwardZ: number): 'x' | 'z'`

- [ ] **Step 1: Write the failing test**

Create `tests/builderInput.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { resolveBuilderIntent, dominantHorizontalAxis } from '../src/app/builderInput';

describe('resolveBuilderIntent', () => {
  it('KeyB always toggles mode', () => {
    expect(resolveBuilderIntent('KeyB', 'off')).toBe('toggleMode');
    expect(resolveBuilderIntent('KeyB', 'selecting')).toBe('toggleMode');
    expect(resolveBuilderIntent('KeyB', 'pasting')).toBe('toggleMode');
  });

  it('off mode ignores every key except KeyB', () => {
    for (const code of ['KeyF', 'KeyG', 'KeyR', 'KeyC', 'BracketLeft', 'Escape']) {
      expect(resolveBuilderIntent(code, 'off')).toBe('none');
    }
  });

  it('selecting mode maps fill/clear/replace/copy and cancel', () => {
    expect(resolveBuilderIntent('KeyF', 'selecting')).toBe('fill');
    expect(resolveBuilderIntent('KeyG', 'selecting')).toBe('clear');
    expect(resolveBuilderIntent('KeyR', 'selecting')).toBe('replace');
    expect(resolveBuilderIntent('KeyC', 'selecting')).toBe('copy');
    expect(resolveBuilderIntent('Escape', 'selecting')).toBe('cancel');
    expect(resolveBuilderIntent('BracketLeft', 'selecting')).toBe('none');
  });

  it('pasting mode maps rotate/mirror/array and cancel; ignores selecting-only keys', () => {
    expect(resolveBuilderIntent('BracketLeft', 'pasting')).toBe('rotateCCW');
    expect(resolveBuilderIntent('BracketRight', 'pasting')).toBe('rotateCW');
    expect(resolveBuilderIntent('KeyM', 'pasting')).toBe('mirror');
    expect(resolveBuilderIntent('Equal', 'pasting')).toBe('arrayInc');
    expect(resolveBuilderIntent('NumpadAdd', 'pasting')).toBe('arrayInc');
    expect(resolveBuilderIntent('Minus', 'pasting')).toBe('arrayDec');
    expect(resolveBuilderIntent('NumpadSubtract', 'pasting')).toBe('arrayDec');
    expect(resolveBuilderIntent('Escape', 'pasting')).toBe('cancel');
    expect(resolveBuilderIntent('KeyF', 'pasting')).toBe('none');
  });
});

describe('dominantHorizontalAxis', () => {
  it('picks x when |forwardX| >= |forwardZ|, else z', () => {
    expect(dominantHorizontalAxis(0.9, 0.1)).toBe('x');
    expect(dominantHorizontalAxis(-0.9, 0.1)).toBe('x');
    expect(dominantHorizontalAxis(0.1, 0.9)).toBe('z');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/builderInput.test.ts`
Expected: FAIL — cannot resolve `../src/app/builderInput`.

- [ ] **Step 3: Write minimal implementation**

Create `src/app/builderInput.ts`:

```ts
import type { BuilderMode } from './BuilderState';

export type BuilderIntent =
  | 'toggleMode'
  | 'fill'
  | 'clear'
  | 'replace'
  | 'copy'
  | 'rotateCW'
  | 'rotateCCW'
  | 'mirror'
  | 'arrayInc'
  | 'arrayDec'
  | 'cancel'
  | 'none';

/** Maps a keyboard `code` to a builder intent given the current mode. Pure. */
export function resolveBuilderIntent(code: string, mode: BuilderMode): BuilderIntent {
  if (code === 'KeyB') return 'toggleMode';
  if (mode === 'selecting') {
    switch (code) {
      case 'KeyF': return 'fill';
      case 'KeyG': return 'clear';
      case 'KeyR': return 'replace';
      case 'KeyC': return 'copy';
      case 'Escape': return 'cancel';
      default: return 'none';
    }
  }
  if (mode === 'pasting') {
    switch (code) {
      case 'BracketLeft': return 'rotateCCW';
      case 'BracketRight': return 'rotateCW';
      case 'KeyM': return 'mirror';
      case 'Equal':
      case 'NumpadAdd': return 'arrayInc';
      case 'Minus':
      case 'NumpadSubtract': return 'arrayDec';
      case 'Escape': return 'cancel';
      default: return 'none';
    }
  }
  return 'none';
}

/** The horizontal axis the camera faces most strongly. */
export function dominantHorizontalAxis(forwardX: number, forwardZ: number): 'x' | 'z' {
  return Math.abs(forwardX) >= Math.abs(forwardZ) ? 'x' : 'z';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/builderInput.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/builderInput.ts tests/builderInput.test.ts
git commit -m "feat(app): builderInput — pure key→intent mapping + facing axis"
```

---

## Task 4: SelectionBox overlay

**Files:**
- Create: `src/render/SelectionBox.ts`
- Test: `tests/selectionBox.test.ts`

**Interfaces:**
- Consumes: `Box` from `../app/RegionOps`.
- Produces: `class SelectionBox { readonly mesh: LineSegments; attach(add: (o: Object3D) => void): void; update(box: Box | undefined, show: boolean): void }`.
- Geometry note: a box over inclusive voxels `min..max` occupies world span `[min, max+1]`; size = `max-min+1`, center = `min + size/2`. Unit edge geometry is scaled by `size` and positioned at the center.

- [ ] **Step 1: Write the failing test**

Create `tests/selectionBox.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { SelectionBox } from '../src/render/SelectionBox';

describe('SelectionBox', () => {
  it('starts hidden', () => {
    expect(new SelectionBox().mesh.visible).toBe(false);
  });

  it('attach adds the mesh once', () => {
    const o = new SelectionBox();
    const added: unknown[] = [];
    o.attach((m) => added.push(m));
    expect(added).toEqual([o.mesh]);
  });

  it('update centers and scales to the inclusive voxel span', () => {
    const o = new SelectionBox();
    // voxels 0..1 on x, 0..0 on y, 0..3 on z → size (2,1,4), center (1, 0.5, 2)
    o.update({ x1: 1, y1: 0, z1: 3, x2: 0, y2: 0, z2: 0 }, true);
    expect(o.mesh.visible).toBe(true);
    expect([o.mesh.scale.x, o.mesh.scale.y, o.mesh.scale.z]).toEqual([2, 1, 4]);
    expect([o.mesh.position.x, o.mesh.position.y, o.mesh.position.z]).toEqual([1, 0.5, 2]);
  });

  it('hides on show=false or undefined box', () => {
    const o = new SelectionBox();
    o.update({ x1: 0, y1: 0, z1: 0, x2: 0, y2: 0, z2: 0 }, true);
    o.update(undefined, true);
    expect(o.mesh.visible).toBe(false);
    o.update({ x1: 0, y1: 0, z1: 0, x2: 0, y2: 0, z2: 0 }, false);
    expect(o.mesh.visible).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/selectionBox.test.ts`
Expected: FAIL — cannot resolve `../src/render/SelectionBox`.

- [ ] **Step 3: Write minimal implementation**

Create `src/render/SelectionBox.ts`:

```ts
import { BoxGeometry, EdgesGeometry, LineBasicMaterial, LineSegments, type Object3D } from 'three';
import type { Box } from '../app/RegionOps';

/** Reusable wireframe box marking the current two-corner selection. Created once; update() only mutates. */
export class SelectionBox {
  readonly mesh: LineSegments;

  constructor() {
    // Unit cube centered at origin; scaled per selection so edges track the box faces.
    this.mesh = new LineSegments(
      new EdgesGeometry(new BoxGeometry(1, 1, 1)),
      new LineBasicMaterial({ color: 0xffd54a, transparent: true, opacity: 0.9 }),
    );
    this.mesh.visible = false;
    this.mesh.renderOrder = 998;
  }

  attach(add: (o: Object3D) => void): void {
    add(this.mesh);
  }

  update(box: Box | undefined, show: boolean): void {
    if (!show || !box) {
      this.mesh.visible = false;
      return;
    }
    const minX = Math.min(box.x1, box.x2);
    const minY = Math.min(box.y1, box.y2);
    const minZ = Math.min(box.z1, box.z2);
    const sx = Math.abs(box.x2 - box.x1) + 1;
    const sy = Math.abs(box.y2 - box.y1) + 1;
    const sz = Math.abs(box.z2 - box.z1) + 1;
    this.mesh.scale.set(sx, sy, sz);
    this.mesh.position.set(minX + sx / 2, minY + sy / 2, minZ + sz / 2);
    this.mesh.visible = true;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/selectionBox.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/render/SelectionBox.ts tests/selectionBox.test.ts
git commit -m "feat(render): SelectionBox overlay for the builder selection"
```

---

## Task 5: PasteGhost overlay

**Files:**
- Create: `src/render/PasteGhost.ts`
- Test: `tests/pasteGhost.test.ts`

**Interfaces:**
- Produces: `class PasteGhost { readonly mesh: Mesh; readonly edges: LineSegments; attach(add: (o: Object3D) => void): void; update(dims: [number, number, number] | undefined, origin: { x: number; y: number; z: number } | undefined, show: boolean): void }`.
- Geometry note: the clipboard's min corner sits at `origin`; footprint spans `[origin, origin+dims]`; center = `origin + dims/2`. Both `mesh` (translucent fill) and `edges` (wireframe) share the scale/position so it reads as a footprint without rendering per-voxel meshes.

- [ ] **Step 1: Write the failing test**

Create `tests/pasteGhost.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { PasteGhost } from '../src/render/PasteGhost';

describe('PasteGhost', () => {
  it('starts hidden and attaches both objects once', () => {
    const o = new PasteGhost();
    expect(o.mesh.visible).toBe(false);
    expect(o.edges.visible).toBe(false);
    const added: unknown[] = [];
    o.attach((m) => added.push(m));
    expect(added).toContain(o.mesh);
    expect(added).toContain(o.edges);
    expect(added).toHaveLength(2);
  });

  it('positions the footprint with min corner at origin', () => {
    const o = new PasteGhost();
    o.update([2, 1, 3], { x: 10, y: 4, z: 20 }, true);
    expect(o.mesh.visible).toBe(true);
    expect([o.mesh.scale.x, o.mesh.scale.y, o.mesh.scale.z]).toEqual([2, 1, 3]);
    expect([o.mesh.position.x, o.mesh.position.y, o.mesh.position.z]).toEqual([11, 4.5, 21.5]);
    expect([o.edges.position.x, o.edges.position.y, o.edges.position.z]).toEqual([11, 4.5, 21.5]);
  });

  it('hides on show=false or missing dims/origin', () => {
    const o = new PasteGhost();
    o.update([1, 1, 1], { x: 0, y: 0, z: 0 }, true);
    o.update(undefined, { x: 0, y: 0, z: 0 }, true);
    expect(o.mesh.visible).toBe(false);
    o.update([1, 1, 1], undefined, true);
    expect(o.mesh.visible).toBe(false);
    o.update([1, 1, 1], { x: 0, y: 0, z: 0 }, false);
    expect(o.mesh.visible).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/pasteGhost.test.ts`
Expected: FAIL — cannot resolve `../src/render/PasteGhost`.

- [ ] **Step 3: Write minimal implementation**

Create `src/render/PasteGhost.ts`:

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

/** Reusable translucent footprint of the transformed clipboard at the paste origin. Created once. */
export class PasteGhost {
  readonly mesh: Mesh;
  readonly edges: LineSegments;

  constructor() {
    this.mesh = new Mesh(
      new BoxGeometry(1, 1, 1),
      new MeshBasicMaterial({ color: 0x5ad1ff, transparent: true, opacity: 0.25, depthWrite: false }),
    );
    this.edges = new LineSegments(
      new EdgesGeometry(new BoxGeometry(1, 1, 1)),
      new LineBasicMaterial({ color: 0x5ad1ff, transparent: true, opacity: 0.9 }),
    );
    this.mesh.visible = false;
    this.edges.visible = false;
    this.mesh.renderOrder = 998;
    this.edges.renderOrder = 999;
  }

  attach(add: (o: Object3D) => void): void {
    add(this.mesh);
    add(this.edges);
  }

  update(
    dims: [number, number, number] | undefined,
    origin: { x: number; y: number; z: number } | undefined,
    show: boolean,
  ): void {
    if (!show || !dims || !origin) {
      this.mesh.visible = false;
      this.edges.visible = false;
      return;
    }
    const [sx, sy, sz] = dims;
    const cx = origin.x + sx / 2;
    const cy = origin.y + sy / 2;
    const cz = origin.z + sz / 2;
    this.mesh.scale.set(sx, sy, sz);
    this.mesh.position.set(cx, cy, cz);
    this.edges.scale.set(sx, sy, sz);
    this.edges.position.set(cx, cy, cz);
    this.mesh.visible = true;
    this.edges.visible = true;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/pasteGhost.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/render/PasteGhost.ts tests/pasteGhost.test.ts
git commit -m "feat(render): PasteGhost overlay for the clipboard footprint"
```

---

## Task 6: Wire Build mode + selection + fill/clear/replace

**Files:**
- Modify: `src/app/input.ts`
- Modify: `src/app/Game.ts`

**Interfaces:**
- Consumes: `BuilderState`/`BuilderMode` (Task 2), `resolveBuilderIntent`/`dominantHorizontalAxis`/`BuilderIntent` (Task 3), `SelectionBox` (Task 4), `fillBox`/`clearBox`/`replaceVoxels` (Task 1 + existing), `raycastVoxels`/`REACH` (existing), the Game `run()` path, `manager.preloadBox`.
- Produces: Build-mode selection + fill/clear/replace working live. Task 7 adds copy/paste on top of the same handlers.

- [ ] **Step 1: Extend InputContext + route keys/clicks (input.ts)**

In `src/app/input.ts`:

1. Add imports:
```ts
import { resolveBuilderIntent, type BuilderIntent } from './builderInput';
import type { BuilderMode } from './BuilderState';
```

2. Add three callbacks to `InputCallbacks`:
```ts
  getBuildMode: () => BuilderMode;
  onBuilderIntent: (intent: BuilderIntent) => void;
  onBuilderClick: (hit: import('../edit/VoxelRaycast').VoxelRaycastHit) => void;
```

3. In the keydown handler, AFTER the `Escape`-closes-inventory block and BEFORE the `if (!e.ctrlKey) return;` undo/redo block, add:
```ts
      const intent = resolveBuilderIntent(e.code, callbacks.getBuildMode());
      if (intent !== 'none') {
        if (intent !== 'toggleMode' && !canEdit(rig.locked, callbacks.isInventoryOpen())) return;
        callbacks.onBuilderIntent(intent);
        return;
      }
```

4. In the mousedown handler, after `if (!hit) return;` and `const selected = inventory.selectedBlock;`, add — BEFORE the `if (e.button === 1)` block:
```ts
      if (callbacks.getBuildMode() !== 'off') {
        if (e.button === 0) callbacks.onBuilderClick(hit);
        else if (e.button === 2) callbacks.onBuilderIntent('cancel');
        return; // Build mode suspends normal break/place/pick
      }
```

- [ ] **Step 2: Instantiate state + overlay and implement handlers (Game.ts)**

In `src/app/Game.ts`:

1. Add imports:
```ts
import { BuilderState } from './BuilderState';
import { dominantHorizontalAxis } from './builderInput';
import type { BuilderIntent } from './builderInput';
import { SelectionBox } from '../render/SelectionBox';
import { fillBox, clearBox, replaceVoxels, type Box } from './RegionOps';
```
(If `raycastVoxels` and `REACH` are already imported from Task/Phase 1, reuse them; otherwise add `import { raycastVoxels } from '../edit/VoxelRaycast';` and `REACH` from `./input`.)

2. Before `registerInputListeners({`, create state + overlay:
```ts
    const builder = new BuilderState();
    const selectionBox = new SelectionBox();
    selectionBox.attach((o) => renderer.add(o));

    const builderAim = (): import('../edit/VoxelRaycast').VoxelRaycastHit | undefined =>
      raycastVoxels(previewSampler, renderer.camera.position, rig.forward(), REACH);

    const handleBuilderIntent = (intent: BuilderIntent): void => {
      const box = builder.selectionBox();
      switch (intent) {
        case 'toggleMode':
          builder.toggleMode();
          setStatus(builder.mode === 'off' ? 'Build mode off' : 'Build mode: pick two corners');
          return;
        case 'cancel':
          if (builder.mode === 'pasting') builder.exitPaste();
          else builder.clearSelection();
          setStatus('Selection cleared');
          return;
        case 'fill':
          if (!box) return void setStatus('Select two corners first');
          manager.preloadBox(box.x1, box.z1, box.x2, box.z2);
          run(fillBox(box, inventory.selectedBlock), 'Filled');
          return;
        case 'clear':
          if (!box) return void setStatus('Select two corners first');
          manager.preloadBox(box.x1, box.z1, box.x2, box.z2);
          run(clearBox(box), 'Cleared');
          return;
        case 'replace': {
          if (!box) return void setStatus('Select two corners first');
          const aim = builderAim();
          if (!aim) return void setStatus('Aim at the block type to replace');
          manager.preloadBox(box.x1, box.z1, box.x2, box.z2);
          run(
            replaceVoxels((x, y, z) => manager.getBlock(x, y, z), box, aim.id, inventory.selectedBlock),
            'Replaced',
          );
          return;
        }
        default:
          return; // copy/rotate/mirror/array/paste handled in Task 7
      }
    };
```
Remove the stray `builder.setClipboardHintPreload?.()` line — it is a placeholder to delete; the real preload is the `manager.preloadBox(...)` call beneath it. (Do not add any method to BuilderState.)

3. In the `registerInputListeners({ ... })` callbacks object, add:
```ts
        getBuildMode: () => builder.mode,
        onBuilderIntent: handleBuilderIntent,
        onBuilderClick: (hit) => {
          if (builder.mode === 'selecting') {
            builder.setCorner(hit.block);
            const b = builder.selectionBox();
            setStatus(b ? 'Selection set' : 'Pick the opposite corner');
          }
          // pasting-mode click (stamp) added in Task 7
        },
```

4. In the `renderer.start((dt) => { ... })` loop, replace the Phase 1 preview block so Build mode takes over the overlays:
```ts
      if (builder.mode !== 'off' && rig.locked && !ui.isInventoryOpen()) {
        targetOverlay.update(undefined, false); // suspend the Phase 1 targeting overlay
        selectionBox.update(builder.selectionBox(), true);
      } else {
        selectionBox.update(undefined, false);
        const previewOn = rig.locked && !ui.isInventoryOpen();
        if (previewOn) {
          const previewHit = raycastVoxels(previewSampler, renderer.camera.position, rig.forward(), REACH);
          targetOverlay.update(
            previewHit ? resolveTarget(previewHit, inventory.selectedBlock, rig.yaw, previewDeps) : undefined,
            true,
          );
        } else {
          targetOverlay.update(undefined, false);
        }
      }
```
(This wraps the exact Phase 1 preview code in the `else` branch. `dominantHorizontalAxis` is imported now for Task 7; if lint flags it unused in this task, add it in Task 7 instead — but keep the import path correct.)

- [ ] **Step 3: Verify types + full suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: tsc clean; all tests green (no new tests this task — it is integration exercised by live smoke; the pure pieces are covered by Tasks 1-5). Confirm no existing test regressed (the `gameBoot` Renderer mock already has `add` from Phase 1).

- [ ] **Step 4: Commit**

```bash
git add src/app/input.ts src/app/Game.ts
git commit -m "feat(app): Build mode + selection box + fill/clear/replace hotkeys"
```

---

## Task 7: Copy/paste mode + transforms + stamp

**Files:**
- Modify: `src/app/Game.ts`

**Interfaces:**
- Consumes: everything from Task 6 plus `captureRegion`/`prefabToVoxels` (Task 1 + existing), `PasteGhost` (Task 5), `dominantHorizontalAxis` (Task 3), `BuilderState.setClipboard/rotate/mirrorAxis/arrayAdjust/transformedClipboard/exitPaste`.
- Produces: copy → live paste ghost → rotate/mirror/array → stamp, all as one-undo ops.

- [ ] **Step 1: Add the PasteGhost overlay + paste origin helper (Game.ts)**

In `src/app/Game.ts`:

1. Add imports (merge with existing):
```ts
import { PasteGhost } from '../render/PasteGhost';
import { captureRegion, prefabToVoxels } from './RegionOps';
```

2. Next to `const selectionBox = new SelectionBox();`, add:
```ts
    const pasteGhost = new PasteGhost();
    pasteGhost.attach((o) => renderer.add(o));

    /** Paste origin (min corner) = the empty cell adjacent to the aimed face. */
    const pasteOrigin = (): { x: number; y: number; z: number } | undefined => {
      const aim = builderAim();
      return aim ? { x: aim.adjacent.x, y: aim.adjacent.y, z: aim.adjacent.z } : undefined;
    };
```

- [ ] **Step 2: Handle copy/rotate/mirror/array in handleBuilderIntent (Game.ts)**

Replace the `default:` case in `handleBuilderIntent` with these cases (before `default`):

```ts
        case 'copy': {
          if (!box) return void setStatus('Select two corners first');
          manager.preloadBox(box.x1, box.z1, box.x2, box.z2);
          const clip = captureRegion((x, y, z) => manager.getBlock(x, y, z), box);
          if (clip.blocks.length === 0) return void setStatus('Nothing to copy (selection is empty)');
          builder.setClipboard(clip);
          setStatus(`Copied ${clip.blocks.length} block(s) — aim and click to paste`);
          return;
        }
        case 'rotateCW':
          builder.rotate(1);
          setStatus(`Rotated (${builder.transform.turns * 90}°)`);
          return;
        case 'rotateCCW':
          builder.rotate(-1);
          setStatus(`Rotated (${builder.transform.turns * 90}°)`);
          return;
        case 'mirror': {
          const f = rig.forward();
          builder.mirrorAxis(dominantHorizontalAxis(f.x, f.z));
          setStatus('Mirrored');
          return;
        }
        case 'arrayInc':
        case 'arrayDec': {
          const f = rig.forward();
          builder.arrayAdjust(intent === 'arrayInc' ? 1 : -1, dominantHorizontalAxis(f.x, f.z));
          setStatus(`Array x${builder.transform.arrayCount}`);
          return;
        }
```

- [ ] **Step 3: Handle the stamp click + paste-ghost frame update (Game.ts)**

1. In the `onBuilderClick` callback, add the pasting branch:
```ts
        onBuilderClick: (hit) => {
          if (builder.mode === 'selecting') {
            builder.setCorner(hit.block);
            const b = builder.selectionBox();
            setStatus(b ? 'Selection set' : 'Pick the opposite corner');
            return;
          }
          if (builder.mode === 'pasting') {
            const p = builder.transformedClipboard();
            const origin = { x: hit.adjacent.x, y: hit.adjacent.y, z: hit.adjacent.z };
            if (!p) return;
            manager.preloadBox(origin.x, origin.z, origin.x + p.dims[0] - 1, origin.z + p.dims[2] - 1);
            run(prefabToVoxels(p, origin.x, origin.y, origin.z), 'Pasted');
          }
        },
```

2. In the render loop's Build-mode branch (Task 6, Step 2.4), extend it to drive the paste ghost:
```ts
      if (builder.mode !== 'off' && rig.locked && !ui.isInventoryOpen()) {
        targetOverlay.update(undefined, false);
        selectionBox.update(builder.selectionBox(), true);
        if (builder.mode === 'pasting') {
          pasteGhost.update(builder.transformedClipboard()?.dims, pasteOrigin(), true);
        } else {
          pasteGhost.update(undefined, undefined, false);
        }
      } else {
        selectionBox.update(undefined, false);
        pasteGhost.update(undefined, undefined, false);
        const previewOn = rig.locked && !ui.isInventoryOpen();
        if (previewOn) {
          const previewHit = raycastVoxels(previewSampler, renderer.camera.position, rig.forward(), REACH);
          targetOverlay.update(
            previewHit ? resolveTarget(previewHit, inventory.selectedBlock, rig.yaw, previewDeps) : undefined,
            true,
          );
        } else {
          targetOverlay.update(undefined, false);
        }
      }
```

- [ ] **Step 4: Verify types + full suite + lint**

Run: `npx tsc --noEmit && npx vitest run && npm run lint`
Expected: tsc clean; all tests green; lint clean (confirm no unused imports — `dominantHorizontalAxis`, `PasteGhost`, `captureRegion`, `prefabToVoxels` are all now used).

- [ ] **Step 5: Commit**

```bash
git add src/app/Game.ts
git commit -m "feat(app): copy/paste mode — live ghost, rotate/mirror/array, stamp"
```

---

## Task 8: Verification gate + live smoke (orchestrator)

**Files:** none (verification only).

- [ ] **Step 1: Static gate**

Run:
```powershell
npm run lint
npx tsc --noEmit
npx vitest run
npm run build
```
Expected: all green. Fix any failure before proceeding.

- [ ] **Step 2: Live smoke (pointer-lock, Edgar's machine or a live dev server)**

Start `npm run dev`, open `?world=citadel`, lock the pointer. Verify:
- `B` toggles Build mode (status confirms); the Phase 1 outline/ghost is suspended while in Build mode and returns on exit.
- Left-click sets corner A then B; the yellow `SelectionBox` renders over the inclusive voxel span.
- `F` fills with the held block; `G` clears; `R` replaces the aimed block's type within the box → all as single undo steps (`Ctrl+Z` reverts a whole op).
- `C` copies (status shows count) and enters paste mode; the blue `PasteGhost` footprint follows aim; `[`/`]` rotate, `M` mirror, `+`/`-` grow the array (ghost resizes); left-click stamps; `Esc` leaves paste mode keeping the clipboard.
- Right-click cancels; opening the inventory or unlocking hides all builder overlays.
- No hitch during a 20-30s look-sweep with a selection + paste ghost active; status never spams.

- [ ] **Step 3: Summarize** files changed, verification output, and any deferred follow-ups.

---

## Self-Review Notes

- **Spec coverage:** visible selection box (Task 4, wired Task 6) ✓; in-game hotkeys via pure intent map (Task 3) ✓; fill/clear/replace (Tasks 1+6) ✓; copy→clipboard via shared `captureRegion` (Tasks 1+7) ✓; live paste ghost + rotate/mirror/array + stamp (Tasks 5+7) ✓; group undo via `run()`/`EditService` ✓; auto-preload via `preloadBox` before each op ✓; cap via `run()`/`MAX_EDIT_VOXELS` ✓; overlays reusable, no per-frame alloc, hidden when unlocked/inventory-open, Phase 1 overlay suspended in Build mode ✓; status on-change only ✓; dev `copy` reuses `captureRegion` (DRY) ✓; no streaming/meshing/save/worldgen changes ✓.
- **Placeholder scan:** none — every step carries complete code. `default:` in `handleBuilderIntent` is a real no-op for intents handled in Task 7.
- **Type consistency:** `BuilderMode`/`BuilderIntent`/`Box` names match across tasks; `captureRegion`/`fillBox`/`clearBox` signatures match their Task 1 definitions and Task 6/7 call sites; `transformedClipboard()` returns `Prefab|undefined` and callers guard for `undefined`; overlay `update()` signatures match their tests.
- **Known minor cost:** the per-frame builder path allocates small plain objects (raycast hit, `transformedClipboard()` result while in paste mode). `transformedClipboard()` runs the pure `Prefab` transforms each frame during paste — bounded by clipboard size; acceptable for Phase 2. If it ever shows in a bench, cache the transformed prefab on transform-change — out of scope now.
```
