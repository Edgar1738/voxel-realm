# Precise Fence + Stair Collision (Track E6) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generalize player collision from a 3-value box enum to per-voxel sub-voxel AABB lists, so fences/walls/closed-gates are 1.5-tall unjumpable boxes and stairs are climbable two-box steps — with cube/slab behavior identical.

**Architecture:** A shared `shapeBoxes` module is the one source of stair geometry (render + collision). `BlockRegistry.collisionAABBs(id,state)` → local AABBs; `ChunkManager.collisionBoxesAt` → world AABBs; `Collision.ts`'s overlap/support/sweep are rewritten to test real AABBs. The substep resolver structure (X→Z→Y, step-up) is unchanged.

**Tech Stack:** TypeScript (strict), Vitest. Pure-function physics (`resolveCollision`) over a `SoliditySampler`. Builds on E1 (slab/`emitBoxCulled`), E2 (stair state), E3 (fence/wall), E4 (gate state).

## Global Constraints

- **Cube + slab collision is behavior-identical** (parity tests pin: rest on a cube top at y+1, on a slab top at y+0.5, slide along a wall, 1-block step-up). No save/render/id/texture change.
- Below-world and unloaded chunks collide as a **full cube box** (no falling through a seam). Non-opaque voxels (air/water/plants) and open gates are non-colliding.
- Fences/walls/closed-gates collide as **one full-footprint box `[0,0,0, 1,1.5,1]`** (NOT the thin visual arms). Stairs collide as their **two render boxes** (`stairBoxes`).
- The resolver stays substep-structured (X, Z, then Y; step-up on a blocked horizontal move with no vertical delta). Only the per-voxel box test changes (enum → AABB).
- This track **cannot be live-played** (headless preview freezes physics) — **unit tests are the sole verification**; keep coverage thorough (parity + precision).
- Strict TS, no `any`; prettier+eslint clean; `npm run -s build` green; full vitest suite green.
- Block-shape geometry already exists: `emitShaped.stairBoxes(x,y,z,facing,half)`; `FACING` from `src/world/VoxelState`; the stair state is `unpackState(state) → {facing, half}`.

## Spec

`docs/specs/2026-06-30-precise-collision-track-e6-design.md` (6 components). This plan implements them in 5 tasks (the resolver rewrite + its caller + its tests are one atomic task).

## File Structure

- `src/blocks/shapeBoxes.ts` (new) — `AABB` type, `CUBE_BOX`/`SLAB_BOX`/`TALL_BOX`, `stairBoxes(facing,half)`.
- `src/mesh/emitShaped.ts` — `emitStair` consumes the shared `stairBoxes`.
- `src/blocks/BlockRegistry.ts` — `collisionAABBs(id,state)` (added T1; the old enum methods removed T4).
- `src/world/ChunkManager.ts` — `collisionBoxesAt(wx,wy,wz)` (added T2; `solidBox` removed T4).
- `src/player/Collision.ts` — sampler + overlap/support/sweep rewritten to AABBs (T3).
- `src/player/PlayerController.ts` + `src/app/Game.ts` — sampler type + wiring (T3).
- `src/blocks/blocks.ts` — `CollisionBox` enum removed (T4).

---

### Task 1: Shared `shapeBoxes` + `registry.collisionAABBs`

**Files:**
- Create: `src/blocks/shapeBoxes.ts`
- Modify: `src/mesh/emitShaped.ts` (`emitStair` uses the shared `stairBoxes`; remove the local one)
- Modify: `src/blocks/BlockRegistry.ts` (add `collisionAABBs`; keep the old enum methods for now)
- Test: `tests/shapeBoxes.test.ts`, `tests/collisionAABBs.test.ts` (new)

**Interfaces:**
- Produces: `type AABB = readonly [number,number,number,number,number,number]`; `CUBE_BOX`/`SLAB_BOX`/`TALL_BOX: AABB`; `stairBoxes(facing:number, half:number): AABB[]`; `registry.collisionAABBs(id, state): AABB[]`.

- [ ] **Step 1: Write the failing tests**

