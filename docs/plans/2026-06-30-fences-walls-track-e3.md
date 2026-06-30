# Fences + Walls (Track E3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `'fence'` and `'wall'` block shapes whose geometry (a central post + arms toward connected neighbours) is derived from the `VoxelView` at mesh time — no stored state, no save change.

**Architecture:** Two shapes share one connection-driven emitter `emitConnected` that reads the 4 horizontal neighbours and emits a post box + an arm box per connected side, all through the existing `emitBoxCulled`. Connection rule: connect to a full opaque cube (`occludes`) or a same-shape block. Collision is `'full'`.

**Tech Stack:** TypeScript (strict), three.js, Vitest. Builds entirely on E1/E2 (`shape` discriminator, `emitShaped`/`emitBoxCulled`, `BlockRegistry.shape/occludes/collisionBox`).

## Global Constraints

- Block ids append-only ∈ [0,255]; fences/walls are 35–37. Next free id is **35**.
- **No `SAVE_VERSION` / save-format change; no new player interaction.**
- The cube/slab/stair/cross/plant render + collision paths are **byte-identical** (the only `emitShaped` change is a new dispatch branch + the new pure `emitConnected`; `emitBoxCulled` is unchanged and reused).
- Strict TS, no `any`; prettier+eslint clean (prettier violations are eslint errors); `npm run -s build` (tsc+vite) green after any type-touching task; full vitest suite green.
- `BlockRegistry.selfCheck()` still passes; the `Shape` switch stays exhaustive.

## Spec

`docs/specs/2026-06-30-fences-walls-track-e3-design.md`. This plan implements its 5 components.

## File Structure

- `src/blocks/blocks.ts` — add `'fence'`/`'wall'` to `Shape`; the 3 new blocks (T3).
- `src/blocks/BlockRegistry.ts` — `isShape` + `collisionBox` cases; new `connectsTo`.
- `src/mesh/emitShaped.ts` — `emitConnected` + the fence/wall geometry profiles + dispatch.

---

### Task 1: `'fence'` / `'wall'` shapes + registry helpers

**Files:**
- Modify: `src/blocks/blocks.ts` (`Shape` union)
- Modify: `src/blocks/BlockRegistry.ts` (`isShape`, `collisionBox`, `connectsTo`)
- Test: `tests/fenceRegistry.test.ts` (new)

**Interfaces:**
- Produces: `Shape` includes `'fence'|'wall'`; `registry.collisionBox(fence|wall) === 'full'`; `registry.occludes(fence|wall) === false`; `registry.connectsTo(selfId, neighborId): boolean = occludes(neighborId) || shape(neighborId) === shape(selfId)`.

- [ ] **Step 1: Write the failing test** — `tests/fenceRegistry.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { BlockRegistry } from '../src/blocks/BlockRegistry';
import { buildBlockTextures, type BlockDef } from '../src/blocks/blocks';

const stoneFaces = { pattern: 'stone' as const, colors: [[128, 128, 132] as [number, number, number]] };
const planks = { pattern: 'planks' as const, colors: [[165, 130, 80] as [number, number, number]] };
const DEFS: BlockDef[] = [
  { id: 0, name: 'air', opaque: false, transparent: true },
  { id: 1, name: 'stone', opaque: true, transparent: false, faces: stoneFaces }, // full cube
  { id: 2, name: 'fence', opaque: true, transparent: false, shape: 'fence', faces: planks },
  { id: 3, name: 'fence2', opaque: true, transparent: false, shape: 'fence', faces: planks },
  { id: 4, name: 'wall', opaque: true, transparent: false, shape: 'wall', faces: stoneFaces },
  { id: 5, name: 'slab', opaque: true, transparent: false, shape: 'slab', faces: stoneFaces },
];
const reg = new BlockRegistry(DEFS, buildBlockTextures(DEFS));

describe('fence/wall registry', () => {
  it('collide as full and do not occlude', () => {
    expect(reg.collisionBox(2)).toBe('full');
    expect(reg.collisionBox(4)).toBe('full');
    expect(reg.occludes(2)).toBe(false);
    expect(reg.occludes(4)).toBe(false);
  });
  it('connectsTo: same-shape and full cubes connect; fence/wall and air/slab do not', () => {
    expect(reg.connectsTo(2, 3)).toBe(true); // fence ↔ fence
    expect(reg.connectsTo(2, 1)).toBe(true); // fence ↔ full cube
    expect(reg.connectsTo(4, 4)).toBe(true); // wall ↔ wall
    expect(reg.connectsTo(2, 4)).toBe(false); // fence ↔ wall (different shape)
    expect(reg.connectsTo(2, 0)).toBe(false); // fence ↔ air
    expect(reg.connectsTo(2, 5)).toBe(false); // fence ↔ slab
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/fenceRegistry.test.ts`
Expected: FAIL — `'fence'` not a valid `Shape`; `connectsTo` absent.

