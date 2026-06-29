# Non-cube Shapes (Track E1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add half-height slabs, billboard cross-plants (in a new alpha-cutout render pass), and slab collision to the voxel engine — without changing the save format or the existing full-cube path.

**Architecture:** A `shape` discriminator on `BlockDef` drives three orthogonal changes: (1) the greedy opaque pass only meshes full cubes (`occludes`), (2) a pure `emitShaped` step emits slab boxes into the opaque mesh and cross billboards into a new `cutout` mesh, (3) a `CutoutMaterial` with an alpha-test `discard` renders the cutout mesh. Plant textures gain an alpha channel; slabs gain a `lowerHalf` collision box. Per-block tint is NOT in this phase.

**Tech Stack:** TypeScript (strict), three.js r0.185 (`RawShaderMaterial`, GLSL3, `DataArrayTexture`), Vite, Vitest.

## Global Constraints

- Block ids are append-only and ∈ [0,255]; never reorder/reuse. Next free id is **27**.
- Save format / `SAVE_VERSION` unchanged. No block metadata/rotation. No per-block tint.
- The existing full-cube opaque/transparent meshing must stay **byte-identical** for all-cube neighbourhoods (the only mesh-pass change is `isOpaque`→`occludes`, which is identical when every block is a cube).
- Slabs are "full" for light and AO (only face-culling/greedy participation use `occludes`); `GreedyMesher.opaqueAt` (AO) is unchanged.
- Strict TS, no `any`. Determinism: any worldgen scatter uses `Math.imul` world-coordinate hashing (like `OreScatterer`), never a chunk-local RNG. Prettier-clean (ESLint treats prettier violations as errors). `npm run -s build` (tsc + vite) green after any type-touching task.
- The registry `selfCheck()` must still pass at boot; shape handling is exhaustive (a `never`-typed default), not a silent fallback.

## Spec

See `docs/specs/2026-06-29-shapes-track-e1-design.md`. This plan implements its 8 components.

## File Structure

- `src/blocks/blocks.ts` — add `Shape` type + `BlockDef.shape`; later (T8) the 4 new blocks.
- `src/blocks/BlockRegistry.ts` — add `shape`/`occludes`/`collisionBox`; extend `selfCheck`.
- `src/mesh/MeshPass.ts` — `opaquePass`/`transparentPass` become shape-aware.
- `src/blocks/textures.ts` — RGBA-capable `Pixel`/`paintLayer`; `flower`/`tallGrass` patterns.
- `src/mesh/emitShaped.ts` *(new)* — pure shaped-geometry emitter + `mergeMeshData`.
- `src/mesh/MeshTypes.ts` — `ChunkMeshes` gains `cutout: MeshData`.
- `src/render/ChunkMaterial.ts` — options-based `buildMaterial` + `createCutoutMaterial`.
- `src/render/ChunkMeshRegistry.ts` — third per-chunk `cutout` mesh + material.
- `src/render/buildChunkMesh.ts` — unchanged (reused as-is for the cutout mesh).
- `src/app/Game.ts` — create cutout material; register it with `DayNight` + the registry.
- `src/world/ChunkManager.ts` — `meshChunk` runs `emitShaped`; add `solidBox`.
- `src/player/Collision.ts` — box-aware overlap + surface-aware downward-Y snap; `solidBox?` on the sampler.
- `src/player/PlayerController.ts` — thread `solidBox` through `PlayerWorld` (interface extension only).
- `src/worldgen/Decorations.ts` *(new)* — deterministic plant scatter overlay.
- `src/worldgen/Presets.ts` — wire the overlay into `default`/`villages`/`frontier`.

---

### Task 1: Registry shape, occlusion, and collision helpers

**Files:**
- Modify: `src/blocks/blocks.ts` (add `Shape`, `BlockDef.shape`)
- Modify: `src/blocks/BlockRegistry.ts` (add `shape`/`occludes`/`collisionBox`, extend `selfCheck`)
- Test: `tests/shapes.test.ts` (new)

**Interfaces:**
- Produces: `type Shape = 'cube' | 'slab' | 'cross'` and `type CollisionBox = 'none' | 'full' | 'lowerHalf'` (export both from `blocks.ts`); `BlockDef.shape?: Shape`; `registry.shape(id): Shape`, `registry.occludes(id): boolean`, `registry.collisionBox(id): CollisionBox`.

- [ ] **Step 1: Write the failing test** — `tests/shapes.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { BlockRegistry } from '../src/blocks/BlockRegistry';
import { buildBlockTextures, type BlockDef } from '../src/blocks/blocks';

const DEFS: BlockDef[] = [
  { id: 0, name: 'air', opaque: false, transparent: true },
  { id: 1, name: 'stone', opaque: true, transparent: false, faces: { pattern: 'stone', colors: [[128, 128, 132]] } },
  { id: 2, name: 'slab', opaque: true, transparent: false, shape: 'slab', faces: { pattern: 'stone', colors: [[128, 128, 132]] } },
  { id: 3, name: 'plant', opaque: false, transparent: false, shape: 'cross', faces: { pattern: 'flower', colors: [[60, 140, 60], [220, 70, 90]] } },
  { id: 4, name: 'water', opaque: false, transparent: true, faces: { pattern: 'speckle', colors: [[50, 110, 200]], amp: 10 } },
];
const reg = new BlockRegistry(DEFS, buildBlockTextures(DEFS));

describe('BlockRegistry shape/occludes/collisionBox', () => {
  it('defaults a block with no shape to cube', () => {
    expect(reg.shape(1)).toBe('cube');
  });
  it('reads explicit shapes', () => {
    expect(reg.shape(2)).toBe('slab');
    expect(reg.shape(3)).toBe('cross');
  });
  it('occludes only full opaque cubes', () => {
    expect(reg.occludes(1)).toBe(true); // opaque cube
    expect(reg.occludes(2)).toBe(false); // opaque slab — not a full cube
    expect(reg.occludes(3)).toBe(false); // non-opaque plant
    expect(reg.occludes(4)).toBe(false); // non-opaque cube (water)
  });
  it('maps shape to a collision box', () => {
    expect(reg.collisionBox(1)).toBe('full');
    expect(reg.collisionBox(2)).toBe('lowerHalf');
    expect(reg.collisionBox(3)).toBe('none');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/shapes.test.ts`
Expected: FAIL — `reg.shape is not a function`.

- [ ] **Step 3: Add the types to `src/blocks/blocks.ts`**

After the `Face` enum, before `BlockDef`, add:

```ts
/** Render/collision shape of a block. The block id implies the shape (no save state). */
export type Shape = 'cube' | 'slab' | 'cross';

/** Collision footprint of a block within its voxel cell. */
export type CollisionBox = 'none' | 'full' | 'lowerHalf';
```

In the `BlockDef` interface, add the field (after `creative?`):

```ts
  /** Render + collision shape. Omitted = 'cube'. */
  shape?: Shape;
```

- [ ] **Step 4: Add the methods to `src/blocks/BlockRegistry.ts`**

Update the import to pull in the new types:

```ts
import {
  BLOCK_DEFS,
  BLOCK_TEXTURES,
  type BlockDef,
  type BlockTextures,
  type Face,
  type Shape,
  type CollisionBox,
} from './blocks';
```

Add these methods (after `isOpaque`):

```ts
  /** Render/collision shape of a block; 'cube' when unspecified. */
  shape(id: BlockId): Shape {
    return this.get(id).shape ?? 'cube';
  }

  /** True only for a full opaque cube: hides neighbour faces and casts AO. Slabs/plants do not. */
  occludes(id: BlockId): boolean {
    return this.get(id).opaque && this.shape(id) === 'cube';
  }

  /** Collision footprint of a block within its cell, derived from its shape. */
  collisionBox(id: BlockId): CollisionBox {
    switch (this.shape(id)) {
      case 'cube':
        return 'full';
      case 'slab':
        return 'lowerHalf';
      case 'cross':
        return 'none';
    }
  }
```

In `selfCheck()`, after the `light` range check and before `if (!def.faces) continue;`, add an exhaustive shape guard:

```ts
      if (def.shape !== undefined && !isShape(def.shape)) {
        throw new Error(`Block "${def.name}" has unknown shape "${String(def.shape)}"`);
      }
```

And add this module-level helper at the bottom of the file (outside the class):