`tests/shapeBoxes.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { AABB, CUBE_BOX, SLAB_BOX, TALL_BOX, stairBoxes } from '../src/blocks/shapeBoxes';
import { FACING } from '../src/world/VoxelState';

describe('shapeBoxes', () => {
  it('constants are correct local boxes', () => {
    expect(CUBE_BOX).toEqual([0, 0, 0, 1, 1, 1]);
    expect(SLAB_BOX).toEqual([0, 0, 0, 1, 0.5, 1]);
    expect(TALL_BOX).toEqual([0, 0, 0, 1, 1.5, 1]);
  });
  it('a bottom stair = lower full half + upper back-half; facing rotates the upper box', () => {
    const n = stairBoxes(FACING.N, 0);
    expect(n.length).toBe(2);
    expect(n[0]).toEqual([0, 0, 0, 1, 0.5, 1]); // lower full half
    expect(n[1]).toEqual([0, 0.5, 0.5, 1, 1, 1]); // upper, south-half cut (N → step on south, upper on north z 0.5..1)
    const e = stairBoxes(FACING.E, 0);
    expect(e[1]).toEqual([0, 0.5, 0, 0.5, 1, 1]); // upper on west x 0..0.5
  });
  it('a top-half (upside-down) stair flips the halves', () => {
    const n = stairBoxes(FACING.N, 1);
    expect(n[0]).toEqual([0, 0.5, 0, 1, 1, 1]); // full upper half
    expect(n[1]).toEqual([0, 0, 0.5, 1, 0.5, 1]); // step on the bottom
  });
});
```

`tests/collisionAABBs.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { BlockRegistry } from '../src/blocks/BlockRegistry';
import { CUBE_BOX, SLAB_BOX, TALL_BOX } from '../src/blocks/shapeBoxes';
import { STONE, STONE_SLAB, STAIRS_STONE, OAK_FENCE, OAK_FENCE_GATE, FLOWER } from '../src/blocks/blocks';
import { packState, setOpen, FACING } from '../src/world/VoxelState';

const reg = new BlockRegistry();

describe('registry.collisionAABBs', () => {
  it('cube / slab / fence(tall) / plant(none)', () => {
    expect(reg.collisionAABBs(STONE, 0)).toEqual([CUBE_BOX]);
    expect(reg.collisionAABBs(STONE_SLAB, 0)).toEqual([SLAB_BOX]);
    expect(reg.collisionAABBs(OAK_FENCE, 0)).toEqual([TALL_BOX]);
    expect(reg.collisionAABBs(FLOWER, 0)).toEqual([]);
  });
  it('stair returns its two boxes by state', () => {
    const boxes = reg.collisionAABBs(STAIRS_STONE, packState(FACING.N, 0));
    expect(boxes.length).toBe(2);
    expect(boxes[0]).toEqual([0, 0, 0, 1, 0.5, 1]);
  });
  it('a gate is solid (tall) closed, empty open', () => {
    expect(reg.collisionAABBs(OAK_FENCE_GATE, packState(FACING.N, 0))).toEqual([TALL_BOX]);
    expect(reg.collisionAABBs(OAK_FENCE_GATE, setOpen(packState(FACING.N, 0), true))).toEqual([]);
  });
});
```

(Confirm the exact id constant names — `STONE_STAIRS`, `OAK_FENCE`, `STONE_SLAB`, `FLOWER` — by reading `src/blocks/blocks.ts` exports; adjust the imports to the real names if different.)

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run tests/shapeBoxes.test.ts tests/collisionAABBs.test.ts`
Expected: FAIL — `src/blocks/shapeBoxes.ts` missing; `collisionAABBs` not a function.

- [ ] **Step 3: Create `src/blocks/shapeBoxes.ts`**

```ts
import { FACING } from '../world/VoxelState';

/** A local axis-aligned box within a voxel: [minX,minY,minZ, maxX,maxY,maxZ] (0..1, Y up to 1.5). */
export type AABB = readonly [number, number, number, number, number, number];

export const CUBE_BOX: AABB = [0, 0, 0, 1, 1, 1];
export const SLAB_BOX: AABB = [0, 0, 0, 1, 0.5, 1];
/** Full-footprint, 1.5 tall — fences, walls, closed gates (unjumpable). */
export const TALL_BOX: AABB = [0, 0, 0, 1, 1.5, 1];

/**
 * The two boxes of a stair (local): a lower full half + an upper back-half. Mirrors the render
 * geometry in emitShaped so collision and rendering share one source. `half` 1 = top (upside-down).
 */