- [ ] **Step 3: Add the shapes to `src/blocks/blocks.ts`**

```ts
export type Shape = 'cube' | 'slab' | 'cross' | 'stair' | 'fence' | 'wall';
```

- [ ] **Step 4: Update `src/blocks/BlockRegistry.ts`**

In `isShape` (the module-level helper), add the two names:

```ts
function isShape(value: string): value is Shape {
  return (
    value === 'cube' ||
    value === 'slab' ||
    value === 'cross' ||
    value === 'stair' ||
    value === 'fence' ||
    value === 'wall'
  );
}
```

In `collisionBox`, add the fence/wall cases (they share `'full'`):

```ts
  collisionBox(id: BlockId): CollisionBox {
    switch (this.shape(id)) {
      case 'cube':
      case 'fence':
      case 'wall':
        return 'full';
      case 'slab':
      case 'stair':
        return 'lowerHalf';
      case 'cross':
        return 'none';
    }
  }
```

Add the `connectsTo` method (after `occludes`):

```ts
  /** True if a fence/wall `self` should connect to `neighbor`: a full opaque cube, or the same shape. */
  connectsTo(self: BlockId, neighbor: BlockId): boolean {
    return this.occludes(neighbor) || this.shape(neighbor) === this.shape(self);
  }
```

- [ ] **Step 5: Run the test + full suite + build**

Run: `npx vitest run tests/fenceRegistry.test.ts && npx vitest run && npm run -s build`
Expected: green (additive; existing blocks are cubes/slabs/stairs — unaffected).

- [ ] **Step 6: Commit**

```bash
git add src/blocks/blocks.ts src/blocks/BlockRegistry.ts tests/fenceRegistry.test.ts
git commit -m "feat(blocks): 'fence'/'wall' shapes + connectsTo + full collision"
```

---

### Task 2: `emitConnected` — post + neighbour-driven arms

**Files:**
- Modify: `src/mesh/emitShaped.ts` (geometry profiles + `emitConnected` + dispatch)
- Test: `tests/emitConnected.test.ts` (new)

**Interfaces:**
- Consumes: `registry.shape`/`connectsTo` (T1); the existing `emitBoxCulled`, `Buf`, `VoxelView.get`.
- Produces: `emitConnected` routed from `emitShaped` for `'fence'`/`'wall'`; fences/walls emit into the opaque `slabs` buffer.

