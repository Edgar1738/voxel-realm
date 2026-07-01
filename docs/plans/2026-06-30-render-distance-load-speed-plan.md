# Render Distance & Load Speed (Tier 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the voxel world load faster on spawn and render as far as the machine sustains at 60 FPS, and stop the night-time stars painting over foreground terrain.

**Architecture:** Four independent, low-risk changes. (1) Height-capped meshing: skip the empty air above each chunk's tallest voxel — the enabler that makes more chunks affordable. (2) An adaptive view-distance governor that grows/shrinks the loaded radius from measured frame time, retuning distance fog to the moving boundary. (3) A cold-start budget burst for a fast first fill. (4) A one-property depth-test fix for the star field. No web workers, no LOD, no persistence-format change.

**Tech Stack:** TypeScript, Three.js (RawShaderMaterial chunk shader with existing distance fog), Vite, Vitest. Greedy mesher + chunk streaming are custom.

## Global Constraints

- `WORLD_HEIGHT = 192` and the persistence `SAVE_VERSION` are **untouched** (no save migration).
- Height-capped meshing must produce **byte-identical** mesh output vs. the uncapped path — it is a pure speedup, never a visual change.
- The governor and budget-burst wiring must be **always-on** (production + dev), independent of the DEV-only `FrameProfiler`.
- Follow existing conventions: pure/unit-testable modules, TDD, `rtk` prefix on shell commands, conventional commits ending with the `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>` trailer.
- Run tests from the worktree with `rtk vitest run`. Baseline is 743 passing.

---

### Task 1: Track `maxSolidY` on ChunkData

**Files:**
- Modify: `src/world/ChunkData.ts`
- Test: `tests/chunkData.test.ts`

**Interfaces:**
- Produces: `ChunkData.maxSolidY: number` (highest y holding a non-AIR voxel, or `-1` for all-air), maintained O(1) in `set()`; and `ChunkData.recomputeMaxSolidY(): void` for write paths that bypass `set()`.
- Consumes: nothing new.

- [ ] **Step 1: Write the failing tests**

Add to `tests/chunkData.test.ts`:

```ts
import { WORLD_HEIGHT } from '../src/core/constants';

describe('ChunkData.maxSolidY', () => {
  it('is -1 for an all-air chunk', () => {
    expect(new ChunkData(0, 0).maxSolidY).toBe(-1);
  });

  it('rises to the highest non-air voxel set', () => {
    const c = new ChunkData(0, 0);
    c.set(3, 10, 5, STONE);
    expect(c.maxSolidY).toBe(10);
    c.set(1, 5, 1, STONE); // lower — no change
    expect(c.maxSolidY).toBe(10);
    c.set(0, 20, 0, STONE); // higher — rises
    expect(c.maxSolidY).toBe(20);
  });

  it('does not fall when a voxel is cleared to AIR (stays monotonic)', () => {
    const c = new ChunkData(0, 0);
    c.set(0, 20, 0, STONE);
    c.set(0, 20, 0, AIR);
    expect(c.maxSolidY).toBe(20);
  });

  it('recomputes the exact max after a bulk write that bypasses set()', () => {
    const c = new ChunkData(0, 0);
    c.data[c.data.length - 1] = STONE; // top-most voxel, written directly
    expect(c.maxSolidY).toBe(-1); // set() was bypassed
    c.recomputeMaxSolidY();
    expect(c.maxSolidY).toBe(WORLD_HEIGHT - 1);
  });

  it('recomputes to -1 for an all-air chunk', () => {
    const c = new ChunkData(0, 0);
    c.recomputeMaxSolidY();
    expect(c.maxSolidY).toBe(-1);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `rtk vitest run tests/chunkData.test.ts`
Expected: FAIL (`maxSolidY` / `recomputeMaxSolidY` undefined).

- [ ] **Step 3: Implement the tracking**

In `src/world/ChunkData.ts`, extend the imports and class. Update the import line:

```ts
import { CHUNK_AREA, CHUNK_SIZE_X, CHUNK_SIZE_Z, CHUNK_VOLUME, WORLD_HEIGHT } from '../core/constants';
```

Add the field (next to `hasShaped`):

```ts
/**
 * Highest y that holds a non-AIR voxel, or -1 for an all-air chunk. Maintained O(1) in set()
 * (monotonic: only ever raised, so clearing the top voxel leaves it one slice high — harmless).
 * Used to cap meshing height so the empty air above terrain is never swept.
 */