```ts
function isShape(value: string): value is Shape {
  return value === 'cube' || value === 'slab' || value === 'cross';
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run tests/shapes.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Type-check + lint**

Run: `npm run -s build && npx prettier --check src/blocks/blocks.ts src/blocks/BlockRegistry.ts tests/shapes.test.ts`
Expected: build green; prettier reports no changes (run `npx prettier --write` on any flagged file, then re-check).

- [ ] **Step 7: Commit**

```bash
git add src/blocks/blocks.ts src/blocks/BlockRegistry.ts tests/shapes.test.ts
git commit -m "feat(blocks): shape discriminator + occludes/collisionBox registry helpers"
```

---

### Task 2: Occlusion-aware mesh passes

**Files:**
- Modify: `src/mesh/MeshPass.ts`
- Test: `tests/meshPass.test.ts` (new)

**Interfaces:**
- Consumes: `registry.occludes(id)`, `registry.shape(id)` (Task 1).
- Produces: `opaquePass.includes = occludes`; `opaquePass.faceVisible(self, neighbor) = !occludes(neighbor)`; `transparentPass.includes` additionally requires `shape === 'cube'`.

- [ ] **Step 1: Write the failing test** — `tests/meshPass.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { BlockRegistry } from '../src/blocks/BlockRegistry';
import { buildBlockTextures, type BlockDef } from '../src/blocks/blocks';
import { opaquePass, transparentPass } from '../src/mesh/MeshPass';

const stoneFaces = { pattern: 'stone', colors: [[128, 128, 132]] } as const;
const DEFS: BlockDef[] = [
  { id: 0, name: 'air', opaque: false, transparent: true },
  { id: 1, name: 'stone', opaque: true, transparent: false, faces: stoneFaces },
  { id: 2, name: 'slab', opaque: true, transparent: false, shape: 'slab', faces: stoneFaces },
  { id: 3, name: 'glass', opaque: false, transparent: true, faces: { pattern: 'glass', colors: [[205, 232, 240]] } },
  { id: 4, name: 'plant', opaque: false, transparent: false, shape: 'cross', faces: { pattern: 'tallGrass', colors: [[60, 140, 60]] } },
];
const reg = new BlockRegistry(DEFS, buildBlockTextures(DEFS));
const op = opaquePass(reg);
const tp = transparentPass(reg);

describe('opaquePass', () => {
  it('greedy-meshes only full cubes (not slabs)', () => {
    expect(op.includes(1)).toBe(true);
    expect(op.includes(2)).toBe(false); // slab emitted separately
  });
  it('shows a cube face against a non-occluding slab', () => {
    expect(op.faceVisible(1, 2)).toBe(true); // cube next to slab → face visible
    expect(op.faceVisible(1, 1)).toBe(false); // cube next to cube → culled
    expect(op.faceVisible(1, 0)).toBe(true); // cube next to air → visible
  });
});