- [ ] **Step 1: Write the failing test** — `tests/emitConnected.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { ChunkData } from '../src/world/ChunkData';
import { VoxelView } from '../src/world/VoxelView';
import { BlockRegistry } from '../src/blocks/BlockRegistry';
import { buildBlockTextures, type BlockDef } from '../src/blocks/blocks';
import { emitShaped } from '../src/mesh/emitShaped';

const planks = { pattern: 'planks' as const, colors: [[165, 130, 80] as [number, number, number]] };
const DEFS: BlockDef[] = [
  { id: 0, name: 'air', opaque: false, transparent: true },
  { id: 1, name: 'fence', opaque: true, transparent: false, shape: 'fence', faces: planks },
];
const reg = new BlockRegistry(DEFS, buildBlockTextures(DEFS));
const view = (d: ChunkData) => new VoxelView(d, () => undefined);

describe('emitConnected (fence)', () => {
  it('a lone fence emits only the post (one box = 24 verts in open air)', () => {
    const d = new ChunkData(0, 0);
    d.set(4, 10, 4, 1);
    const { slabs } = emitShaped(view(d), reg);
    expect(slabs.positions.length / 3).toBe(24); // post box, 6 faces × 4
  });

  it('a fence with one fence neighbour adds 2 rails toward that side only', () => {
    const d = new ChunkData(0, 0);
    d.set(4, 10, 4, 1);
    d.set(5, 10, 4, 1); // fence to +X
    const { slabs } = emitShaped(view(d), reg);
    // the (4,10,4) fence: post(24) + 2 rails toward +X(48) ; the (5,10,4) fence: post(24) + 2 rails toward -X(48)
    expect(slabs.positions.length / 3).toBe(24 + 48 + 24 + 48);
  });
});

describe('emitConnected cross-chunk', () => {
  it('connects to a fence in the neighbour chunk at the border', () => {
    const center = new ChunkData(0, 0);
    center.set(15, 10, 4, 1); // fence at the +X edge of chunk (0,0)
    const east = new ChunkData(1, 0);
    east.set(0, 10, 4, 1); // fence at local x=0 of chunk (1,0) == world x=16, the +X neighbour
    const v = new VoxelView(center, (dcx, dcz) => (dcx === 1 && dcz === 0 ? east : undefined));
    const { slabs } = emitShaped(v, reg);
    // center fence: post(24) + 2 rails toward +X(48) = 72 (no other neighbours)
    expect(slabs.positions.length / 3).toBe(72);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/emitConnected.test.ts`
Expected: FAIL — fences are not emitted (no `'fence'` dispatch), so `positions.length === 0`.

- [ ] **Step 3: Add the geometry + `emitConnected` to `src/mesh/emitShaped.ts`**

After `emitStair` (before `emitCross`), add the profiles and emitter:

```ts
/** Box dimensions for a connecting shape, in local voxel units (0..1). */
interface ConnProfile {
  /** Central post box [lo, hi] (local). */
  post: [[number, number, number], [number, number, number]];
  /** The post's low/high edge on the x/z axes (where arms start). */
  postLo: number;
  postHi: number;
  /** Half-thickness of an arm on its perpendicular horizontal axis. */
  armHalf: number;
  /** [yLo, yHi] for each rail of an arm (fence = two rails, wall = one bar). */
  rails: Array<[number, number]>;
}

const FENCE_PROFILE: ConnProfile = {
  post: [
    [0.375, 0, 0.375],
    [0.625, 1, 0.625],
  ],
  postLo: 0.375,
  postHi: 0.625,
  armHalf: 0.1,
  rails: [
    [0.35, 0.55],
    [0.7, 0.9],
  ],
};

const WALL_PROFILE: ConnProfile = {
  post: [
    [0.25, 0, 0.25],
    [0.75, 1, 0.75],
  ],
  postLo: 0.25,
  postHi: 0.75,
  armHalf: 0.2,
  rails: [[0, 0.8]],
};

/** The 4 horizontal connection directions as (dx, dz). */
const CONN_DIRS: ReadonlyArray<[number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/** Arm rail boxes reaching from the post toward boundary (dx,dz), centred on the perpendicular axis. */
function armBoxes(
  x: number,
  y: number,
  z: number,
  dx: number,
  dz: number,
  p: ConnProfile,
): Array<[[number, number, number], [number, number, number]]> {
  const c = 0.5; // perpendicular centre
  return p.rails.map(([yLo, yHi]): [[number, number, number], [number, number, number]] => {
    if (dx === 1)
      return [
        [x + p.postHi, y + yLo, z + c - p.armHalf],
        [x + 1, y + yHi, z + c + p.armHalf],
      ];
    if (dx === -1)
      return [
        [x, y + yLo, z + c - p.armHalf],
        [x + p.postLo, y + yHi, z + c + p.armHalf],
      ];
    if (dz === 1)
      return [
        [x + c - p.armHalf, y + yLo, z + p.postHi],
        [x + c + p.armHalf, y + yHi, z + 1],
      ];
    return [
      [x + c - p.armHalf, y + yLo, z],
      [x + c + p.armHalf, y + yHi, z + p.postLo],
    ];
  });
}

/** Emits a fence/wall: a central post + an arm toward each connected horizontal neighbour. */
function emitConnected(
  buf: Buf,
  view: VoxelView,
  registry: BlockRegistry,
  id: number,
  x: number,
  y: number,
  z: number,
): void {
  const p = registry.shape(id) === 'wall' ? WALL_PROFILE : FENCE_PROFILE;
  emitBoxCulled(
    buf,
    view,
    registry,
    id,
    x,
    y,
    z,
    [x + p.post[0][0], y + p.post[0][1], z + p.post[0][2]],
    [x + p.post[1][0], y + p.post[1][1], z + p.post[1][2]],
  );
  for (const [dx, dz] of CONN_DIRS) {
    if (!registry.connectsTo(id, view.get(x + dx, y, z + dz))) continue;
    for (const [lo, hi] of armBoxes(x, y, z, dx, dz, p)) {
      emitBoxCulled(buf, view, registry, id, x, y, z, lo, hi);
    }
  }
}
```