maxSolidY = -1;
```

Raise it inside `set()` (after the assignment):

```ts
set(x: number, y: number, z: number, id: BlockId): void {
  if (!inChunkBounds(x, y, z)) {
    throw new RangeError(`ChunkData.set out of bounds: (${x}, ${y}, ${z})`);
  }
  this.data[voxelIndex(x, y, z)] = id;
  if (id !== AIR && y > this.maxSolidY) this.maxSolidY = y;
}
```

Add the recompute method (after `set`):

```ts
/** Recomputes the exact maxSolidY by scanning voxels top-down; for bulk writes that bypass set(). */
recomputeMaxSolidY(): void {
  for (let y = WORLD_HEIGHT - 1; y >= 0; y--) {
    for (let z = 0; z < CHUNK_SIZE_Z; z++) {
      for (let x = 0; x < CHUNK_SIZE_X; x++) {
        if (this.data[voxelIndex(x, y, z)] !== AIR) {
          this.maxSolidY = y;
          return;
        }
      }
    }
  }
  this.maxSolidY = -1;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `rtk vitest run tests/chunkData.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
rtk git add src/world/ChunkData.ts tests/chunkData.test.ts
rtk git commit -m "feat(world): track ChunkData.maxSolidY for height-capped meshing

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Height-cap the greedy mesher and wire it in

**Files:**
- Modify: `src/mesh/GreedyMesher.ts`
- Modify: `src/world/ChunkManager.ts:699-712` (`meshChunk`)
- Test: `tests/greedyMesher.test.ts`

**Interfaces:**
- Consumes: `ChunkData.maxSolidY` (Task 1).
- Produces: `GreedyMesher.mesh(view, pass, maxY?)` — `maxY` is the inclusive highest Y to sweep, default `WORLD_HEIGHT - 1` (unchanged behavior). `ChunkManager.meshChunk` passes `entry.data.maxSolidY`.

**Why center-only cap is correct:** a face is only emitted for a cell the pass `includes()`; every cell above `maxSolidY` is AIR, which no pass includes, so no face exists there. AO/border reads sample the real `VoxelView` (neighbors included) and are **not** bounded by `maxY`, so a taller neighbor still culls/darkens correctly. Thus `maxY = maxSolidY` yields identical output.

- [ ] **Step 1: Write the failing tests**

Add to `tests/greedyMesher.test.ts` (the fixtures use the existing `viewOf`, `mesher`, `OPAQUE`, `reg`):

```ts
import { WORLD_HEIGHT } from '../src/core/constants';

function meshesEqual(a: ReturnType<GreedyMesher['mesh']>, b: ReturnType<GreedyMesher['mesh']>): void {
  expect(Array.from(a.positions)).toEqual(Array.from(b.positions));
  expect(Array.from(a.indices)).toEqual(Array.from(b.indices));
  expect(Array.from(a.normals)).toEqual(Array.from(b.normals));
  expect(Array.from(a.uvs)).toEqual(Array.from(b.uvs));
  expect(Array.from(a.layers)).toEqual(Array.from(b.layers));
  expect(Array.from(a.ao)).toEqual(Array.from(b.ao));
  expect(Array.from(a.light)).toEqual(Array.from(b.light));
  expect(Array.from(a.tint)).toEqual(Array.from(b.tint));
}

describe('GreedyMesher height cap (maxY)', () => {
  it('default maxY matches an explicit WORLD_HEIGHT-1 cap', () => {
    const c = new ChunkData(0, 0);
    c.set(2, 3, 4, STONE);
    c.set(5, 30, 6, STONE);
    meshesEqual(mesher.mesh(viewOf(c), OPAQUE), mesher.mesh(viewOf(c), OPAQUE, WORLD_HEIGHT - 1));
  });

  it('a cap at the tallest voxel is identical to the uncapped mesh', () => {
    const c = new ChunkData(0, 0);
    for (let x = 0; x < CHUNK_SIZE_X; x++)
      for (let z = 0; z < CHUNK_SIZE_Z; z++) c.set(x, 0, z, GRASS); // ground
    c.set(8, 40, 8, STONE); // a lone pillar-top at y=40
    meshesEqual(mesher.mesh(viewOf(c), OPAQUE), mesher.mesh(viewOf(c), OPAQUE, c.maxSolidY));
  });

  it('is identical for a capped water surface', () => {
    const c = new ChunkData(0, 0);
    for (let x = 4; x < 7; x++)
      for (let z = 4; z < 7; z++) {
        c.set(x, 10, z, WATER);
        c.set(x, 11, z, WATER);
      }
    const pass = transparentPass(reg);
    meshesEqual(mesher.mesh(viewOf(c), pass), mesher.mesh(viewOf(c), pass, c.maxSolidY));
  });

  it('is identical even when a neighbor is much taller than the center (center-only cap)', () => {
    const c = new ChunkData(0, 0);
    const east = new ChunkData(1, 0);
    for (let z = 0; z < CHUNK_SIZE_Z; z++) {
      c.set(CHUNK_SIZE_X - 1, 20, z, STONE); // center border wall to y=20
      for (let y = 0; y <= 100; y++) east.set(0, y, z, STONE); // east neighbor to y=100
    }
    const nb: NeighborLookup = (dcx, dcz) => (dcx === 1 && dcz === 0 ? east : undefined);
    meshesEqual(mesher.mesh(viewOf(c, nb), OPAQUE), mesher.mesh(viewOf(c, nb), OPAQUE, c.maxSolidY));
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `rtk vitest run tests/greedyMesher.test.ts`
Expected: FAIL (`mesh` takes 2 args; the 3-arg calls are type errors / ignored).

- [ ] **Step 3: Thread `maxY` through the mesher**

In `src/mesh/GreedyMesher.ts`, change `mesh()` to accept the cap and pass it to each direction:

```ts
mesh(view: VoxelView, pass: MeshPass, maxY: number = WORLD_HEIGHT - 1): MeshData {
  const buf: Buffers = {
    positions: [], normals: [], uvs: [], layers: [], ao: [], light: [], tint: [], indices: [], vertCount: 0,
  };

  for (let axis = 0; axis < 3; axis++) {
    const u = (axis + 1) % 3;
    const v = (axis + 2) % 3;
    this.meshDirection(view, axis, u, v, 1, pass, buf, maxY);
    this.meshDirection(view, axis, u, v, -1, pass, buf, maxY);
  }

  return {
    positions: new Float32Array(buf.positions),
    normals: new Float32Array(buf.normals),
    uvs: new Float32Array(buf.uvs),
    layers: new Float32Array(buf.layers),
    ao: new Float32Array(buf.ao),
    light: new Float32Array(buf.light),
    tint: new Float32Array(buf.tint),
    indices: new Uint32Array(buf.indices),
  };
}
```

Rewrite `meshDirection` to cap the Y role of the sweep. Y is dimension index 1; keep `du` as the mask row **stride** but shrink the loop **bounds**:

```ts
private meshDirection(
  view: VoxelView,
  axis: number,
  u: number,
  v: number,
  sign: number,
  pass: MeshPass,
  buf: Buffers,
  maxY: number,
): void {
  const du = DIMS[u];
  const dv = DIMS[v];
  const dd = DIMS[axis];

  // Cap whichever of the three roles maps to the Y axis (index 1) so empty air above the
  // tallest voxel is never swept. yCount is the inclusive Y bound + 1, clamped to [0, WORLD_HEIGHT].
  const yCount = Math.max(0, Math.min(WORLD_HEIGHT, maxY + 1));
  const ddEff = axis === 1 ? Math.min(dd, yCount) : dd;
  const aMax = u === 1 ? Math.min(du, yCount) : du; // bound on the a-loop (stride stays du)
  const bMax = v === 1 ? Math.min(dv, yCount) : dv; // bound on the b-loop

  // Scratch for AO levels; reused each cell to avoid per-cell allocation.
  const aoLevels: [number, number, number, number] = [0, 0, 0, 0];

  for (let i = 0; i < ddEff; i++) {
    // Reuse the pooled mask buffer — clear only the region we will write (stride du).
    this._mask.fill(null, 0, du * bMax);
    const mask = this._mask;

    for (let b = 0; b < bMax; b++) {
      for (let a = 0; a < aMax; a++) {
        this._solid[axis] = i;
        this._solid[u] = a;
        this._solid[v] = b;

        const id = view.get(this._solid[0], this._solid[1], this._solid[2]);
        if (!pass.includes(id)) continue;

        this._neighbor[0] = this._solid[0];
        this._neighbor[1] = this._solid[1];
        this._neighbor[2] = this._solid[2];
        this._neighbor[axis] += sign;
        const neighborId = view.get(this._neighbor[0], this._neighbor[1], this._neighbor[2]);
        if (!pass.faceVisible(id, neighborId)) continue;

        const layer = this.registry.faceLayer(id, faceFor(axis, sign));
        const ao = this.cornerAO(view, this._solid, axis, sign, u, v, aoLevels);
        const sky = view.skyLight(this._neighbor[0], this._neighbor[1], this._neighbor[2]);
        const block = view.blockLight(this._neighbor[0], this._neighbor[1], this._neighbor[2]);
        const light = sky * 16 + block;

        const category = this.registry.tintCategory(id, faceFor(axis, sign));
        const tintIndex = category
          ? tintIndexFor(view.biomeAt(this._solid[0], this._solid[2]), category)
          : 0;
        const tint = TINT_PALETTE[tintIndex] ?? WHITE;

        const key =
          (tintIndex << 24) |
          (layer << 16) |
          (packAoLevels(aoLevels[0], aoLevels[1], aoLevels[2], aoLevels[3]) << 8) |
          light;
        mask[a + b * du] = { layer, ao, light, key, tint };
      }
    }

    this.emitMask(mask, du, aMax, bMax, axis, u, v, sign, i, buf);
  }
}
```

Update `emitMask` to take the stride and the two bounds separately (stride keeps indexing identical; bounds shrink the scan):

```ts
private emitMask(
  mask: (MaskCell | null)[],
  stride: number,
  aMax: number,
  bMax: number,
  axis: number,
  u: number,
  v: number,
  sign: number,
  i: number,
  buf: Buffers,
): void {
  // Reuse the pooled visited buffer — zero only the region we will inspect.
  this._visited.fill(0, 0, stride * bMax);
  const visited = this._visited;

  for (let b = 0; b < bMax; b++) {
    for (let a = 0; a < aMax; a++) {
      const idx = a + b * stride;
      const cell = mask[idx];
      if (!cell || visited[idx]) continue;

      // Extend width along u.
      let w = 1;
      while (a + w < aMax) {
        const c2 = mask[a + w + b * stride];
        if (!c2 || visited[a + w + b * stride] || c2.key !== cell.key) break;
        w++;
      }

      // Extend height along v.
      let h = 1;
      let stop = false;
      while (b + h < bMax && !stop) {
        for (let k = 0; k < w; k++) {
          const c2 = mask[a + k + (b + h) * stride];
          if (!c2 || visited[a + k + (b + h) * stride] || c2.key !== cell.key) {
            stop = true;
            break;
          }
        }
        if (!stop) h++;
      }

      for (let bb = 0; bb < h; bb++)
        for (let aa = 0; aa < w; aa++) visited[a + aa + (b + bb) * stride] = 1;

      this.emitQuad(buf, axis, u, v, sign, i, a, b, w, h, cell);
    }
  }
}
```

(`WORLD_HEIGHT` is already imported at the top of `GreedyMesher.ts`.)

- [ ] **Step 4: Run the mesher tests to verify they pass**

Run: `rtk vitest run tests/greedyMesher.test.ts`
Expected: PASS (new cap tests + the existing byte-identical regression tests, which prove the default path is unchanged).

- [ ] **Step 5: Wire the cap into ChunkManager**

In `src/world/ChunkManager.ts`, `meshChunk` (around line 699), pass the chunk's `maxSolidY` as the cap to both greedy passes:

```ts
private meshChunk(cx: number, cz: number): void {
  const entry = this.store.get(cx, cz);
  if (!entry) return;
  this.frameMesh++;
  const capY = entry.data.maxSolidY; // height-cap: never sweep empty air above the tallest voxel
  const view = new VoxelView(entry.data, (dcx, dcz) => this.neighborData(cx + dcx, cz + dcz));
  const shaped = emitShaped(view, this.registry, entry.data.hasShaped);
  const meshes: ChunkMeshes = {
    opaque: mergeMeshData(this.mesher.mesh(view, this.opaquePass, capY), shaped.slabs),
    transparent: this.mesher.mesh(view, this.transparentPass, capY),
    cutout: shaped.cross,
  };
  this.sink.upload(chunkKey(cx, cz), meshes);
  this.store.setState(cx, cz, ChunkState.Meshed);
}
```

In `ensureGenerated` (around line 632), recompute the exact cap after all writes (belt-and-suspenders vs. any generator/overlay that writes `data` directly). Insert one line:

```ts
this.applySavedDeltas(data, key);
data.hasShaped = this.scanHasShaped(data);
data.recomputeMaxSolidY();
this.recomputeLight(data);
```

- [ ] **Step 6: Run the full suite to verify nothing regressed**

Run: `rtk vitest run`
Expected: PASS (743+ tests). The existing `chunkManager*` tests exercise the wired path.

- [ ] **Step 7: Commit**

```bash
rtk git add src/mesh/GreedyMesher.ts src/world/ChunkManager.ts tests/greedyMesher.test.ts
rtk git commit -m "perf(mesh): height-cap greedy meshing to the tallest voxel per chunk

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Runtime view-distance and budget controls on ChunkManager

**Files:**
- Modify: `src/world/ChunkManager.ts`
- Test: `tests/chunkManagerBudget.test.ts`

**Interfaces:**
- Produces: `ChunkManager.setViewDistance(vd: number): void`, `ChunkManager.viewDistance: number` (getter), `ChunkManager.setStreamingBudgets(genBudget: number, meshBudget: number, frameWorkMs: number): void`.
- Consumes: the existing private `opts`, `lastCenterCx/Cz`, `hasPendingWork`.

- [ ] **Step 1: Write the failing tests**

Add to `tests/chunkManagerBudget.test.ts`:

```ts
function drain(mgr: ChunkManager, cx = 0, cz = 0, frames = 400): void {
  for (let i = 0; i < frames && mgr.streaming !== false; i++) mgr.update(cx, cz);
  mgr.update(cx, cz);
}

describe('ChunkManager runtime controls', () => {
  it('setViewDistance grows the loaded set and reports via the getter', () => {
    const mgr = makeManager(1, 64, 64); // 3x3
    drain(mgr);
    expect(mgr.loadedChunkCount()).toBe(9);
    mgr.setViewDistance(2);
    expect(mgr.viewDistance).toBe(2);
    drain(mgr);
    expect(mgr.loadedChunkCount()).toBe(25); // 5x5
  });

  it('setViewDistance shrinking disposes out-of-range chunks', () => {
    const mgr = makeManager(2, 64, 64); // 5x5
    drain(mgr);
    expect(mgr.loadedChunkCount()).toBe(25);
    mgr.setViewDistance(1);
    drain(mgr);
    expect(mgr.loadedChunkCount()).toBe(9);
  });

  it('setStreamingBudgets raises how much streams per frame', () => {
    const mgr = makeManager(2, 2, 2); // small budgets
    mgr.setStreamingBudgets(64, 64, Infinity);
    mgr.update(0, 0); // one frame
    expect(mgr.lastFrameStats.genCount).toBeGreaterThan(2);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `rtk vitest run tests/chunkManagerBudget.test.ts`
Expected: FAIL (`setViewDistance` / `viewDistance` / `setStreamingBudgets` undefined).

- [ ] **Step 3: Implement the controls**

In `src/world/ChunkManager.ts`, add these public methods (e.g. right after the `streaming` getter near line 149):

```ts
/** Current loaded radius (Chebyshev chunk radius around the camera column). */
get viewDistance(): number {
  return this.opts.viewDistance;
}

/**
 * Sets the loaded radius at runtime. Forces a desired-set rebuild on the next update() so
 * chunks that left range are disposed and newly desired chunks stream in. No-op if unchanged.
 */
setViewDistance(vd: number): void {
  const clamped = Math.max(1, Math.floor(vd));
  if (clamped === this.opts.viewDistance) return;
  this.opts.viewDistance = clamped;
  this.lastCenterCx = undefined;
  this.lastCenterCz = undefined;
  this.hasPendingWork = true;
}

/** Sets the per-frame streaming budgets (used to burst the cold-start fill, then settle). */
setStreamingBudgets(genBudget: number, meshBudget: number, frameWorkMs: number): void {
  this.opts.genBudget = genBudget;
  this.opts.meshBudget = meshBudget;
  this.opts.frameWorkMs = frameWorkMs;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `rtk vitest run tests/chunkManagerBudget.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
rtk git add src/world/ChunkManager.ts tests/chunkManagerBudget.test.ts
rtk git commit -m "feat(world): runtime setViewDistance + setStreamingBudgets controls

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Fog-range helper

**Files:**
- Create: `src/render/fog.ts`
- Test: `tests/fog.test.ts`

**Interfaces:**
- Produces: `applyFogRange(materials: readonly RawShaderMaterial[], farBlocks: number): void` — sets `uFogFar = farBlocks` and `uFogNear = 0.55 * farBlocks` on each material.
- Consumes: the chunk materials' `uFogNear` / `uFogFar` uniforms (defined in `ChunkMaterial.ts`).

- [ ] **Step 1: Write the failing test**

Create `tests/fog.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { applyFogRange } from '../src/render/fog';
import { createChunkMaterial } from '../src/render/ChunkMaterial';
import type { DataArrayTexture } from 'three';

describe('applyFogRange', () => {
  it('sets far to the boundary and near to 55% of it', () => {
    const m = createChunkMaterial({} as DataArrayTexture);
    applyFogRange([m], 128);
    expect(m.uniforms.uFogFar.value).toBe(128);
    expect(m.uniforms.uFogNear.value).toBeCloseTo(70.4, 5);
  });

  it('updates every material passed', () => {
    const a = createChunkMaterial({} as DataArrayTexture);
    const b = createChunkMaterial({} as DataArrayTexture);
    applyFogRange([a, b], 200);
    expect(a.uniforms.uFogFar.value).toBe(200);
    expect(b.uniforms.uFogFar.value).toBe(200);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `rtk vitest run tests/fog.test.ts`
Expected: FAIL (`src/render/fog` does not exist).

- [ ] **Step 3: Implement the helper**

Create `src/render/fog.ts`:

```ts
import type { RawShaderMaterial } from 'three';

/**
 * Sets the distance-fog band on the chunk materials so terrain fades into the sky right at the
 * view-distance boundary. `farBlocks` is the visible radius in blocks (viewDistance * CHUNK_SIZE_X);
 * fog starts at 55% of that and saturates at the edge, masking chunk pop-in as the radius changes.
 */
export function applyFogRange(materials: readonly RawShaderMaterial[], farBlocks: number): void {
  const far = Math.max(1, farBlocks);
  const near = far * 0.55;
  for (const m of materials) {
    m.uniforms.uFogNear.value = near;
    m.uniforms.uFogFar.value = far;
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `rtk vitest run tests/fog.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
rtk git add src/render/fog.ts tests/fog.test.ts
rtk git commit -m "feat(render): applyFogRange helper to fade terrain at the view boundary

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Adaptive view-distance governor

**Files:**
- Create: `src/app/ViewDistanceGovernor.ts`
- Test: `tests/viewDistanceGovernor.test.ts`

**Interfaces:**
- Produces:
  - `interface GovernorOptions { minVd; maxVd; growAtOrBelowMs; shrinkAtOrAboveMs; windowFrames; growCooldownFrames; shrinkCooldownFrames }` (all `number`).
  - `DEFAULT_GOVERNOR_OPTIONS: Omit<GovernorOptions, 'minVd' | 'maxVd'>`.
  - `class ViewDistanceGovernor` with `constructor(bounds: { minVd; maxVd } & Partial<GovernorOptions>, initial: number)`, `get viewDistance(): number`, and `sample(frameMs: number, streaming: boolean): number | undefined` (returns the new view distance the tick it changes, else `undefined`).
- Consumes: nothing (pure).

**Design note:** frame time (not CPU work) is the signal, so it captures GPU/draw limits too. Under vsync a held 60 FPS reads ~16.7 ms, inside the grow band (≤18); a dropped frame reads ~33 ms, inside the shrink band (≥22). The bands bracket the 16.7 ms line so ordinary 60 FPS reliably grows and only a real drop shrinks. Never adjusts while streaming or during the post-change cooldown.

- [ ] **Step 1: Write the failing tests**

Create `tests/viewDistanceGovernor.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { ViewDistanceGovernor } from '../src/app/ViewDistanceGovernor';

const TUNING = {
  windowFrames: 2,
  growCooldownFrames: 2,
  shrinkCooldownFrames: 2,
  growAtOrBelowMs: 18,
  shrinkAtOrAboveMs: 22,
};

function gov(minVd: number, maxVd: number, initial: number) {
  return new ViewDistanceGovernor({ minVd, maxVd, ...TUNING }, initial);
}

describe('ViewDistanceGovernor', () => {
  it('grows once a full window of good frames elapses while idle', () => {
    const g = gov(1, 4, 1);
    expect(g.sample(16, false)).toBeUndefined(); // window not full yet
    expect(g.sample(16, false)).toBe(2); // full window, p95 <= 18 -> grow
    expect(g.viewDistance).toBe(2);
  });

  it('does not grow while streaming', () => {
    const g = gov(1, 4, 1);
    expect(g.sample(16, true)).toBeUndefined();
    expect(g.sample(16, true)).toBeUndefined();
    expect(g.viewDistance).toBe(1);
  });

  it('shrinks when frames sustain above the drop threshold', () => {
    const g = gov(1, 4, 3);
    expect(g.sample(33, false)).toBeUndefined();
    expect(g.sample(33, false)).toBe(2);
  });

  it('never grows past maxVd', () => {
    const g = gov(1, 2, 2);
    expect(g.sample(16, false)).toBeUndefined();
    expect(g.sample(16, false)).toBeUndefined(); // already at cap
    expect(g.viewDistance).toBe(2);
  });

  it('never shrinks below minVd', () => {
    const g = gov(2, 4, 2);
    expect(g.sample(33, false)).toBeUndefined();
    expect(g.sample(33, false)).toBeUndefined(); // already at floor
    expect(g.viewDistance).toBe(2);
  });

  it('suppresses changes during the cooldown after a change', () => {
    const g = gov(1, 4, 1);
    g.sample(16, false);
    expect(g.sample(16, false)).toBe(2); // grow, cooldown = 2
    expect(g.sample(16, false)).toBeUndefined(); // cooldown 2 -> 1
    expect(g.sample(16, false)).toBeUndefined(); // cooldown 1 -> 0
    expect(g.sample(16, false)).toBeUndefined(); // window refilling (1/2)
    expect(g.sample(16, false)).toBe(3); // window full again -> grow
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `rtk vitest run tests/viewDistanceGovernor.test.ts`
Expected: FAIL (module does not exist).

- [ ] **Step 3: Implement the governor**

Create `src/app/ViewDistanceGovernor.ts`:

```ts
/** Tuning for the adaptive view-distance governor. All frame times are in ms. */
export interface GovernorOptions {
  /** Lower bound on view distance (never shrink below). */
  minVd: number;
  /** Upper bound on view distance (never grow above). */
  maxVd: number;
  /** Grow when the window's p95 frame time is at or below this (still holding ~60 FPS). */
  growAtOrBelowMs: number;
  /** Shrink when the window's p95 frame time is at or above this (dropped below ~45 FPS). */
  shrinkAtOrAboveMs: number;
  /** Number of recent frames the p95 is computed over. */
  windowFrames: number;
  /** Frames to wait after a grow before evaluating again. */
  growCooldownFrames: number;
  /** Frames to wait after a shrink before evaluating again (longer, to avoid flapping). */
  shrinkCooldownFrames: number;
}

export const DEFAULT_GOVERNOR_OPTIONS: Omit<GovernorOptions, 'minVd' | 'maxVd'> = {
  growAtOrBelowMs: 18,
  shrinkAtOrAboveMs: 22,
  windowFrames: 60,
  growCooldownFrames: 90,
  shrinkCooldownFrames: 240,
};

/** Nearest-rank p95 of a numeric array (does not mutate the input). */
function p95(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil(0.95 * sorted.length);
  return sorted[Math.min(Math.max(rank - 1, 0), sorted.length - 1)];
}

/**
 * Adaptive view-distance controller. Grows the loaded radius while frames hold ~60 FPS and
 * shrinks it when they drop, converging on the largest radius the machine sustains. Pure and
 * framework-free: fed one frame time per tick, returns a new view distance the tick it changes.
 */
export class ViewDistanceGovernor {
  private readonly opts: GovernorOptions;
  private readonly window: number[] = [];
  private cooldown = 0;
  private current: number;

  constructor(bounds: { minVd: number; maxVd: number } & Partial<GovernorOptions>, initial: number) {
    this.opts = { ...DEFAULT_GOVERNOR_OPTIONS, ...bounds };
    this.current = Math.max(this.opts.minVd, Math.min(this.opts.maxVd, initial));
  }

  get viewDistance(): number {
    return this.current;
  }

  /**
   * Feeds one frame. Returns the new view distance if it changed this tick, else undefined.
   * Never adjusts while `streaming` (frame times are transiently inflated by chunk loading)
   * or during the post-change cooldown.
   */
  sample(frameMs: number, streaming: boolean): number | undefined {
    this.window.push(frameMs);
    if (this.window.length > this.opts.windowFrames) this.window.shift();

    if (this.cooldown > 0) {
      this.cooldown--;
      return undefined;
    }
    if (streaming) return undefined;
    if (this.window.length < this.opts.windowFrames) return undefined;

    const measured = p95(this.window);

    if (measured >= this.opts.shrinkAtOrAboveMs && this.current > this.opts.minVd) {
      this.current--;
      this.cooldown = this.opts.shrinkCooldownFrames;
      this.window.length = 0;
      return this.current;
    }
    if (measured <= this.opts.growAtOrBelowMs && this.current < this.opts.maxVd) {
      this.current++;
      this.cooldown = this.opts.growCooldownFrames;
      this.window.length = 0;
      return this.current;
    }
    return undefined;
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `rtk vitest run tests/viewDistanceGovernor.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
rtk git add src/app/ViewDistanceGovernor.ts tests/viewDistanceGovernor.test.ts
rtk git commit -m "feat(app): adaptive view-distance governor keyed to 60fps frame time

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: Add constants and wire governor + burst + fog into Game.boot

**Files:**
- Modify: `src/core/constants.ts`
- Modify: `src/app/Game.ts`
- Verify: `tests/gameBoot.test.ts` (should pass unchanged)

**Interfaces:**
- Consumes: `ChunkManager.setViewDistance` / `setStreamingBudgets` / `viewDistance` / `streaming` (Tasks 2–3), `ViewDistanceGovernor` (Task 5), `applyFogRange` (Task 4).
- Produces: no new exports; behavior only.

- [ ] **Step 1: Add the constants**

Append to `src/core/constants.ts`:

```ts
/** Lower bound for the adaptive view-distance governor (also the initial radius). */
export const MIN_VIEW_DISTANCE = 4;
/** Hard upper bound for the adaptive view-distance governor. */
export const MAX_VIEW_DISTANCE = 12;

/** Cold-start streaming budgets: fill the spawn area fast until the first ring drains. */
export const BURST_GEN_BUDGET = 8;
export const BURST_MESH_BUDGET = 6;
export const BURST_FRAME_WORK_MS = 10;
```

- [ ] **Step 2: Update Game.boot imports**

In `src/app/Game.ts`, replace the constants import line (currently `import { FRAME_WORK_MS } from '../core/constants';`) with:

```ts
import {
  FRAME_WORK_MS,
  GEN_BUDGET,
  MESH_BUDGET,
  VIEW_DISTANCE,
  MIN_VIEW_DISTANCE,
  MAX_VIEW_DISTANCE,
  BURST_GEN_BUDGET,
  BURST_MESH_BUDGET,
  BURST_FRAME_WORK_MS,
  CHUNK_SIZE_X,
} from '../core/constants';
import { ViewDistanceGovernor } from './ViewDistanceGovernor';
import { applyFogRange } from '../render/fog';
```

- [ ] **Step 3: Construct the manager with burst budgets, plus the governor + fog state**

Change the `ChunkManager` construction (around line 94) to start with burst budgets:

```ts
const manager = new ChunkManager(
  generator,
  new GreedyMesher(registry),
  registry,
  sink,
  SEED,
  overlays,
  {
    viewDistance: VIEW_DISTANCE,
    genBudget: BURST_GEN_BUDGET,
    meshBudget: BURST_MESH_BUDGET,
    frameWorkMs: BURST_FRAME_WORK_MS,
  },
  savedDeltas,
);
```

Just before `renderer.start(...)` (around line 400), add the governor, burst latch, and fog materials:

```ts
const fogMaterials = [material, transparentMaterial, cutoutMaterial];
const governor = new ViewDistanceGovernor(
  { minVd: MIN_VIEW_DISTANCE, maxVd: MAX_VIEW_DISTANCE },
  VIEW_DISTANCE,
);
let burstActive = true;
let fogInitialized = false;
```

- [ ] **Step 4: Drive them from the render loop**

Inside the `renderer.start((dt) => { ... })` callback, after the `manager.update(...)` call (around line 411) and before the DEV profiler push, add:

```ts
// Cold-start burst: once the first fill drains, settle to the smooth-roam budgets.
if (burstActive && !manager.streaming) {
  burstActive = false;
  manager.setStreamingBudgets(GEN_BUDGET, MESH_BUDGET, FRAME_WORK_MS);
}

// Set fog for the initial radius on the first frame (before the first render).
if (!fogInitialized) {
  fogInitialized = true;
  applyFogRange(fogMaterials, manager.viewDistance * CHUNK_SIZE_X);
}

// Adaptive view distance (targets ~60fps); retune fog to the new boundary on change.
const nextVd = governor.sample(cdt * 1000, manager.streaming);
if (nextVd !== undefined) {
  manager.setViewDistance(nextVd);
  applyFogRange(fogMaterials, nextVd * CHUNK_SIZE_X);
}
```

- [ ] **Step 5: Run the boot + full suite**

Run: `rtk vitest run tests/gameBoot.test.ts`
Expected: PASS unchanged (the mocked `renderer.start` never invokes the callback, so the new loop body — the only code touching mocked materials/manager methods — does not run during the test).

Run: `rtk vitest run`
Expected: PASS (743 + new tests).

- [ ] **Step 6: Typecheck + lint**

Run: `rtk npm run build` (runs `tsc --noEmit` then vite build)
Expected: no type errors.
Run: `rtk npm run lint`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
rtk git add src/core/constants.ts src/app/Game.ts
rtk git commit -m "feat(app): adaptive view distance, cold-start burst, and boundary fog

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 7: Fix night stars painting over terrain

**Files:**
- Modify: `src/render/CelestialSky.ts`
- Test: `tests/starDepth.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: no export change; the star/sun/moon materials now render with `depthTest: true` so opaque terrain occludes them.

**Root cause:** the star `Points` and sun/moon `Sprites` use `depthTest: false` + `transparent: true`. Three renders opaque terrain first, then transparent objects; with depth test off the celestial layer overpaints already-drawn terrain (the dots on the grass). At radius 400–480 (inside the 1000 far plane) enabling depth test lets terrain occlude them while open sky still shows them — the original "behind the terrain" intent.

- [ ] **Step 1: Write the failing test**

Create `tests/starDepth.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Scene } from 'three';

// discTexture() needs a 2D canvas context; stub a minimal one for the node test env.
beforeEach(() => {
  vi.stubGlobal('document', {
    createElement: () => ({
      width: 0,
      height: 0,
      getContext: () => ({
        createRadialGradient: () => ({ addColorStop: () => {} }),
        fillRect: () => {},
        fillStyle: '',
      }),
    }),
  });
});

describe('CelestialSky depth test', () => {
  it('renders stars, sun, and moon with depthTest enabled so terrain occludes them', async () => {
    const { CelestialSky } = await import('../src/render/CelestialSky');
    const scene = new Scene();
    new CelestialSky(scene);
    const materials = scene.children
      .map((o) => (o as { material?: { depthTest?: boolean } }).material)
      .filter((m): m is { depthTest?: boolean } => !!m);
    expect(materials.length).toBeGreaterThanOrEqual(3);
    for (const m of materials) expect(m.depthTest).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `rtk vitest run tests/starDepth.test.ts`
Expected: FAIL (materials currently have `depthTest: false`).

- [ ] **Step 3: Flip depthTest to true on all three celestial materials**

In `src/render/CelestialSky.ts`, change `depthTest: false` to `depthTest: true` in the three material definitions (`sunMat` ~line 82, `moonMat` ~line 93, `starMat` ~line 109). Leave `depthWrite: false` as-is (they must not occlude each other). Update the class doc comment (line 66) to read: `Everything renders behind terrain via the depth buffer (depthTest on, depthWrite off) and stays centered on the camera...`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `rtk vitest run tests/starDepth.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the celestial suite to confirm no regression**

Run: `rtk vitest run tests/celestialSky.test.ts tests/celestialSkyDispose.test.ts tests/starDepth.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
rtk git add src/render/CelestialSky.ts tests/starDepth.test.ts
rtk git commit -m "fix(render): occlude sun/moon/stars behind terrain via depthTest

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Final verification (after all tasks)

- [ ] `rtk vitest run` — full suite green.
- [ ] `rtk npm run build` — typecheck + production build clean.
- [ ] `rtk npm run lint` — clean.
- [ ] **Preview (dev):** `npm run dev`, then in the preview:
  - Spawn fills fast (burst) with no long visible ring-by-ring stream-in.
  - The horizon fades into the sky (no hard terrain edge); over ~seconds the view distance climbs and the `Chunks` HUD count rises while FPS holds ~60.
  - At night, the white star dots appear only in open sky — never over grass/trees. Sun/moon are occluded by hills.
  - `__vr.bench` scripted roam: compare p95 `frameMs`, `longFrames16`, `meanFps` before/after; confirm no sustained sub-60 dips at the settled view distance.

## Self-review notes

- **Spec coverage:** height-capped meshing (Tasks 1–2), adaptive view distance + fog (Tasks 3–6), cold-start burst (Tasks 3, 6), night-star fix (Task 7). All four design items covered.
- **Type consistency:** `mesh(view, pass, maxY?)`, `setViewDistance`/`viewDistance`/`setStreamingBudgets`, `applyFogRange(materials, farBlocks)`, `ViewDistanceGovernor.sample(frameMs, streaming)` used identically across producing and consuming tasks.
- **No placeholders:** every code step contains full code; every run step has an expected result.