export function stairBoxes(facing: number, half: number): AABB[] {
  const yFullLo = half === 1 ? 0.5 : 0;
  const yFullHi = half === 1 ? 1 : 0.5;
  const yStepLo = half === 1 ? 0 : 0.5;
  const yStepHi = half === 1 ? 0.5 : 1;
  let sx0 = 0;
  let sx1 = 1;
  let sz0 = 0;
  let sz1 = 1;
  if (facing === FACING.N) sz0 = 0.5;
  else if (facing === FACING.S) sz1 = 0.5;
  else if (facing === FACING.E) sx1 = 0.5;
  else sx0 = 0.5;
  return [
    [0, yFullLo, 0, 1, yFullHi, 1],
    [sx0, yStepLo, sz0, sx1, yStepHi, sz1],
  ];
}
```

- [ ] **Step 4: Refactor `emitStair` in `src/mesh/emitShaped.ts` to use the shared `stairBoxes`**

Add the import: `import { stairBoxes } from '../blocks/shapeBoxes';`. **Delete** the existing local `stairBoxes` function (the one taking `(x,y,z,facing,half)` and returning `[[lo],[hi]]` pairs). Rewrite `emitStair` to offset the shared local boxes by the voxel origin:

```ts
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
  for (const b of stairBoxes(facing, half)) {
    emitBoxCulled(buf, view, registry, id, x, y, z, [x + b[0], y + b[1], z + b[2]], [x + b[3], y + b[4], z + b[5]]);
  }
}
```

The render geometry is byte-identical (same boxes, just sourced + offset), so `tests/emitStair.test.ts` must still pass.

- [ ] **Step 5: Add `collisionAABBs` to `src/blocks/BlockRegistry.ts`**

Add imports: `import { stairBoxes, CUBE_BOX, SLAB_BOX, TALL_BOX, type AABB } from './shapeBoxes';` and add `unpackState` to the existing `../world/VoxelState` import (it already imports `isOpen`). After `collisionBoxFor`, add:

```ts
  /** Sub-voxel collision boxes (local, 0..1.5) for a block in a given state. */
  collisionAABBs(id: BlockId, state: number): AABB[] {
    switch (this.shape(id)) {
      case 'cube':
        return [CUBE_BOX];
      case 'slab':
        return [SLAB_BOX];
      case 'stair': {
        const { facing, half } = unpackState(state);
        return stairBoxes(facing, half);
      }
      case 'fence':
      case 'wall':
        return [TALL_BOX];
      case 'gate':
        return isOpen(state) ? [] : [TALL_BOX];
      case 'cross':
        return [];
    }
  }
```

(Leave `collisionBox`/`collisionBoxFor` in place for now — Task 4 removes them once nothing calls them.)

- [ ] **Step 6: Run the tests + the stair render regression + full suite + build**

Run: `npx vitest run tests/shapeBoxes.test.ts tests/collisionAABBs.test.ts tests/emitStair.test.ts && npx vitest run && npm run -s build`
Expected: green (the `emitStair` regression confirms render geometry unchanged).

- [ ] **Step 7: Commit**

```bash
git add src/blocks/shapeBoxes.ts src/mesh/emitShaped.ts src/blocks/BlockRegistry.ts tests/shapeBoxes.test.ts tests/collisionAABBs.test.ts
git commit -m "feat(blocks): shared shapeBoxes + registry.collisionAABBs (cube/slab/stair/tall fence/gate)"
```

---

### Task 2: `ChunkManager.collisionBoxesAt` (world AABBs)

**Files:**
- Modify: `src/world/ChunkManager.ts` (add `collisionBoxesAt`; keep `solidBox` for now)
- Test: `tests/collisionBoxesAt.test.ts` (new)

**Interfaces:**
- Consumes: `registry.collisionAABBs` (T1), `ChunkData.getState`, `AABB`.
- Produces: `ChunkManager.collisionBoxesAt(wx,wy,wz): AABB[]` (world coords).

- [ ] **Step 1: Write the failing test** — `tests/collisionBoxesAt.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { ChunkManager } from '../src/world/ChunkManager';
import { GreedyMesher } from '../src/mesh/GreedyMesher';
import { BlockRegistry } from '../src/blocks/BlockRegistry';
import { ChunkData } from '../src/world/ChunkData';
import { OAK_FENCE, STONE, OAK_FENCE_GATE } from '../src/blocks/blocks';
import { packState, setOpen, FACING } from '../src/world/VoxelState';
import type { Generator } from '../src/worldgen/Generator';

const reg = new BlockRegistry();
const sink = { upload: () => {}, dispose: () => {} };

class Fixture implements Generator {
  generateBaseChunk(_s: number, cx: number, cz: number): ChunkData {
    const d = new ChunkData(cx, cz);
    if (cx === 0 && cz === 0) {
      d.set(2, 5, 2, STONE);
      d.set(3, 5, 2, OAK_FENCE);
      d.set(4, 5, 2, OAK_FENCE_GATE);
      d.setState(4, 5, 2, setOpen(packState(FACING.N, 0), true)); // open gate
    }
    return d;
  }
}
function mgr() {
  const m = new ChunkManager(new Fixture(), new GreedyMesher(reg), reg, sink, 1, []);
  m.preload(0, 0, 0);
  return m;
}