In the `emitShaped` dispatch loop, add the branch (alongside `slab`/`stair`/`cross`):

```ts
        if (shape === 'slab') emitSlab(slabs, view, registry, id, x, y, z);
        else if (shape === 'stair') emitStair(slabs, view, registry, id, x, y, z);
        else if (shape === 'fence' || shape === 'wall')
          emitConnected(slabs, view, registry, id, x, y, z);
        else if (shape === 'cross') emitCross(cross, view, registry, id, x, y, z);
```

- [ ] **Step 4: Run the test + the E1/E2 mesh regressions + build**

Run: `npx vitest run tests/emitConnected.test.ts tests/emitShaped.test.ts tests/emitStair.test.ts && npm run -s build`
Expected: new test PASS; the slab/stair tests still pass (only a new dispatch branch was added; existing emitters untouched).

- [ ] **Step 5: Full suite + commit**

```bash
npx vitest run
git add src/mesh/emitShaped.ts tests/emitConnected.test.ts
git commit -m "feat(mesh): emitConnected — fence/wall post + neighbour-driven arms"
```

---

### Task 3: Content — oak fence + cobble/stone-brick walls

**Files:**
- Modify: `src/blocks/blocks.ts` (ids 35–37)
- Test: `tests/fenceContent.test.ts` (new)

**Interfaces:**
- Consumes: `Shape` `'fence'`/`'wall'` (T1).
- Produces: `OAK_FENCE = 35`, `COBBLE_WALL = 36`, `STONEBRICK_WALL = 37`.

- [ ] **Step 1: Write the failing test** — `tests/fenceContent.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { BlockRegistry } from '../src/blocks/BlockRegistry';
import { OAK_FENCE, COBBLE_WALL, STONEBRICK_WALL } from '../src/blocks/blocks';

const reg = new BlockRegistry();

describe('fence/wall content', () => {
  it('has stable ids 35-37', () => {
    expect([OAK_FENCE, COBBLE_WALL, STONEBRICK_WALL]).toEqual([35, 36, 37]);
  });
  it('the fence is fence-shaped, the walls wall-shaped; all full-collision, creative, faces resolve', () => {
    expect(reg.shape(OAK_FENCE)).toBe('fence');
    expect(reg.shape(COBBLE_WALL)).toBe('wall');
    expect(reg.shape(STONEBRICK_WALL)).toBe('wall');
    for (const id of [OAK_FENCE, COBBLE_WALL, STONEBRICK_WALL]) {
      expect(reg.collisionBox(id)).toBe('full');
      expect(reg.occludes(id)).toBe(false);
      expect(reg.get(id).creative).toBe(true);
      expect(() => reg.faceLayer(id, 0)).not.toThrow();
    }
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/fenceContent.test.ts`
Expected: FAIL — `OAK_FENCE` not exported.

- [ ] **Step 3: Add the id constants in `src/blocks/blocks.ts`**

After `export const STAIRS_BRICK: BlockId = 34;`:

```ts
export const OAK_FENCE: BlockId = 35;
export const COBBLE_WALL: BlockId = 36;
export const STONEBRICK_WALL: BlockId = 37;
```

- [ ] **Step 4: Add the `BLOCK_DEFS` rows** (append, after `STAIRS_BRICK`)