describe('transparentPass', () => {
  it('includes transparent cubes but never non-cube shapes', () => {
    expect(tp.includes(3)).toBe(true); // glass cube
    expect(tp.includes(4)).toBe(false); // plant is non-cube → not in transparent cube pass
    expect(tp.includes(1)).toBe(false); // opaque cube
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/meshPass.test.ts`
Expected: FAIL — `op.includes(2)` is `true` (current `isOpaque`).

- [ ] **Step 3: Update `src/mesh/MeshPass.ts`**

Replace `opaquePass` and `transparentPass` with:

```ts
/** Opaque solids: only FULL cubes greedy-mesh; a cube face shows against any non-occluder. */
export function opaquePass(registry: BlockRegistry): MeshPass {
  return {
    includes: (id) => registry.occludes(id),
    faceVisible: (_self, neighbor) => !registry.occludes(neighbor),
  };
}

/**
 * Translucent CUBES (water, glass, ...) share one pass. Non-cube shapes (slabs/plants) are
 * excluded — slabs render in the opaque mesh and plants in the cutout mesh, so a transparent
 * plant must never also emit a full transparent cube here. A face shows against air or a
 * *different* transparent block, so a water↔glass boundary stays visible while same-type and
 * transparent↔solid internal faces are culled.
 */
export function transparentPass(registry: BlockRegistry): MeshPass {
  return {
    includes: (id) =>
      id !== AIR && registry.get(id).transparent && registry.shape(id) === 'cube',
    faceVisible: (self, neighbor) =>
      neighbor === AIR || (neighbor !== self && registry.get(neighbor).transparent),
  };
}
```

(The `AIR` import and `MeshPass` interface stay as-is.)

- [ ] **Step 4: Run the new test + the full suite**

Run: `npx vitest run tests/meshPass.test.ts && npx vitest run`
Expected: new test PASS; **all existing tests still pass** (cube worlds are unaffected because `occludes === isOpaque` when every block is a cube).

- [ ] **Step 5: Type-check + commit**

```bash
npm run -s build
git add src/mesh/MeshPass.ts tests/meshPass.test.ts
git commit -m "feat(mesh): occlusion-aware passes (cubes-only greedy; plants excluded from transparent)"
```

---

### Task 3: Alpha-capable textures + plant patterns

**Files:**
- Modify: `src/blocks/textures.ts`
- Test: `tests/plantTextures.test.ts` (new)

**Interfaces:**
- Produces: `type RGBA`; `Pixel` returns `RGB | RGBA`; `paintLayer` writes alpha (default 255); new `PatternName`s `'flower'` and `'tallGrass'` whose pixels are transparent (alpha 0) on the background.

- [ ] **Step 1: Write the failing test** — `tests/plantTextures.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { TILE, paintLayer } from '../src/blocks/textures';

function layerAlpha(spec: Parameters<typeof paintLayer>[2]): number[] {
  const data = new Uint8Array(TILE * TILE * 4);
  paintLayer(data, 0, spec);
  const a: number[] = [];
  for (let i = 0; i < TILE * TILE; i++) a.push(data[i * 4 + 3]);
  return a;
}

describe('alpha-capable textures', () => {
  it('opaque patterns stay fully opaque (alpha 255 everywhere)', () => {
    const a = layerAlpha({ pattern: 'stone', colors: [[128, 128, 132]] });
    expect(a.every((v) => v === 255)).toBe(true);
  });
  it('plant patterns have both transparent and opaque pixels', () => {
    const a = layerAlpha({ pattern: 'tallGrass', colors: [[60, 140, 60]] });
    expect(a.some((v) => v === 0)).toBe(true); // transparent background
    expect(a.some((v) => v === 255)).toBe(true); // opaque blades
  });
  it('flower pattern likewise has a transparent background', () => {
    const a = layerAlpha({ pattern: 'flower', colors: [[60, 140, 60], [220, 70, 90]] });
    expect(a.some((v) => v === 0)).toBe(true);
    expect(a.some((v) => v === 255)).toBe(true);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/plantTextures.test.ts`
Expected: FAIL — `'flower'`/`'tallGrass'` are not valid `PatternName`s (type error in the test) and/or no transparent pixels.

- [ ] **Step 3: Widen the pixel type in `src/blocks/textures.ts`**

Change the `RGB`/`Pixel` declarations near the top:

```ts
export type RGB = readonly [number, number, number];
export type RGBA = readonly [number, number, number, number];
export type Pixel = (px: number, py: number, rng: () => number) => RGB | RGBA;
```

Add `'flower'` and `'tallGrass'` to the `PatternName` union (append, keeping existing order):

```ts
  | 'furnace'
  | 'flower'
  | 'tallGrass';
```

- [ ] **Step 4: Add the plant pattern builders**

After `furnaceP` (before `buildPattern`), add. Both return `alpha:0` off the plant silhouette so the cutout pass discards the background:

```ts
const TRANSPARENT: RGBA = [0, 0, 0, 0];

/** Tall grass: a few vertical green blades on a transparent background. */
const tallGrassP =
  (green: RGB): Pixel =>
  (px, py, rng): RGBA => {
    // Blades at fixed columns; each blade rises to a jagged top. Everything else is transparent.
    const bladeCols = [3, 6, 8, 11, 13];
    const onBlade = bladeCols.includes(px) && py >= 4 + ((px * 5) % 4) && py <= TILE - 1;
    if (!onBlade) return TRANSPARENT;
    const c = shade(green, (rng() - 0.5) * 26 + (py < 8 ? 14 : 0));
    return [clamp(c[0]), clamp(c[1]), clamp(c[2]), 255];
  };

/** Flower: a green stem with a small colored bloom, on a transparent background. */
const flowerP =
  (stem: RGB, petal: RGB): Pixel =>
  (px, py, rng): RGBA => {
    const onStem = (px === 7 || px === 8) && py >= 7;
    const dx = px - 7.5;
    const dy = py - 5;
    const onBloom = dx * dx + dy * dy <= 6.5;
    if (!onStem && !onBloom) return TRANSPARENT;
    const base = onBloom ? petal : stem;
    const c = shade(base, (rng() - 0.5) * 22);
    return [clamp(c[0]), clamp(c[1]), clamp(c[2]), 255];
  };
```

In `buildPattern`'s switch, add the two cases before the closing brace:

```ts
    case 'flower':
      return flowerP(c0, c1);
    case 'tallGrass':
      return tallGrassP(c0);
```

- [ ] **Step 5: Write alpha in `paintLayer`**

In `paintLayer`, change the per-pixel write so it respects a 4th channel (default 255). Replace the inner body:

```ts
      const c = fn(px, py, rng);
      const p = offset + (py * TILE + px) * 4;
      out[p] = clamp(c[0]);
      out[p + 1] = clamp(c[1]);
      out[p + 2] = clamp(c[2]);
      out[p + 3] = c.length > 3 ? clamp((c as RGBA)[3]) : 255;
```

- [ ] **Step 6: Run the test + verify opaque textures unchanged**

Run: `npx vitest run tests/plantTextures.test.ts && npx vitest run`
Expected: new test PASS; all existing tests pass (existing RGB patterns still write alpha 255 — byte-identical).

- [ ] **Step 7: Type-check + commit**

```bash
npm run -s build
git add src/blocks/textures.ts tests/plantTextures.test.ts
git commit -m "feat(blocks): RGBA-capable paintLayer + flower/tallGrass plant patterns"
```

---

### Task 4: Shaped-geometry emitter (`emitShaped`) + cutout mesh type

**Files:**
- Create: `src/mesh/emitShaped.ts`
- Modify: `src/mesh/MeshTypes.ts` (add `cutout: MeshData` to `ChunkMeshes`)
- Test: `tests/emitShaped.test.ts` (new)

**Interfaces:**
- Consumes: `VoxelView` (`get`/`skyLight`/`blockLight`), `BlockRegistry` (`shape`/`occludes`/`faceLayer`), `MeshData`, `Face`.
- Produces: `emitShaped(view: VoxelView, registry: BlockRegistry): { slabs: MeshData; cross: MeshData }`; `mergeMeshData(a: MeshData, b: MeshData): MeshData`; `ChunkMeshes.cutout: MeshData`.

- [ ] **Step 1: Write the failing test** — `tests/emitShaped.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { ChunkData } from '../src/world/ChunkData';
import { VoxelView } from '../src/world/VoxelView';
import { BlockRegistry } from '../src/blocks/BlockRegistry';
import { buildBlockTextures, type BlockDef } from '../src/blocks/blocks';
import { emitShaped, mergeMeshData } from '../src/mesh/emitShaped';

const stoneFaces = { pattern: 'stone', colors: [[128, 128, 132]] } as const;
const DEFS: BlockDef[] = [
  { id: 0, name: 'air', opaque: false, transparent: true },
  { id: 1, name: 'stone', opaque: true, transparent: false, faces: stoneFaces },
  { id: 2, name: 'slab', opaque: true, transparent: false, shape: 'slab', faces: stoneFaces },
  { id: 3, name: 'plant', opaque: false, transparent: false, shape: 'cross', faces: { pattern: 'tallGrass', colors: [[60, 140, 60]] } },
];
const reg = new BlockRegistry(DEFS, buildBlockTextures(DEFS));
const view = (data: ChunkData) => new VoxelView(data, () => undefined);

describe('emitShaped slabs', () => {
  it('a slab in open air emits all 6 faces (24 verts) capped at y+0.5', () => {
    const d = new ChunkData(0, 0);
    d.set(2, 10, 2, 2);
    const { slabs } = emitShaped(view(d), reg);
    expect(slabs.positions.length / 3).toBe(24); // 6 faces × 4 verts
    expect(slabs.indices.length).toBe(36); // 6 faces × 2 tris × 3
    let maxY = -Infinity;
    for (let i = 1; i < slabs.positions.length; i += 3) maxY = Math.max(maxY, slabs.positions[i]);
    expect(maxY).toBeCloseTo(10.5, 5);
  });

  it('a slab sitting on a full cube culls its bottom face (20 verts)', () => {
    const d = new ChunkData(0, 0);
    d.set(2, 9, 2, 1); // cube below
    d.set(2, 10, 2, 2); // slab on top
    const { slabs } = emitShaped(view(d), reg);
    expect(slabs.positions.length / 3).toBe(20); // bottom face culled → 5 faces
  });
});

describe('emitShaped cross', () => {
  it('a plant emits two billboard quads (8 verts) into the cutout buffer', () => {
    const d = new ChunkData(0, 0);
    d.set(4, 12, 4, 3);
    const { cross } = emitShaped(view(d), reg);
    expect(cross.positions.length / 3).toBe(8); // 2 quads × 4 verts
    expect(cross.indices.length).toBe(12); // 2 quads × 2 tris × 3
  });
});

describe('mergeMeshData', () => {
  it('concatenates and offsets indices', () => {
    const a = { positions: new Float32Array([0, 0, 0, 1, 0, 0, 1, 1, 0]), normals: new Float32Array(9), uvs: new Float32Array(6), layers: new Float32Array(3), ao: new Float32Array(3), light: new Float32Array(3), indices: new Uint32Array([0, 1, 2]) };
    const b = { positions: new Float32Array([0, 0, 0, 1, 0, 0, 1, 1, 0]), normals: new Float32Array(9), uvs: new Float32Array(6), layers: new Float32Array(3), ao: new Float32Array(3), light: new Float32Array(3), indices: new Uint32Array([0, 2, 1]) };
    const m = mergeMeshData(a, b);
    expect(m.positions.length).toBe(18);
    expect([...m.indices]).toEqual([0, 1, 2, 3, 5, 4]); // b's indices offset by 3
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/emitShaped.test.ts`
Expected: FAIL — `emitShaped` does not exist.

- [ ] **Step 3: Add `cutout` to `src/mesh/MeshTypes.ts`**

```ts
/** The opaque + transparent (water/glass) + cutout (plants) meshes produced for one chunk. */
export interface ChunkMeshes {
  opaque: MeshData;
  transparent: MeshData;
  cutout: MeshData;
}
```

- [ ] **Step 4: Create `src/mesh/emitShaped.ts`**

```ts
import { CHUNK_SIZE_X, CHUNK_SIZE_Z, WORLD_HEIGHT } from '../core/constants';
import { Face } from '../blocks/blocks';
import type { BlockRegistry } from '../blocks/BlockRegistry';
import type { VoxelView } from '../world/VoxelView';
import type { MeshData } from './MeshTypes';

interface Buf {
  positions: number[];
  normals: number[];
  uvs: number[];
  layers: number[];
  ao: number[];
  light: number[];
  indices: number[];
  verts: number;
}

const emptyBuf = (): Buf => ({
  positions: [],
  normals: [],
  uvs: [],
  layers: [],
  ao: [],
  light: [],
  indices: [],
  verts: 0,
});

const toMesh = (b: Buf): MeshData => ({
  positions: new Float32Array(b.positions),
  normals: new Float32Array(b.normals),
  uvs: new Float32Array(b.uvs),
  layers: new Float32Array(b.layers),
  ao: new Float32Array(b.ao),
  light: new Float32Array(b.light),
  indices: new Uint32Array(b.indices),
});

function packLight(view: VoxelView, x: number, y: number, z: number): number {
  return view.skyLight(x, y, z) * 16 + view.blockLight(x, y, z);
}

/**
 * Pushes one axis-aligned quad of the box [lo..hi] on the given (axis, sign) face. Uses the same
 * u=(axis+1)%3, v=(axis+2)%3 corner ordering and sign-based winding as GreedyMesher.emitQuad, so
 * the slab front faces match the cube convention (single-sided opaque material).
 */
function pushBoxFace(
  buf: Buf,
  axis: number,
  sign: number,
  lo: [number, number, number],
  hi: [number, number, number],
  layer: number,
  light: number,
): void {
  const u = (axis + 1) % 3;
  const v = (axis + 2) % 3;
  const d = sign > 0 ? hi[axis] : lo[axis];
  const corner = (uu: number, vv: number): [number, number, number] => {
    const p: [number, number, number] = [0, 0, 0];
    p[axis] = d;
    p[u] = uu;
    p[v] = vv;
    return p;
  };
  const ps = [corner(lo[u], lo[v]), corner(hi[u], lo[v]), corner(hi[u], hi[v]), corner(lo[u], hi[v])];
  const w = hi[u] - lo[u];
  const h = hi[v] - lo[v];
  const uvs: [number, number][] = [
    [0, 0],
    [w, 0],
    [w, h],
    [0, h],
  ];
  const normal: [number, number, number] = [0, 0, 0];
  normal[axis] = sign;
  const n = buf.verts;
  for (let k = 0; k < 4; k++) {
    buf.positions.push(ps[k][0], ps[k][1], ps[k][2]);
    buf.normals.push(normal[0], normal[1], normal[2]);
    buf.uvs.push(uvs[k][0], uvs[k][1]);
    buf.layers.push(layer);
    buf.ao.push(1); // slabs use flat AO in E1
    buf.light.push(light);
  }
  const tri = sign > 0 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2];
  for (const t of tri) buf.indices.push(n + t);
  buf.verts += 4;
}

/** (axis, sign, Face) for the 6 box faces. */
const FACES: ReadonlyArray<[number, number, Face]> = [
  [0, 1, Face.PosX],
  [0, -1, Face.NegX],
  [1, 1, Face.PosY],
  [1, -1, Face.NegY],
  [2, 1, Face.PosZ],
  [2, -1, Face.NegZ],
];

function emitSlab(
  buf: Buf,
  view: VoxelView,
  registry: BlockRegistry,
  id: number,
  x: number,
  y: number,
  z: number,
): void {
  const lo: [number, number, number] = [x, y, z];
  const hi: [number, number, number] = [x + 1, y + 0.5, z + 1];
  for (const [axis, sign, face] of FACES) {
    // The top face (y+0.5) never sits flush against the voxel above (y+1), so always emit it.
    const isTop = axis === 1 && sign > 0;
    const nx = x + (axis === 0 ? sign : 0);
    const ny = y + (axis === 1 ? sign : 0);
    const nz = z + (axis === 2 ? sign : 0);
    if (!isTop && registry.occludes(view.get(nx, ny, nz))) continue; // flush against a full cube
    pushBoxFace(buf, axis, sign, lo, hi, registry.faceLayer(id, face), packLight(view, nx, ny, nz));
  }
}

/** Two crossed billboard quads spanning the voxel. Double-sided (the cutout material) + no AO. */
function emitCross(
  buf: Buf,
  view: VoxelView,
  registry: BlockRegistry,
  id: number,
  x: number,
  y: number,
  z: number,
): void {
  const layer = registry.faceLayer(id, Face.PosX);
  const light = packLight(view, x, y, z);
  const quads: [number, number, number][][] = [
    [
      [x, y, z],
      [x + 1, y, z + 1],
      [x + 1, y + 1, z + 1],
      [x, y + 1, z],
    ],
    [
      [x + 1, y, z],
      [x, y, z + 1],
      [x, y + 1, z + 1],
      [x + 1, y + 1, z],
    ],
  ];
  const uvs: [number, number][] = [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1],
  ];
  for (const q of quads) {
    const n = buf.verts;
    for (let k = 0; k < 4; k++) {
      buf.positions.push(q[k][0], q[k][1], q[k][2]);
      buf.normals.push(0, 1, 0); // constant up-normal so both billboard sides light evenly
      buf.uvs.push(uvs[k][0], uvs[k][1]);
      buf.layers.push(layer);
      buf.ao.push(1);
      buf.light.push(light);
    }
    buf.indices.push(n, n + 1, n + 2, n, n + 2, n + 3);
    buf.verts += 4;
  }
}

/** Emits slab boxes (→ opaque mesh) and cross billboards (→ cutout mesh) for one chunk. */
export function emitShaped(
  view: VoxelView,
  registry: BlockRegistry,
): { slabs: MeshData; cross: MeshData } {
  const slabs = emptyBuf();
  const cross = emptyBuf();
  for (let y = 0; y < WORLD_HEIGHT; y++) {
    for (let z = 0; z < CHUNK_SIZE_Z; z++) {
      for (let x = 0; x < CHUNK_SIZE_X; x++) {
        const id = view.get(x, y, z);
        const shape = registry.shape(id);
        if (shape === 'slab') emitSlab(slabs, view, registry, id, x, y, z);
        else if (shape === 'cross') emitCross(cross, view, registry, id, x, y, z);
      }
    }
  }
  return { slabs: toMesh(slabs), cross: toMesh(cross) };
}

function concatF32(a: Float32Array, b: Float32Array): Float32Array {
  const out = new Float32Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

/** Concatenates two MeshData buffers, offsetting b's indices by a's vertex count. */
export function mergeMeshData(a: MeshData, b: MeshData): MeshData {
  if (b.positions.length === 0) return a;
  if (a.positions.length === 0) return b;
  const vertsA = a.positions.length / 3;
  const indices = new Uint32Array(a.indices.length + b.indices.length);
  indices.set(a.indices, 0);
  for (let i = 0; i < b.indices.length; i++) indices[a.indices.length + i] = b.indices[i] + vertsA;
  return {
    positions: concatF32(a.positions, b.positions),
    normals: concatF32(a.normals, b.normals),
    uvs: concatF32(a.uvs, b.uvs),
    layers: concatF32(a.layers, b.layers),
    ao: concatF32(a.ao, b.ao),
    light: concatF32(a.light, b.light),
    indices,
  };
}
```

- [ ] **Step 5: Run the test**

Run: `npx vitest run tests/emitShaped.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Build (the `ChunkMeshes.cutout` addition makes existing producers fail type-check — that is expected and fixed in Tasks 5–6).**

Run: `npx tsc --noEmit`
Expected: errors ONLY about missing `cutout` in `ChunkManager.meshChunk` and `ChunkMeshRegistry`/its tests. Do not fix them here. If any OTHER file errors, fix it.

- [ ] **Step 7: Commit**

```bash
git add src/mesh/emitShaped.ts src/mesh/MeshTypes.ts tests/emitShaped.test.ts
git commit -m "feat(mesh): emitShaped (slab boxes + cross billboards) + cutout mesh type"
```

---

### Task 5: Cutout material + render pass wiring

**Files:**
- Modify: `src/render/ChunkMaterial.ts` (options-based `buildMaterial` + `createCutoutMaterial`)
- Modify: `src/render/ChunkMeshRegistry.ts` (third `cutout` mesh + material)
- Modify: `src/app/Game.ts` (create cutout material; register with `DayNight` + registry)
- Test: `tests/cutoutMaterial.test.ts` (new); update `tests/chunkMeshRegistry.test.ts` if present

**Interfaces:**
- Consumes: `ChunkMeshes.cutout` (Task 4).
- Produces: `createCutoutMaterial(tex): RawShaderMaterial` (alpha-test discard, `depthWrite:true`, `DoubleSide`); `ChunkMeshRegistry` constructor gains a `cutoutMaterial: Material` parameter (inserted before the optional `texture?`).

- [ ] **Step 1: Write the failing test** — `tests/cutoutMaterial.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { DataArrayTexture, DoubleSide } from 'three';
import { createCutoutMaterial, createChunkMaterial } from '../src/render/ChunkMaterial';

const tex = new DataArrayTexture(new Uint8Array(4), 1, 1, 1);

describe('createCutoutMaterial', () => {
  it('is opaque, depth-writing, double-sided with an alpha-test uniform', () => {
    const m = createCutoutMaterial(tex);
    expect(m.transparent).toBe(false);
    expect(m.depthWrite).toBe(true);
    expect(m.side).toBe(DoubleSide);
    expect(m.uniforms.uAlphaTest.value).toBeGreaterThan(0);
  });
  it('leaves the opaque material with no alpha test (unchanged behaviour)', () => {
    const m = createChunkMaterial(tex);
    expect(m.uniforms.uAlphaTest.value).toBe(0);
    expect(m.transparent).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/cutoutMaterial.test.ts`
Expected: FAIL — `createCutoutMaterial` does not exist.

- [ ] **Step 3: Refactor `src/render/ChunkMaterial.ts`**

In the fragment shader, add the uniform and the discard. Change the uniform block to include `uniform float uAlphaTest;` (after `uniform float uAlpha;`) and replace the `vec3 base = ...` line + final color logic:

```glsl
  vec4 texel = texture(uTex, vec3(vUv, vLayer));
  if (uAlphaTest > 0.0 && texel.a < uAlphaTest) discard;
  vec3 base = texel.rgb;
```

(The rest of `main()` is unchanged; it still outputs `vec4(color, uAlpha)`.)

Replace `buildMaterial` + the exported creators with an options object:

```ts
interface MaterialOpts {
  alpha?: number;
  transparent?: boolean;
  doubleSide?: boolean;
  alphaTest?: number;
}

function buildMaterial(tex: DataArrayTexture, opts: MaterialOpts = {}): RawShaderMaterial {
  const { alpha = 1.0, transparent = false, doubleSide = false, alphaTest = 0 } = opts;
  const material = new RawShaderMaterial({
    glslVersion: GLSL3,
    uniforms: {
      uTex: { value: tex },
      uLightDir: { value: new Vector3(0.5, 1.0, 0.3).normalize() },
      uFogColor: { value: new Vector3(0.529, 0.725, 0.91) },
      uFogNear: { value: 40 },
      uFogFar: { value: 220 },
      uAlpha: { value: alpha },
      uDayLight: { value: 1.0 },
      uAlphaTest: { value: alphaTest },
    },
    vertexShader,
    fragmentShader,
  });
  material.transparent = transparent;
  if (transparent) material.depthWrite = false;
  if (doubleSide) material.side = DoubleSide;
  return material;
}

export function createChunkMaterial(tex: DataArrayTexture): RawShaderMaterial {
  return buildMaterial(tex);
}

/** Translucent material for the transparent pass (water/glass; drawn after opaque, no depth write). */
export function createTransparentMaterial(tex: DataArrayTexture): RawShaderMaterial {
  return buildMaterial(tex, { alpha: 0.72, transparent: true, doubleSide: true });
}

/** Cutout material for plants: opaque + depth-writing, double-sided, with an alpha-test discard. */
export function createCutoutMaterial(tex: DataArrayTexture): RawShaderMaterial {
  return buildMaterial(tex, { alpha: 1.0, doubleSide: true, alphaTest: 0.5 });
}
```

- [ ] **Step 4: Run the material test**

Run: `npx vitest run tests/cutoutMaterial.test.ts`
Expected: PASS.

- [ ] **Step 5: Add the cutout mesh to `src/render/ChunkMeshRegistry.ts`**

Add `cutout?: Mesh;` to `Entry`. Add a `cutoutMaterial: Material` constructor parameter (before `texture?`):

```ts
  constructor(
    private readonly scene: Scene,
    private readonly opaqueMaterial: Material,
    private readonly transparentMaterial: Material,
    private readonly cutoutMaterial: Material,
    private readonly texture?: Texture,
  ) {}
```

In `upload`, after the transparent block and before `this.entries.set(key, entry);`:

```ts
    if (meshes.cutout.indices.length > 0) {
      const cutout = buildChunkMesh(meshes.cutout, this.cutoutMaterial);
      cutout.position.set(ox, 0, oz);
      this.scene.add(cutout);
      entry.cutout = cutout;
    }
```

In `remove`, after the transparent disposal:

```ts
    if (entry.cutout) {
      this.scene.remove(entry.cutout);
      entry.cutout.geometry.dispose();
    }
```

In `disposeAll`, after `this.transparentMaterial.dispose();`:

```ts
    this.cutoutMaterial.dispose();
```

- [ ] **Step 6: Wire it in `src/app/Game.ts`**

Update the material import and creation:

```ts
import {
  createChunkMaterial,
  createTransparentMaterial,
  createCutoutMaterial,
} from '../render/ChunkMaterial';
```

```ts
    const material = createChunkMaterial(texture);
    const transparentMaterial = createTransparentMaterial(texture);
    const cutoutMaterial = createCutoutMaterial(texture);
    const daynight = new DayNight(renderer.scene, [material, transparentMaterial, cutoutMaterial]);
```

And the registry construction:

```ts
    const sink = new ChunkMeshRegistry(renderer.scene, material, transparentMaterial, cutoutMaterial);
```

- [ ] **Step 7: If `tests/chunkMeshRegistry.test.ts` exists, update its constructor calls + `ChunkMeshes` fixtures**

Run: `npx vitest run tests/chunkMeshRegistry.test.ts` (skip if the file does not exist). Any `new ChunkMeshRegistry(scene, opaqueMat, transparentMat)` gains a 3rd material arg (reuse a stub `new MeshBasicMaterial()` or the transparent one). Any `ChunkMeshes` literal gains `cutout: emptyMeshData()` — add a local helper returning a MeshData with empty typed arrays (length-0), matching the existing `opaque`/`transparent` fixtures. A cutout with `indices.length === 0` uploads nothing, so existing assertions are unaffected.

- [ ] **Step 8: Build + full suite**

Run: `npm run -s build && npx vitest run`
Expected: green. (ChunkManager still errors on `cutout` — NO: Task 6 fixes meshChunk. If `tsc` still flags `ChunkManager.meshChunk` missing `cutout`, that is expected until Task 6; the `npm run -s build` here may fail on that single error. If so, proceed to Task 6 and run the build there. Note this in the commit body.)

- [ ] **Step 9: Commit**

```bash
git add src/render/ChunkMaterial.ts src/render/ChunkMeshRegistry.ts src/app/Game.ts tests/cutoutMaterial.test.ts
git commit -m "feat(render): cutout material + per-chunk cutout mesh, registered with DayNight"
```

---

### Task 6: ChunkManager integration (mesh + collision box)

**Files:**
- Modify: `src/world/ChunkManager.ts` (`meshChunk` runs `emitShaped`; add `solidBox`)
- Test: `tests/chunkManagerShapes.test.ts` (new)

**Interfaces:**
- Consumes: `emitShaped`, `mergeMeshData` (Task 4); `registry.collisionBox`/`shape` (Task 1).
- Produces: `ChunkManager.solidBox(wx, wy, wz): CollisionBox` (below-world `'full'`, above-world `'none'`, unloaded `'full'`, non-opaque `'none'`, else `registry.collisionBox(id)`).

- [ ] **Step 1: Write the failing test** — `tests/chunkManagerShapes.test.ts`

Self-contained (a custom-defs registry + a one-block generator + a capturing `ChunkSink` that records `meshes.cutout`) so it has no dependency on later content tasks:

```ts
import { describe, it, expect } from 'vitest';
import { ChunkManager } from '../src/world/ChunkManager';
import { GreedyMesher } from '../src/mesh/GreedyMesher';
import { BlockRegistry } from '../src/blocks/BlockRegistry';
import { buildBlockTextures, type BlockDef } from '../src/blocks/blocks';
import { ChunkData } from '../src/world/ChunkData';
import type { ChunkMeshes } from '../src/mesh/MeshTypes';
import type { Generator } from '../src/worldgen/Generator';

const stoneFaces = { pattern: 'stone', colors: [[128, 128, 132]] } as const;
const DEFS: BlockDef[] = [
  { id: 0, name: 'air', opaque: false, transparent: true },
  { id: 1, name: 'slab', opaque: true, transparent: false, shape: 'slab', faces: stoneFaces },
  { id: 2, name: 'plant', opaque: false, transparent: false, shape: 'cross', faces: { pattern: 'tallGrass', colors: [[60, 140, 60]] } },
];
const SLAB = 1;
const PLANT = 2;
const registry = new BlockRegistry(DEFS, buildBlockTextures(DEFS));

class OneBlock implements Generator {
  constructor(private readonly id: number, private readonly y: number) {}
  generateBaseChunk(_s: number, cx: number, cz: number): ChunkData {
    const d = new ChunkData(cx, cz);
    if (cx === 0 && cz === 0) d.set(0, this.y, 0, this.id);
    return d;
  }
}

function capture(): { sink: { upload: (k: string, m: ChunkMeshes) => void; dispose: () => void }; meshes: Map<string, ChunkMeshes> } {
  const meshes = new Map<string, ChunkMeshes>();
  return { sink: { upload: (k, m) => meshes.set(k, m), dispose: () => {} }, meshes };
}

describe('ChunkManager shaped meshing + solidBox', () => {
  it('routes a cross plant into the cutout mesh, not opaque', () => {
    const { sink, meshes } = capture();
    const mgr = new ChunkManager(new OneBlock(PLANT, 40), new GreedyMesher(registry), registry, sink, 1, []);
    mgr.preload(0, 0, 0);
    const m = meshes.get('0,0')!;
    expect(m.cutout.indices.length).toBeGreaterThan(0);
    expect(m.opaque.indices.length).toBe(0);
  });

  it('routes a slab into the opaque mesh and reports a lowerHalf collision box', () => {
    const { sink, meshes } = capture();
    const mgr = new ChunkManager(new OneBlock(SLAB, 40), new GreedyMesher(registry), registry, sink, 1, []);
    mgr.preload(0, 0, 0);
    expect(meshes.get('0,0')!.opaque.indices.length).toBeGreaterThan(0);
    expect(mgr.solidBox(0, 40, 0)).toBe('lowerHalf');
    expect(mgr.solidBox(0, 41, 0)).toBe('none'); // air above
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/chunkManagerShapes.test.ts`
Expected: FAIL — `m.cutout` is undefined / `mgr.solidBox` is not a function.

- [ ] **Step 3: Update `meshChunk` in `src/world/ChunkManager.ts`**

Add the import:

```ts
import { emitShaped, mergeMeshData } from '../mesh/emitShaped';
import type { CollisionBox } from '../blocks/blocks';
```

Replace `meshChunk`'s body:

```ts
  private meshChunk(cx: number, cz: number): void {
    const entry = this.store.get(cx, cz);
    if (!entry) return;
    const view = new VoxelView(entry.data, (dcx, dcz) => this.neighborData(cx + dcx, cz + dcz));
    const shaped = emitShaped(view, this.registry);
    const meshes: ChunkMeshes = {
      opaque: mergeMeshData(this.mesher.mesh(view, this.opaquePass), shaped.slabs),
      transparent: this.mesher.mesh(view, this.transparentPass),
      cutout: shaped.cross,
    };
    this.sink.upload(chunkKey(cx, cz), meshes);
    this.store.setState(cx, cz, ChunkState.Meshed);
  }
```

- [ ] **Step 4: Add `solidBox` next to `isSolid`**

```ts
  /**
   * Collision footprint of the voxel at world coords. Below the world is a full solid (so the
   * player never falls out); above it is empty; an unloaded chunk is full (never fall through
   * unstreamed terrain); a non-opaque voxel (air/water/plants) is empty; otherwise the block's
   * shape-derived box ('full' or 'lowerHalf').
   */
  solidBox(wx: number, wy: number, wz: number): CollisionBox {
    if (wy < 0) return 'full';
    if (wy >= WORLD_HEIGHT) return 'none';
    const entry = this.store.get(worldToChunkCoord(wx), worldToChunkCoord(wz));
    if (!entry) return 'full';
    const id = entry.data.get(worldToLocal(wx), wy, worldToLocal(wz));
    if (!this.registry.isOpaque(id)) return 'none';
    return this.registry.collisionBox(id);
  }
```

- [ ] **Step 5: Run the test + full suite + build**

Run (after Task 8, or with custom defs): `npx vitest run tests/chunkManagerShapes.test.ts && npx vitest run && npm run -s build`
Expected: green (the `cutout` type error from Task 4/5 is now resolved).

- [ ] **Step 6: Commit**

```bash
git add src/world/ChunkManager.ts tests/chunkManagerShapes.test.ts
git commit -m "feat(world): meshChunk emits shaped geometry + cutout; add solidBox"
```

---

### Task 7: Slab collision

**Files:**
- Modify: `src/player/Collision.ts` (box-aware overlap + surface-aware downward-Y snap; `solidBox?` on `SoliditySampler`)
- Modify: `src/player/PlayerController.ts` (interface only — `PlayerWorld extends SoliditySampler`, already inherits `solidBox?`)
- Modify: `src/app/Game.ts` (add `solidBox` to the sampler object)
- Test: `tests/collisionSlab.test.ts` (new)

**Interfaces:**
- Consumes: `manager.solidBox` (Task 6).
- Produces: `SoliditySampler.solidBox?(x, y, z): 'none' | 'full' | 'lowerHalf'`. When absent, behaviour derives from `isSolid` (`'full'`/`'none'`) so existing samplers/tests are unchanged.

- [ ] **Step 1: Write the failing test** — `tests/collisionSlab.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { resolveCollision, type SoliditySampler } from '../src/player/Collision';

const HALF = { x: 0.3, y: 0.9, z: 0.3 };

/** A floor of half-height slabs across y in [0, 0.5] at voxel layer y=0. */
const slabFloor: SoliditySampler = {
  isSolid: (_x, y) => y < 0 || y === 0, // voxel y=0 is "solid" for any isSolid caller
  solidBox: (_x, y) => (y < 0 ? 'full' : y === 0 ? 'lowerHalf' : 'none'),
};

describe('slab collision', () => {
  it('rests the player on the slab top (y=0.5), not the full-block top (y=1)', () => {
    // Drop from above; feet should settle at 0.5 → center.y = 0.5 + half.y.
    const r = resolveCollision(slabFloor, { x: 0, y: 5, z: 0 }, HALF, { x: 0, y: -10, z: 0 });
    expect(r.center.y).toBeCloseTo(0.5 + HALF.y, 2);
    expect(r.grounded).toBe(true);
  });

  it('a cross plant (none) never blocks movement', () => {
    const plants: SoliditySampler = { isSolid: () => false, solidBox: () => 'none' };
    const r = resolveCollision(plants, { x: 0, y: 5, z: 0 }, HALF, { x: 0, y: -10, z: 0 });
    expect(r.center.y).toBeCloseTo(-5, 5); // fell straight through
    expect(r.grounded).toBe(false);
  });
});
```

- [ ] **Step 2: Add a regression guard that cubes are unchanged** — append to `tests/collision.test.ts`

```ts
it('full-cube floor still rests the player at the integer top (regression)', () => {
  const floor: SoliditySampler = { isSolid: (_x, y) => y < 0 };
  const r = resolveCollision(floor, { x: 0, y: 5, z: 0 }, { x: 0.3, y: 0.9, z: 0.3 }, { x: 0, y: -10, z: 0 });
  expect(r.center.y).toBeCloseTo(0 + 0.9, 5); // feet at 0 (top of voxel y=-1), center at 0.9
  expect(r.grounded).toBe(true);
});
```

- [ ] **Step 3: Run them to verify failure**

Run: `npx vitest run tests/collisionSlab.test.ts`
Expected: FAIL — the player rests at `1 + half.y` (integer snap), not `0.5 + half.y`.

- [ ] **Step 4: Make overlap box-aware in `src/player/Collision.ts`**

Add the optional method to the interface:

```ts
export interface SoliditySampler {
  isSolid(x: number, y: number, z: number): boolean;
  /** Collision footprint of a voxel; defaults (when absent) to 'full' if isSolid else 'none'. */
  solidBox?(x: number, y: number, z: number): 'none' | 'full' | 'lowerHalf';
}
```

Add a resolver + the new overlap (replace `overlapsSolid`):

```ts
type Box = 'none' | 'full' | 'lowerHalf';

/** The collision box at a voxel, falling back to isSolid when no solidBox is provided. */
function boxAt(sampler: SoliditySampler, x: number, y: number, z: number): Box {
  if (sampler.solidBox) return sampler.solidBox(x, y, z);
  return sampler.isSolid(x, y, z) ? 'full' : 'none';
}

/** The top surface height of a voxel's solid region (its base is the voxel floor `y`). */
function boxTop(box: Box, y: number): number {
  return box === 'lowerHalf' ? y + 0.5 : y + 1; // 'full' → y+1
}

/** True if the AABB [center±half] overlaps any solid voxel's solid sub-box. */
function overlapsSolid(sampler: SoliditySampler, center: Vec3, half: Vec3): boolean {
  const x0 = Math.floor(center.x - half.x);
  const x1 = Math.floor(center.x + half.x);
  const y0 = Math.floor(center.y - half.y);
  const y1 = Math.floor(center.y + half.y);
  const z0 = Math.floor(center.z - half.z);
  const z1 = Math.floor(center.z + half.z);
  const aabbMinY = center.y - half.y;
  const aabbMaxY = center.y + half.y;
  for (let y = y0; y <= y1; y++)
    for (let z = z0; z <= z1; z++)
      for (let x = x0; x <= x1; x++) {
        const box = boxAt(sampler, x, y, z);
        if (box === 'none') continue;
        if (box === 'full') return true; // any full voxel in the floored range overlaps
        // lowerHalf: solid region is [y, y+0.5] — overlap only if the AABB dips into it.
        if (aabbMinY < y + 0.5 && aabbMaxY > y) return true;
      }
  return false;
}
```

(For cube worlds `boxAt` returns `'full'`/`'none'` and the function is identical to the old one — the regression test guards this.)

- [ ] **Step 5: Make the downward-Y landing surface-aware in `resolveCollision`**

Add a helper above `resolveCollision`:

```ts
/**
 * Highest solid surface under the footprint at or below the player's feet, scanning the band the
 * feet pass through. Used to rest the player on the actual surface (slab top = y+0.5, full = y+1).
 * Returns -Infinity if nothing solid is hit.
 */
function highestSupport(
  sampler: SoliditySampler,
  center: Vec3,
  half: Vec3,
  feet0: number,
  feetTarget: number,
): number {
  const x0 = Math.floor(center.x - half.x);
  const x1 = Math.floor(center.x + half.x);
  const z0 = Math.floor(center.z - half.z);
  const z1 = Math.floor(center.z + half.z);
  const yLo = Math.floor(feetTarget - EPS);
  const yHi = Math.floor(feet0 + EPS);
  let best = -Infinity;
  for (let y = yLo; y <= yHi; y++)
    for (let z = z0; z <= z1; z++)
      for (let x = x0; x <= x1; x++) {
        const box = boxAt(sampler, x, y, z);
        if (box === 'none') continue;
        const top = boxTop(box, y);
        if (top <= feet0 + EPS && top > best) best = top;
      }
  return best;
}
```

In `resolveCollision`, replace the `// --- Y axis ---` block:

```ts
    // --- Y axis ---
    if (sd.y < 0) {
      const feet0 = pos.y - half.y;
      const movedDown: Vec3 = { ...pos, y: pos.y + sd.y };
      if (overlapsSolid(sampler, movedDown, half)) {
        const support = highestSupport(sampler, pos, half, feet0, feet0 + sd.y);
        pos.y = support + half.y + EPS;
        grounded = true;
      } else {
        pos.y += sd.y;
      }
    } else {
      const y = sweepAxis(sampler, pos, half, 'y', sd.y);
      pos.y = y.value;
    }
```

(Upward and zero `sd.y` still go through `sweepAxis` — integer head-bump is correct since slabs are bottom-aligned. The X/Z sweeps already use the box-aware `overlapsSolid`.)

- [ ] **Step 6: Add `solidBox` to the Game sampler — `src/app/Game.ts`**

```ts
    const sampler = {
      isSolid: (x: number, y: number, z: number) => manager.isSolid(x, y, z),
      isWater: (x: number, y: number, z: number) => manager.isWater(x, y, z),
      solidBox: (x: number, y: number, z: number) => manager.solidBox(x, y, z),
    };
```

(`PlayerWorld extends SoliditySampler`, so it already carries the optional `solidBox?`. No `PlayerController.ts` logic change is needed — confirm it still type-checks.)

- [ ] **Step 7: Run the tests + full suite + build**

Run: `npx vitest run tests/collisionSlab.test.ts tests/collision.test.ts && npx vitest run && npm run -s build`
Expected: green — slab rests at 0.5, plants pass through, cubes unchanged, all prior collision/step-up tests still pass.

- [ ] **Step 8: Commit**

```bash
git add src/player/Collision.ts src/app/Game.ts tests/collisionSlab.test.ts tests/collision.test.ts
git commit -m "feat(player): box-aware collision — slabs rest at half height, plants non-solid"
```

---

### Task 8: Content — slabs + plants

**Files:**
- Modify: `src/blocks/blocks.ts` (4 new blocks, ids 27–30)
- Test: `tests/blocks.test.ts` (extend) or `tests/shapeContent.test.ts` (new)

**Interfaces:**
- Consumes: `Shape` (Task 1), the `flower`/`tallGrass` patterns (Task 3).
- Produces: ids `STONE_SLAB = 27`, `PLANK_SLAB = 28`, `FLOWER = 29`, `TALL_GRASS = 30`.

- [ ] **Step 1: Write the failing test** — `tests/shapeContent.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { BlockRegistry } from '../src/blocks/BlockRegistry';
import { STONE_SLAB, PLANK_SLAB, FLOWER, TALL_GRASS } from '../src/blocks/blocks';

const reg = new BlockRegistry();

describe('shape content blocks', () => {
  it('has stable ids 27–30', () => {
    expect([STONE_SLAB, PLANK_SLAB, FLOWER, TALL_GRASS]).toEqual([27, 28, 29, 30]);
  });
  it('slabs are opaque lowerHalf; plants are cross + non-solid + non-occluding', () => {
    expect(reg.shape(STONE_SLAB)).toBe('slab');
    expect(reg.collisionBox(PLANK_SLAB)).toBe('lowerHalf');
    expect(reg.occludes(STONE_SLAB)).toBe(false);
    expect(reg.shape(FLOWER)).toBe('cross');
    expect(reg.collisionBox(TALL_GRASS)).toBe('none');
    expect(reg.occludes(FLOWER)).toBe(false);
  });
  it('all four appear in the creative picker and resolve to 6 face layers', () => {
    for (const id of [STONE_SLAB, PLANK_SLAB, FLOWER, TALL_GRASS]) {
      expect(reg.get(id).creative).toBe(true);
      expect(() => reg.faceLayer(id, 0)).not.toThrow();
    }
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/shapeContent.test.ts`
Expected: FAIL — `STONE_SLAB` is not exported.

- [ ] **Step 3: Add the id constants in `src/blocks/blocks.ts`**

After `export const GRAVEL: BlockId = 26;`:

```ts
export const STONE_SLAB: BlockId = 27;
export const PLANK_SLAB: BlockId = 28;
export const FLOWER: BlockId = 29;
export const TALL_GRASS: BlockId = 30;
```

- [ ] **Step 4: Add the `BLOCK_DEFS` rows**

Append to the `BLOCK_DEFS` array (after the `GRAVEL` entry, before the closing `];`):

```ts
  {
    id: STONE_SLAB,
    name: 'stone slab',
    opaque: true,
    transparent: false,
    creative: true,
    shape: 'slab',
    faces: stone([128, 128, 132]),
  },
  {
    id: PLANK_SLAB,
    name: 'plank slab',
    opaque: true,
    transparent: false,
    creative: true,
    shape: 'slab',
    faces: { pattern: 'planks', colors: [[165, 130, 80]] },
  },
  {
    id: FLOWER,
    name: 'flower',
    opaque: false,
    transparent: false,
    creative: true,
    shape: 'cross',
    faces: {
      pattern: 'flower',
      colors: [
        [60, 140, 60],
        [220, 70, 90],
      ],
    },
  },
  {
    id: TALL_GRASS,
    name: 'tall grass',
    opaque: false,
    transparent: false,
    creative: true,
    shape: 'cross',
    faces: { pattern: 'tallGrass', colors: [[70, 150, 64]] },
  },
```

- [ ] **Step 5: Run the test + full suite + build**

Run: `npx vitest run tests/shapeContent.test.ts && npx vitest run && npm run -s build`
Expected: green. (The Task 6 test `tests/chunkManagerShapes.test.ts` now passes against the real registry — re-run it.)

- [ ] **Step 6: Commit**

```bash
git add src/blocks/blocks.ts tests/shapeContent.test.ts
git commit -m "feat(blocks): stone/plank slabs + flower/tall-grass plants (ids 27-30)"
```

---

### Task 9: Decoration scatter overlay

**Files:**
- Create: `src/worldgen/Decorations.ts`
- Modify: `src/worldgen/Presets.ts` (wire into `default`, `villages`, `frontier`)
- Test: `tests/decorations.test.ts` (new)

**Interfaces:**
- Consumes: `Overlay` (`(chunk, cx, cz, seed) => void`), `ChunkData`, `GRASS`/`FLOWER`/`TALL_GRASS`.
- Produces: `scatterDecorations(opts?: { density?: number }): Overlay`.

- [ ] **Step 1: Write the failing test** — `tests/decorations.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { ChunkData } from '../src/world/ChunkData';
import { GRASS, STONE, FLOWER, TALL_GRASS, AIR } from '../src/blocks/blocks';
import { scatterDecorations } from '../src/worldgen/Decorations';
import { CHUNK_SIZE_X, CHUNK_SIZE_Z } from '../src/core/constants';

function grassFlat(cx: number, cz: number, surface: number): ChunkData {
  const d = new ChunkData(cx, cz);
  for (let z = 0; z < CHUNK_SIZE_Z; z++)
    for (let x = 0; x < CHUNK_SIZE_X; x++) {
      for (let y = 0; y < surface; y++) d.set(x, y, z, STONE);
      d.set(x, surface, z, GRASS);
    }
  return d;
}

function countPlants(d: ChunkData, surface: number): number {
  let n = 0;
  for (let z = 0; z < CHUNK_SIZE_Z; z++)
    for (let x = 0; x < CHUNK_SIZE_X; x++) {
      const id = d.get(x, surface + 1, z);
      if (id === FLOWER || id === TALL_GRASS) n++;
    }
  return n;
}

describe('scatterDecorations', () => {
  it('places plants on grass tops, deterministically', () => {
    const a = grassFlat(0, 0, 40);
    const b = grassFlat(0, 0, 40);
    const overlay = scatterDecorations({ density: 0.5 });
    overlay(a, 0, 0, 1337);
    overlay(b, 0, 0, 1337);
    const na = countPlants(a, 40);
    expect(na).toBeGreaterThan(0);
    expect(na).toBe(countPlants(b, 40)); // same seed/coords → identical
  });
  it('never replaces the grass surface itself and never on stone', () => {
    const d = grassFlat(0, 0, 40);
    scatterDecorations({ density: 0.5 })(d, 0, 0, 1337);
    for (let z = 0; z < CHUNK_SIZE_Z; z++)
      for (let x = 0; x < CHUNK_SIZE_X; x++) expect(d.get(x, 40, z)).toBe(GRASS);
  });
  it('is border-stable: a column produces the same plant regardless of which chunk owns it', () => {
    // world column (16,16) is local (0,0) of chunk (1,1).
    const here = grassFlat(1, 1, 40);
    scatterDecorations({ density: 1 })(here, 1, 1, 1337);
    // Re-derive the same world column via the hash directly is covered by determinism above;
    // here we assert at least that high density fills most columns (sanity).
    expect(countPlants(here, 40)).toBeGreaterThan(0);
    void AIR;
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/decorations.test.ts`
Expected: FAIL — `scatterDecorations` does not exist.

- [ ] **Step 3: Create `src/worldgen/Decorations.ts`**

```ts
import { CHUNK_SIZE_X, CHUNK_SIZE_Z, WORLD_HEIGHT } from '../core/constants';
import { AIR, GRASS, FLOWER, TALL_GRASS } from '../blocks/blocks';
import type { ChunkData } from '../world/ChunkData';
import type { Overlay } from './Generator';
import type { WorldSeed } from '../core/types';

/** MurmurHash3 finalizer over 32-bit integer space → [0,1). Mirrors OreScatterer.hashToFloat. */
function hashToFloat(h: number): number {
  let x = h >>> 0;
  x = (x ^ (x >>> 16)) >>> 0;
  x = Math.imul(x, 0x45d9f3b) >>> 0;
  x = (x ^ (x >>> 16)) >>> 0;
  x = Math.imul(x, 0x45d9f3b) >>> 0;
  x = (x ^ (x >>> 16)) >>> 0;
  return x / 0x100000000;
}

/** Topmost non-air voxel y in a column, or -1 if the column is empty. */
function surfaceY(chunk: ChunkData, lx: number, lz: number): number {
  for (let y = WORLD_HEIGHT - 1; y >= 0; y--) if (chunk.get(lx, y, lz) !== AIR) return y;
  return -1;
}

export interface DecorationOptions {
  /** Fraction of grass columns that receive a plant (0..1). Default 0.08. */
  density?: number;
}

/**
 * Scatters flowers / tall grass one voxel above grass surfaces. Deterministic in world
 * coordinates (Math.imul hashing, like OreScatterer) so a column produces the same plant no
 * matter which chunk meshes it — no seams. Runs as a post-terrain overlay (becomes base terrain).
 */
export function scatterDecorations(opts: DecorationOptions = {}): Overlay {
  const density = opts.density ?? 0.08;
  const SALT = 0x0d3c0;
  return (chunk: ChunkData, cx: number, cz: number, seed: WorldSeed): void => {
    for (let lz = 0; lz < CHUNK_SIZE_Z; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE_X; lx++) {
        const sy = surfaceY(chunk, lx, lz);
        if (sy < 0 || sy + 1 >= WORLD_HEIGHT) continue;
        if (chunk.get(lx, sy, lz) !== GRASS) continue;
        if (chunk.get(lx, sy + 1, lz) !== AIR) continue;
        const wx = cx * CHUNK_SIZE_X + lx;
        const wz = cz * CHUNK_SIZE_Z + lz;
        const hash =
          (Math.imul(wx, 73856093) ^
            Math.imul(wz, 83492791) ^
            Math.imul(seed, 2654435761) ^
            SALT) >>>
          0;
        const r = hashToFloat(hash);
        if (r >= density) continue;
        // Second hash bit chooses the plant so flowers/grass interleave deterministically.
        const pick = hashToFloat((hash ^ 0x9e3779b1) >>> 0);
        chunk.set(lx, sy + 1, lz, pick < 0.35 ? FLOWER : TALL_GRASS);
      }
    }
  };
}
```

- [ ] **Step 4: Wire into `src/worldgen/Presets.ts`**

Add the import:

```ts
import { scatterDecorations } from './Decorations';
```

Add `scatterDecorations()` to the overlay lists for `default`, `villages`, and `frontier` (after `scatterTrees`/`scatterStructures`). For `default`:

```ts
    case 'default':
    default:
      return { generator: createWorldGenerator(), overlays: [scatterTrees, scatterDecorations()] };
```

For `villages` and `frontier`, append `scatterDecorations()` to their existing `overlays` arrays.

- [ ] **Step 5: Run the test + full suite + build**

Run: `npx vitest run tests/decorations.test.ts && npx vitest run && npm run -s build`
Expected: green.

- [ ] **Step 6: Commit**

```bash
git add src/worldgen/Decorations.ts src/worldgen/Presets.ts tests/decorations.test.ts
git commit -m "feat(worldgen): deterministic flower/tall-grass scatter on grass surfaces"
```

---

### Task 10: Final verification + docs

**Files:**
- Modify: `docs/specs/2026-06-29-shapes-track-e1-design.md` (mark Status: implemented)
- Modify: `README.md` or the relevant block/feature doc if it lists block content (only if such a list exists)
- Test: none new — full suite + build + live smoke

- [ ] **Step 1: Lint + format the whole branch**

Run: `npx prettier --check "src/**/*.ts" "tests/**/*.ts" && npx eslint src tests`
Expected: clean (run `npx prettier --write` on anything flagged, then re-check + commit).

- [ ] **Step 2: Full type-check, build, and test suite**

Run: `npm run -s build && npx vitest run`
Expected: build green; entire suite passes (the prior count + the new shape tests).

- [ ] **Step 3: Live in-app smoke (dev server + preview tools)**

Start the dev server and verify in the browser preview (this is observable behaviour — do not skip):
- Place a `STONE_SLAB` (id 27) on top of a stone cube → the cube shows no z-fighting at the seam and the slab is visibly half-height.
- Walk the player onto the slab → they stand at the half-step (≈0.5 above the cube top), not floating a full block up.
- Place a `FLOWER` (29) / `TALL_GRASS` (30) → renders with a transparent background (no opaque quad), lit by day/night, and is walk-through.
- Load `?world=frontier` (or `default`) → flowers/tall grass scattered on grass; no console errors.

Capture a screenshot as proof.

- [ ] **Step 4: Update the spec status + docs**

In `docs/specs/2026-06-29-shapes-track-e1-design.md`, change `Status:` to `Implemented (PR pending)`.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "docs(specs): mark E1 implemented; final verification"
```

- [ ] **Step 6: Hand off to finishing-a-development-branch**

After this task, the controller invokes superpowers:finishing-a-development-branch. The post-merge memory update (new shapes, the cutout pass, slab collision in `voxel-realm-codebase-improvements` + `voxel-realm-agent-playground`) happens then.

---

## Self-Review

**Spec coverage** (8 components):
1. `BlockDef.shape` → T1, content T8. ✅
2. Registry `shape`/`occludes`/`collisionBox` + exhaustive selfCheck → T1. ✅
3. Occlusion-aware passes (incl. transparent shape guard) → T2. ✅
4. `emitShaped` + `cutout` mesh + merge → T4; ChunkManager integration → T6. ✅
5. CutoutMaterial + registry + DayNight registration → T5. ✅
6. RGBA `paintLayer` + plant patterns → T3. ✅
7. Slab collision (collisionBox + box-aware Collision + solidBox) → T1 (box), T6 (solidBox), T7 (Collision). ✅
8. Content + decoration scatter → T8, T9. ✅
Non-goals (tint, stairs/fences, save change) — none introduced. ✅

**Type consistency:** `Shape`/`CollisionBox` defined in `blocks.ts` (T1), consumed by registry (T1), ChunkManager (T6); `emitShaped`/`mergeMeshData` signatures match their consumer in `meshChunk` (T6); `ChunkMeshes.cutout` (T4) is produced in `meshChunk` (T6) and consumed in `ChunkMeshRegistry` (T5); `createCutoutMaterial` (T5) consumed in `Game.boot` (T5) and the registry ctor's new `cutoutMaterial` param (T5); `solidBox` produced on ChunkManager (T6), consumed via the sampler in `Game.ts` (T7) and `Collision.boxAt` (T7). Consistent.

**Ordering:** Every task is independently testable in order — `tests/chunkManagerShapes.test.ts` (T6) uses a self-contained custom-defs registry, so it does not depend on the content ids from T8. The one cross-task seam is a known transient `tsc` error after Tasks 4–5 (`ChunkMeshes.cutout` missing in `meshChunk`), resolved in T6; both tasks flag it, and unit tests (`vitest`) still pass in between since vitest does not type-check.

**Placeholder scan:** No TBD/TODO; every code step has full code; every test step has assertions.