describe('ChunkManager.collisionBoxesAt', () => {
  it('offsets local boxes to world coords', () => {
    expect(mgr().collisionBoxesAt(2, 5, 2)).toEqual([[2, 5, 2, 3, 6, 3]]); // stone cube
  });
  it('a fence is a 1.5-tall world box', () => {
    expect(mgr().collisionBoxesAt(3, 5, 2)).toEqual([[3, 5, 2, 4, 6.5, 3]]);
  });
  it('an open gate has no boxes; air has none', () => {
    expect(mgr().collisionBoxesAt(4, 5, 2)).toEqual([]);
    expect(mgr().collisionBoxesAt(0, 5, 0)).toEqual([]);
  });
  it('below-world and unloaded read as a full cube box', () => {
    expect(mgr().collisionBoxesAt(2, -1, 2)).toEqual([[2, -1, 2, 3, 0, 3]]);
    expect(mgr().collisionBoxesAt(999, 5, 999)).toEqual([[999, 5, 999, 1000, 6, 1000]]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/collisionBoxesAt.test.ts`
Expected: FAIL — `collisionBoxesAt` is not a function.

- [ ] **Step 3: Add `collisionBoxesAt` to `src/world/ChunkManager.ts`**

Add `type AABB` to the `shapeBoxes` import (or a new import: `import type { AABB } from '../blocks/shapeBoxes';`). Add the method next to `solidBox`:

```ts
  /** World-space collision boxes for a voxel. Below-world/unloaded read solid (full cube). */
  collisionBoxesAt(wx: number, wy: number, wz: number): AABB[] {
    if (wy < 0) return [[wx, wy, wz, wx + 1, wy + 1, wz + 1]];
    if (wy >= WORLD_HEIGHT) return [];
    const entry = this.store.get(worldToChunkCoord(wx), worldToChunkCoord(wz));
    if (!entry) return [[wx, wy, wz, wx + 1, wy + 1, wz + 1]];
    const lx = worldToLocal(wx);
    const lz = worldToLocal(wz);
    const id = entry.data.get(lx, wy, lz);
    if (!this.registry.isOpaque(id)) return [];
    const state = entry.data.getState(lx, wy, lz);
    return this.registry
      .collisionAABBs(id, state)
      .map((b) => [wx + b[0], wy + b[1], wz + b[2], wx + b[3], wy + b[4], wz + b[5]] as AABB);
  }
```

(Match the exact local-coord helpers used by the existing `solidBox` in this file — `worldToLocal`/`worldToChunkCoord`/`this.store.get` — read `solidBox` and mirror it.)

- [ ] **Step 4: Run the test + full suite + build**

Run: `npx vitest run tests/collisionBoxesAt.test.ts && npx vitest run && npm run -s build`
Expected: green.

- [ ] **Step 5: Commit**

```bash
git add src/world/ChunkManager.ts tests/collisionBoxesAt.test.ts
git commit -m "feat(world): ChunkManager.collisionBoxesAt — world-space sub-voxel collision boxes"
```

---

### Task 3: Rewrite `Collision.ts` against AABBs (+ rewire `PlayerController`/`Game` + migrate tests)

**This is the atomic core task** — changing the sampler interface requires its caller and tests to move with it, and the precise fence/stair tests need the real-AABB sampler.

**Files:**
- Modify: `src/player/Collision.ts` (full rewrite of the sampler + overlap/support/sweep)
- Modify: `src/player/PlayerController.ts` (the `SoliditySampler` type it forwards)
- Modify: `src/app/Game.ts` (provide `collisionBoxes` from `manager.collisionBoxesAt`)
- Modify: `tests/collision.test.ts`, `tests/collisionSlab.test.ts`, `tests/playerController.test.ts` (migrate to the new sampler; keep parity assertions; add precise ones)

**Interfaces:**
- Consumes: `AABB` (T1), `manager.collisionBoxesAt` (T2).
- Produces: `SoliditySampler = { collisionBoxes(x,y,z): AABB[] }`; `resolveCollision(sampler, center, half, delta)` unchanged signature.

- [ ] **Step 1: Write the failing/precise tests first** — extend `tests/collision.test.ts` with an AABB sampler helper and precise cases (keep the existing parity tests, migrating their sampler):

```ts
import { describe, it, expect } from 'vitest';
import { resolveCollision, type SoliditySampler } from '../src/player/Collision';
import { CUBE_BOX, SLAB_BOX, TALL_BOX, stairBoxes, type AABB } from '../src/blocks/shapeBoxes';
import { FACING } from '../src/world/VoxelState';

/** A sampler from a map of "x,y,z" -> local AABB[] (offset to world here). */
function sampler(boxes: Record<string, AABB[]>): SoliditySampler {
  return {
    collisionBoxes(x, y, z) {
      const local = boxes[`${x},${y},${z}`] ?? [];
      return local.map((b) => [x + b[0], y + b[1], z + b[2], x + b[3], y + b[4], z + b[5]] as AABB);
    },
  };
}
const HALF = { x: 0.3, y: 0.9, z: 0.3 };

describe('collision parity (cube/slab)', () => {
  it('rests on a cube top at y+1', () => {
    const s = sampler({ '0,0,0': [CUBE_BOX] });
    const r = resolveCollision(s, { x: 0.5, y: 2, z: 0.5 }, HALF, { x: 0, y: -2, z: 0 });
    expect(r.center.y).toBeCloseTo(1 + HALF.y, 2);
    expect(r.grounded).toBe(true);
  });
  it('rests on a slab top at y+0.5', () => {
    const s = sampler({ '0,0,0': [SLAB_BOX] });
    const r = resolveCollision(s, { x: 0.5, y: 2, z: 0.5 }, HALF, { x: 0, y: -2, z: 0 });
    expect(r.center.y).toBeCloseTo(0.5 + HALF.y, 2);
  });
  it('slides along a wall (blocked X, free Z)', () => {
    const s = sampler({ '1,1,0': [CUBE_BOX] }); // wall to the +x
    const r = resolveCollision(s, { x: 0.5, y: 1.9, z: 0.5 }, HALF, { x: 1, y: 0, z: 0.5 });
    expect(r.center.x).toBeLessThan(1); // stopped at the wall face (x = 1 - half - eps)
    expect(r.center.z).toBeCloseTo(1.0, 1); // z moved freely
  });
  it('steps up a 1-block ledge', () => {
    const s = sampler({ '1,1,0': [CUBE_BOX] }); // 1-tall block ahead at y=1, ground at y=1 top
    const r = resolveCollision(s, { x: 0.5, y: 1 + HALF.y, z: 0.5 }, HALF, { x: 1, y: 0, z: 0 });
    expect(r.center.x).toBeGreaterThan(1); // climbed onto the ledge
  });
});

describe('collision precision (fence/stair)', () => {
  it('cannot step over a 1-tall fence (1.5 box blocks the step-up)', () => {
    const s = sampler({ '1,1,0': [TALL_BOX] }); // fence ahead
    const r = resolveCollision(s, { x: 0.5, y: 1 + HALF.y, z: 0.5 }, HALF, { x: 1, y: 0, z: 0 });
    expect(r.center.x).toBeLessThan(1); // blocked at the fence face, did NOT climb over
  });
  it('climbs a stair (ends above the lower step)', () => {
    const s = sampler({ '1,1,0': stairBoxes(FACING.W, 0) }); // stair ahead, step on east (toward player)
    const r = resolveCollision(s, { x: 0.5, y: 1 + HALF.y, z: 0.5 }, HALF, { x: 1, y: 0, z: 0 });
    expect(r.center.x).toBeGreaterThan(1); // walked up onto the stair
    expect(r.center.y).toBeGreaterThan(1 + HALF.y); // rose at least onto the lower half
  });
});
```

**Note on the existing tests:** `tests/collision.test.ts` currently builds samplers from a boolean predicate (`{ isSolid: pred }`) with `HALF = { x: 0.3, y: 0.9, z: 0.3 }` and asserts exact rest planes (wall at `1 - HALF.x`, floor rest at `HALF.y`, ceiling at `3 - HALF.y`, a 1-block step-up). **Preserve every existing assertion**, migrating each `isSolid`/predicate sampler to the map-based `sampler({...})` helper above (a "solid" voxel → `[CUBE_BOX]`). Then add the precision `describe` block. `HALF` stays `{ x: 0.3, y: 0.9, z: 0.3 }`.

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run tests/collision.test.ts`
Expected: FAIL — `SoliditySampler` no longer matches (or the precise cases fail under the old enum resolver).

- [ ] **Step 3: Rewrite `src/player/Collision.ts`** (full file)

```ts
import type { Vec3 } from '../core/types';
import type { AABB } from '../blocks/shapeBoxes';

/** Supplies the world-space collision boxes occupying an integer voxel cell. */
export interface SoliditySampler {
  collisionBoxes(x: number, y: number, z: number): AABB[];
}

export interface CollisionResult {
  center: Vec3;
  grounded: boolean;
}

const STEP = 0.4; // max substep distance (< the 0.5 smallest feature) to avoid tunneling
const EPS = 1e-3;

/**
 * Calls `fn` for every world AABB near the player AABB [pMin..pMax]. Scans one voxel below the
 * floored Y range so a box taller than its voxel (fence = 1.5; overhang 0.5 < 1) is considered.
 */
function forEachBoxNear(
  sampler: SoliditySampler,
  pMinX: number,
  pMinY: number,
  pMinZ: number,
  pMaxX: number,
  pMaxY: number,
  pMaxZ: number,
  fn: (b: AABB) => void,
): void {
  const x0 = Math.floor(pMinX);
  const x1 = Math.floor(pMaxX);
  const y0 = Math.floor(pMinY) - 1;
  const y1 = Math.floor(pMaxY);
  const z0 = Math.floor(pMinZ);
  const z1 = Math.floor(pMaxZ);
  for (let y = y0; y <= y1; y++)
    for (let z = z0; z <= z1; z++)
      for (let x = x0; x <= x1; x++) for (const b of sampler.collisionBoxes(x, y, z)) fn(b);
}

/** Strict overlap of [aMin,aMax] and [bMin,bMax] with an EPS margin (resting contact ≠ overlap). */
function axisOverlap(aMin: number, aMax: number, bMin: number, bMax: number): boolean {
  return aMin < bMax - EPS && aMax > bMin + EPS;
}

/** True if the player AABB (center ± half) overlaps any solid box. */
function overlapsSolid(sampler: SoliditySampler, center: Vec3, half: Vec3): boolean {
  const pMinX = center.x - half.x;
  const pMaxX = center.x + half.x;
  const pMinY = center.y - half.y;
  const pMaxY = center.y + half.y;
  const pMinZ = center.z - half.z;
  const pMaxZ = center.z + half.z;
  let hit = false;
  forEachBoxNear(sampler, pMinX, pMinY, pMinZ, pMaxX, pMaxY, pMaxZ, (b) => {
    if (hit) return;
    if (
      axisOverlap(pMinX, pMaxX, b[0], b[3]) &&
      axisOverlap(pMinY, pMaxY, b[1], b[4]) &&
      axisOverlap(pMinZ, pMaxZ, b[2], b[5])
    )
      hit = true;
  });
  return hit;
}

/**
 * Highest box top at or below the player's feet whose horizontal extent overlaps the footprint.
 * Used to rest the player on the actual surface (slab top = y+0.5, cube/stair-step = y+1).
 */
function highestSupport(
  sampler: SoliditySampler,
  center: Vec3,
  half: Vec3,
  feet0: number,
  feetTarget: number,
): number {
  const pMinX = center.x - half.x;
  const pMaxX = center.x + half.x;
  const pMinZ = center.z - half.z;
  const pMaxZ = center.z + half.z;
  const yLo = Math.floor(feetTarget - EPS) - 1;
  const yHi = Math.floor(feet0 + EPS);
  let best = -Infinity;
  for (let y = yLo; y <= yHi; y++)
    for (let z = Math.floor(pMinZ); z <= Math.floor(pMaxZ); z++)
      for (let x = Math.floor(pMinX); x <= Math.floor(pMaxX); x++)
        for (const b of sampler.collisionBoxes(x, y, z)) {
          if (axisOverlap(pMinX, pMaxX, b[0], b[3]) && axisOverlap(pMinZ, pMaxZ, b[2], b[5])) {
            const top = b[4];
            if (top <= feet0 + EPS && top > best) best = top;
          }
        }
  return best;
}

/** Moves one axis by `d`, snapping the leading face to the nearest blocking AABB face. */
function sweepAxis(
  sampler: SoliditySampler,
  center: Vec3,
  half: Vec3,
  axis: 'x' | 'y' | 'z',
  d: number,
): { value: number; hit: boolean } {
  if (d === 0) return { value: center[axis], hit: false };
  const moved: Vec3 = { ...center, [axis]: center[axis] + d };
  const pMinX = moved.x - half.x;
  const pMaxX = moved.x + half.x;
  const pMinY = moved.y - half.y;
  const pMaxY = moved.y + half.y;
  const pMinZ = moved.z - half.z;
  const pMaxZ = moved.z + half.z;
  const loIdx = axis === 'x' ? 0 : axis === 'y' ? 1 : 2;
  const hiIdx = loIdx + 3;
  let hit = false;
  let limit = d > 0 ? Infinity : -Infinity;
  forEachBoxNear(sampler, pMinX, pMinY, pMinZ, pMaxX, pMaxY, pMaxZ, (b) => {
    if (
      axisOverlap(pMinX, pMaxX, b[0], b[3]) &&
      axisOverlap(pMinY, pMaxY, b[1], b[4]) &&
      axisOverlap(pMinZ, pMaxZ, b[2], b[5])
    ) {
      hit = true;
      limit = d > 0 ? Math.min(limit, b[loIdx]) : Math.max(limit, b[hiIdx]);
    }
  });
  if (!hit) return { value: moved[axis], hit: false };
  const h = half[axis];
  const value = d > 0 ? limit - h - EPS : limit + h + EPS;
  return { value, hit: true };
}

/** Attempts a 1-voxel step-up for a blocked horizontal move; null if still blocked when raised. */
function tryStepUp(
  sampler: SoliditySampler,
  pos: Vec3,
  half: Vec3,
  axis: 'x' | 'z',
  d: number,
): { x: number; y: number; z: number } | null {
  const raised: Vec3 = { ...pos, y: pos.y + 1 + EPS };
  if (overlapsSolid(sampler, raised, half)) return null;
  const result = sweepAxis(sampler, raised, half, axis, d);
  if (result.hit) return null;
  return { ...raised, [axis]: result.value };
}

/**
 * Resolves an AABB move against the sampler. Substeps the delta to stay under one voxel/step,
 * resolving X, Z, then Y. Step-up: a blocked horizontal move with no vertical delta retries raised
 * by 1 voxel. `grounded` is true when a downward move was blocked.
 */
export function resolveCollision(
  sampler: SoliditySampler,
  center: Vec3,
  half: Vec3,
  delta: Vec3,
): CollisionResult {
  const pos: Vec3 = { ...center };
  let grounded = false;

  const maxComp = Math.max(Math.abs(delta.x), Math.abs(delta.y), Math.abs(delta.z));
  const steps = Math.max(1, Math.ceil(maxComp / STEP));
  const sd: Vec3 = { x: delta.x / steps, y: delta.y / steps, z: delta.z / steps };

  for (let s = 0; s < steps; s++) {
    const substepStartY = pos.y;

    // --- X axis ---
    const xResult = sweepAxis(sampler, pos, half, 'x', sd.x);
    let steppedUp = false;
    if (xResult.hit && sd.y === 0 && sd.x !== 0) {
      const stepped = tryStepUp(sampler, pos, half, 'x', sd.x);
      if (stepped !== null) {
        pos.x = stepped.x;
        pos.y = stepped.y;
        steppedUp = true;
      } else {
        pos.x = xResult.value;
      }
    } else {
      pos.x = xResult.value;
    }

    // --- Z axis ---
    const zResult = sweepAxis(sampler, pos, half, 'z', sd.z);
    if (zResult.hit && sd.y === 0 && sd.z !== 0) {
      const stepped = !steppedUp ? tryStepUp(sampler, pos, half, 'z', sd.z) : null;
      if (stepped !== null) {
        pos.z = stepped.z;
        pos.y = stepped.y;
      } else {
        pos.z = zResult.value;
      }
    } else {
      pos.z = zResult.value;
    }

    if (pos.y - substepStartY > 1.0) pos.y = substepStartY + 1.0 + EPS;

    // --- Y axis ---
    if (sd.y < 0) {
      const feet0 = pos.y - half.y;
      const movedDown: Vec3 = { ...pos, y: pos.y + sd.y };
      if (overlapsSolid(sampler, movedDown, half)) {
        const support = highestSupport(sampler, pos, half, feet0, feet0 + sd.y);
        if (support === -Infinity) {
          pos.y += sd.y;
        } else {
          pos.y = support + half.y;
          grounded = true;
        }
      } else {
        pos.y += sd.y;
      }
    } else {
      const y = sweepAxis(sampler, pos, half, 'y', sd.y);
      pos.y = y.value;
    }
  }

  return { center: pos, grounded };
}
```

- [ ] **Step 4: Rewire `PlayerController` + `Game`**

In `src/player/PlayerController.ts`, the `SoliditySampler` import/usage is unchanged in name (still `from '../player/Collision'`), but the interface now requires `collisionBoxes` — no code change beyond it compiling against the new interface (it just forwards the sampler to `resolveCollision`). Read it; if it references `isSolid`/`solidBox` directly, replace those reads with `collisionBoxes` (likely it only forwards the sampler).

In `src/app/Game.ts`, replace the sampler literal (lines ~108–111):

```ts
    const sampler: SoliditySampler = {
      collisionBoxes: (x: number, y: number, z: number) => manager.collisionBoxesAt(x, y, z),
    };
```

(Import `SoliditySampler` type if not already; drop the `isSolid`/`solidBox` sampler fields.)

- [ ] **Step 5: Migrate `tests/collisionSlab.test.ts` + `tests/playerController.test.ts`**

Update their samplers from `{ isSolid, solidBox }` to `{ collisionBoxes }` (use the same `sampler(...)` helper pattern as Step 1, mapping the old `'full'`→`[CUBE_BOX]`, `'lowerHalf'`→`[SLAB_BOX]`, `'none'`→`[]`). The assertions (rest heights, step-up, slab landing) stay the same — they are the parity contract.

- [ ] **Step 6: Run all collision tests + full suite + build**

Run: `npx vitest run tests/collision.test.ts tests/collisionSlab.test.ts tests/playerController.test.ts && npx vitest run && npm run -s build`
Expected: green — parity preserved (cube/slab) AND precise (fence not steppable, stair climbable).

- [ ] **Step 7: Commit**

```bash
git add src/player/Collision.ts src/player/PlayerController.ts src/app/Game.ts tests/collision.test.ts tests/collisionSlab.test.ts tests/playerController.test.ts
git commit -m "feat(player): AABB-list collision — taller fences (unjumpable) + climbable stairs; cube/slab parity"
```

---

### Task 4: Remove the dead enum collision path

**Files:**
- Modify: `src/blocks/BlockRegistry.ts` (remove `collisionBox`, `collisionBoxFor`, the `CollisionBox` import)
- Modify: `src/world/ChunkManager.ts` (remove `solidBox`, its `CollisionBox` import)
- Modify: `src/blocks/blocks.ts` (remove the `CollisionBox` type if no consumer remains)
- Test: none new — the removal is verified by the green suite + build

- [ ] **Step 1: Grep for remaining consumers**

Run: `grep -rn "collisionBox\b\|collisionBoxFor\|\.solidBox\|CollisionBox" src tests`
Expected: only the definitions remain (no callers) after Task 3 rewired everything to `collisionBoxesAt`/`collisionAABBs`. If a test still references the enum, migrate it to `collisionAABBs`/`collisionBoxesAt` first.

- [ ] **Step 2: Remove the dead methods/types**

Delete `BlockRegistry.collisionBox` + `collisionBoxFor` and the `CollisionBox` value from its imports. Delete `ChunkManager.solidBox` and its `CollisionBox` import. Delete the `export type CollisionBox = …` line in `blocks.ts` (only if grep confirms no remaining use).

- [ ] **Step 3: Build + full suite + lint**

Run: `npm run -s build && npx vitest run && npx prettier --check "src/**/*.ts" "tests/**/*.ts" && npx eslint src tests`
Expected: green/clean (`noUnusedLocals` will flag any leftover import — remove it).

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor(collision): remove the dead CollisionBox enum path (solidBox/collisionBox/collisionBoxFor)"
```

---

### Task 5: Final verification + docs

**Files:**
- Modify: `docs/specs/2026-06-30-precise-collision-track-e6-design.md` (status)

- [ ] **Step 1: Lint + format + build + full suite**

Run: `npx prettier --check "src/**/*.ts" "tests/**/*.ts" && npx eslint src tests && npm run -s build && npx vitest run`
Expected: all clean/green.

- [ ] **Step 2: Collision-invariant review (manual read)** — confirm in the green test output:
- Parity: rest on cube top y+1, slab top y+0.5; slide along walls; 1-block cube step-up — unchanged.
- Precision: a 1-tall fence is not steppable/jumpable; a stair is climbable; an open gate is walk-through, a closed gate blocks.
- No save/render change: `emitStair` render regression green; no save-path file touched.
(No live smoke — the headless preview freezes physics; collision is verified by the unit suite. A boot smoke may confirm the build loads without console errors, but movement cannot be exercised.)

- [ ] **Step 3: Boot smoke (optional, build sanity)** — `preview_start`, load `?save=<throwaway>&world=flat`, confirm no console errors and `__vr` is ready (movement isn't testable headless). Stop the server; remove any throwaway save.

- [ ] **Step 4: Update the spec status**

Set `Status:` to `Implemented (PR pending)` in `docs/specs/2026-06-30-precise-collision-track-e6-design.md`.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "docs(specs): mark E6 precise collision implemented; final verification"
```

- [ ] **Step 6: Hand off to finishing-a-development-branch**

Post-merge memory update (AABB collision model, taller fences, climbable stairs) happens then.

---

## Self-Review

**Spec coverage** (6 components): 1 shapeBoxes + AABB → T1; 2 collisionAABBs → T1; 3 collisionBoxesAt → T2; 4 overlap+support → T3; 5 sweep+step-up → T3; 6 Game wiring → T3; enum removal → T4; verify/docs → T5. ✅ Non-goals (no per-arm fence, no slopes, no render/save/id change) respected.

**Type consistency:** `AABB` (T1) flows through `collisionAABBs` (T1) → `collisionBoxesAt` (T2) → `SoliditySampler.collisionBoxes` (T3); `stairBoxes(facing,half)` (T1) reused by `emitStair` (T1) and `collisionAABBs` (T1); `resolveCollision` signature unchanged. The migration keeps every task building (T1/T2 additive; T3 swaps the interface + caller + tests atomically; T4 deletes the now-unreferenced enum).

**Parity safety net:** T3 migrates the existing cube/slab tests to the new sampler asserting the SAME rest heights / step-up / slide — so cube/slab behavior is provably unchanged, while the new fence/stair tests pin the precision. This is the only verification (physics can't be live-played), so the tests are deliberately thorough.

**Placeholder scan:** every code step has full code; the new `Collision.ts` is given in full. The adaptive notes (confirm id constant names; mirror `solidBox`'s coord helpers; check whether `PlayerController` reads the sampler directly) are precise read-then-match instructions, not vague placeholders. EPS/overlap math is pinned (`axisOverlap` with EPS; resting contact is non-overlapping by construction).