```ts
  {
    id: OAK_FENCE,
    name: 'oak fence',
    opaque: true,
    transparent: false,
    creative: true,
    shape: 'fence',
    faces: { pattern: 'planks', colors: [[150, 116, 70]] },
  },
  {
    id: COBBLE_WALL,
    name: 'cobblestone wall',
    opaque: true,
    transparent: false,
    creative: true,
    shape: 'wall',
    faces: {
      pattern: 'cobble',
      colors: [
        [118, 118, 122],
        [70, 70, 74],
      ],
    },
  },
  {
    id: STONEBRICK_WALL,
    name: 'stone brick wall',
    opaque: true,
    transparent: false,
    creative: true,
    shape: 'wall',
    faces: {
      pattern: 'brick',
      colors: [
        [120, 120, 124],
        [150, 150, 154],
      ],
    },
  },
```

- [ ] **Step 5: Run the test + full suite + build**

Run: `npx vitest run tests/fenceContent.test.ts && npx vitest run && npm run -s build`
Expected: green. (If a test asserts an exact `TEXTURE_LAYER_COUNT`/`CREATIVE_BLOCKS` count, update it to the new value and report old→new; the Track C/E2 suites used dynamic assertions so likely no change.)

- [ ] **Step 6: Commit**

```bash
git add src/blocks/blocks.ts tests/fenceContent.test.ts
git commit -m "feat(blocks): oak fence + cobblestone/stone-brick walls (ids 35-37)"
```

---

### Task 4: Final verification + docs

**Files:**
- Modify: `docs/specs/2026-06-30-fences-walls-track-e3-design.md` (Status → implemented)
- Test: none new — full suite + build + live smoke

- [ ] **Step 1: Lint + format + build + full suite**

Run: `npx prettier --check "src/**/*.ts" "tests/**/*.ts" && npx eslint src tests && npm run -s build && npx vitest run`
Expected: all clean/green (run `npx prettier --write` on anything flagged, re-check, commit).

- [ ] **Step 2: Live smoke (dev server + preview tools)** — verify the observable behaviour:
- Place a line of `OAK_FENCE` (35) → adjacent posts grow arms into a continuous rail; the line butting into a stone cube grows an arm into the cube.
- Place a `COBBLE_WALL` (36) line → connects into a wall run; place a fence next to a wall → they do NOT cross-connect (each just shows a bare post against the other).
- Walk the player into a fence → blocked (full collision); confirm you can see through the gaps.
Capture a screenshot as proof (use a throwaway `?save=<name>&world=flat`; do not touch real saves).

- [ ] **Step 3: Update the spec status**

In `docs/specs/2026-06-30-fences-walls-track-e3-design.md` set `Status:` to `Implemented (PR pending)`.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "docs(specs): mark E3 fences/walls implemented; final verification"
```

- [ ] **Step 5: Hand off to finishing-a-development-branch**

The post-merge memory update (the connecting shapes + the new content) happens then.

---

## Self-Review

**Spec coverage** (5 components): 1 shapes + registry → T1; 2 `emitConnected` → T2; 3 cross-chunk re-mesh → reuses existing wiring, exercised by T2's cross-chunk test (no new code, so no task); 4 collision `'full'` + light → T1 (`collisionBox`); 5 content → T3. ✅ Non-goals (no gates, no taller collision, no cross-connect, no save change) respected.

**Type consistency:** `Shape` `'fence'|'wall'` (T1) consumed by `emitConnected`/dispatch (T2) + content (T3); `connectsTo(self, neighbor)` (T1) consumed by `emitConnected` (T2); `emitBoxCulled`/`Buf`/`VoxelView.get` are the existing E1/E2 signatures reused unchanged. Consistent.

**Cube-byte-identical:** the only `emitShaped` change is a new `else if` dispatch branch + the new `emitConnected`; `emitBoxCulled` and the slab/stair/cross emitters are untouched, so cube/slab/stair/cross worlds mesh identically. T2 re-runs the E1 slab + E2 stair regression tests.

**Placeholder scan:** every code step has full code; every test step has assertions. The exact post/arm dimensions are concrete literals in T2 (no "tune later").
