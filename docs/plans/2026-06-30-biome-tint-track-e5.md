# Biome Tint (Track E5) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tint grass tops, leaves, and tall grass by their column's biome via a new per-vertex `tint` attribute multiplied into the fragment color — no save change.

**Architecture:** A per-biome multiplier palette (Plains = identity `[1,1,1]`). The Generator stamps a per-column biome into `ChunkData`; the meshers look it up and write a per-vertex tint (white when untinted). A small `tintIndex` rides the greedy merge key so same-biome grass tops still merge. The shader does `base *= vTint`.

**Tech Stack:** TypeScript (strict), three.js (RawShaderMaterial / GLSL3), Vitest. Builds on E1 (`emitShaped`/cutout), E2 (state), E3/E4 (shapes), and the existing greedy mesher + baked-light vertex pipeline.

## Global Constraints

- **No `SAVE_VERSION` / persistence change** — biome is regenerated, never serialized. `parseWorldSnapshot`/`worldDiskStore.writeChunk`/`/__world` are untouched.
- **Plains + every untinted face = white `[1,1,1]`** → existing worlds render pixel-identical; greedy merging of untinted faces is byte-identical (the merge key folds in `tintIndex 0`).
- No new block ids. No texture changes. `selfCheck()` passes; the `Shape` system + all E1–E4 behavior unchanged.
- Per-biome **discrete** tint (constant within a biome) — never a per-column gradient (would defeat greedy merging).
- Strict TS, no `any`; prettier+eslint clean; `npm run -s build` green; full vitest suite green.
- Layering: `TintCategory` lives in `blocks.ts`; the palette is `src/mesh/Tint.ts` (consumed by the meshers; the shader needs no palette). No `mesh → render` import.
- Biome ordinals (from `src/worldgen/BiomeMap.ts` `enum Biome`): Plains 0, Forest 1, Desert 2, Mountains 3, Tundra 4, Swamp 5.

## Spec

`docs/specs/2026-06-30-biome-tint-track-e5-design.md` (6 components). This plan implements them.

## File Structure

- `src/blocks/blocks.ts` — `TintCategory` type; `BlockDef.tint`/`tintTopOnly`; flags on GRASS/LEAVES/TALL_GRASS.
- `src/blocks/BlockRegistry.ts` — `tintCategory(id, face)`.
- `src/mesh/Tint.ts` — palette + `tintIndexFor` + `WHITE`/`TINT_PALETTE`/`RGB`.
- `src/world/ChunkData.ts` — per-column `biomeData` + `getBiome`/`setBiome`.
- `src/worldgen/SurfacePainter.ts` — stamp biome per column.
- `src/world/VoxelView.ts` — `biomeAt`.
- `src/mesh/MeshTypes.ts` — `MeshData.tint`.
- `src/mesh/GreedyMesher.ts` — tint in the merge key + per-vertex tint.
- `src/mesh/emitShaped.ts` — tint in `Buf`/`pushBoxFace`/`emitCross`/`mergeMeshData`.
- `src/render/buildChunkMesh.ts` + `src/render/ChunkMaterial.ts` — `tint` attribute + `base *= vTint`.

---

### Task 1: `TintCategory` + tint flags + `registry.tintCategory`

**Files:**
- Modify: `src/blocks/blocks.ts` (`TintCategory`, `BlockDef`, GRASS/LEAVES/TALL_GRASS)
- Modify: `src/blocks/BlockRegistry.ts` (`tintCategory`)
- Test: `tests/tintCategory.test.ts` (new)

**Interfaces:**
- Produces: `type TintCategory = 'grass' | 'foliage'`; `BlockDef.tint?: TintCategory`; `BlockDef.tintTopOnly?: boolean`; `registry.tintCategory(id, face): TintCategory | undefined`.

- [ ] **Step 1: Write the failing test** — `tests/tintCategory.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { BlockRegistry } from '../src/blocks/BlockRegistry';
import { Face, GRASS, LEAVES, STONE, TALL_GRASS } from '../src/blocks/blocks';

const reg = new BlockRegistry();

describe('registry.tintCategory', () => {
  it('grass tints only its top face', () => {
    expect(reg.tintCategory(GRASS, Face.PosY)).toBe('grass');
    expect(reg.tintCategory(GRASS, Face.NegY)).toBeUndefined();
    expect(reg.tintCategory(GRASS, Face.PosX)).toBeUndefined();
  });
  it('leaves tint on every face; tall grass is foliage', () => {
    expect(reg.tintCategory(LEAVES, Face.PosX)).toBe('foliage');
    expect(reg.tintCategory(LEAVES, Face.NegY)).toBe('foliage');
    expect(reg.tintCategory(TALL_GRASS, Face.PosY)).toBe('foliage');
  });
  it('untinted blocks return undefined', () => {
    expect(reg.tintCategory(STONE, Face.PosY)).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/tintCategory.test.ts`
Expected: FAIL — `tintCategory` is not a function; `tint`/`tintTopOnly` unknown.

- [ ] **Step 3: Add the type + fields in `src/blocks/blocks.ts`**

After `export type Shape = ...;` add:

```ts
/** Biome-tint category for a block's foliage faces. Omitted = untinted. */
export type TintCategory = 'grass' | 'foliage';
```

In `BlockDef`, after the `shape?` field, add:

```ts
  /** Biome-tint category applied to this block's faces (foliage). Omitted = untinted. */
  tint?: TintCategory;
  /** When true, only the top (PosY) face is tinted (e.g. grass — sides are dirt). */
  tintTopOnly?: boolean;
```

Add the flags to the three defs:
- GRASS def — add `tint: 'grass', tintTopOnly: true,` (alongside `creative: true`).
- LEAVES def — add `tint: 'foliage',`.
- TALL_GRASS def — add `tint: 'foliage',`.

- [ ] **Step 4: Add `tintCategory` to `src/blocks/BlockRegistry.ts`**

Add `TintCategory` to the type import from `./blocks`. After `shape(id)`, add:

```ts
  /** The biome-tint category for a face of a block, or undefined if that face is untinted. */
  tintCategory(id: BlockId, face: Face): TintCategory | undefined {
    const def = this.get(id);
    if (!def.tint) return undefined;
    if (def.tintTopOnly && face !== Face.PosY) return undefined;
    return def.tint;
  }
```

`Face` is imported as a `type` in BlockRegistry; it's used as a value here (`Face.PosY`), so change its import from `type Face` to a value import: in the `import { ... } from './blocks'` block move `Face` out of the `type`-only list into a value import (`import { Face } from './blocks';` plus the existing type imports).

- [ ] **Step 5: Run the test + full suite + build**

Run: `npx vitest run tests/tintCategory.test.ts && npx vitest run && npm run -s build`
Expected: green. (Additive fields; no behavior change for existing blocks. If a snapshot/count test enumerates block fields it may need the new optional fields — none expected.)

- [ ] **Step 6: Commit**

```bash
git add src/blocks/blocks.ts src/blocks/BlockRegistry.ts tests/tintCategory.test.ts
git commit -m "feat(blocks): TintCategory + tint flags (grass/leaves/tall-grass) + registry.tintCategory"
```

---

### Task 2: Tint palette (`src/mesh/Tint.ts`)

**Files:**
- Create: `src/mesh/Tint.ts`
- Test: `tests/tintPalette.test.ts` (new)

**Interfaces:**
- Consumes: `TintCategory` (Task 1).
- Produces: `type RGB`; `WHITE: RGB`; `TINT_PALETTE: RGB[]` (13 entries, index 0 = white); `tintIndexFor(biome, category): number`.

- [ ] **Step 1: Write the failing test** — `tests/tintPalette.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { WHITE, TINT_PALETTE, tintIndexFor } from '../src/mesh/Tint';
import { Biome } from '../src/worldgen/BiomeMap';

describe('tint palette', () => {
  it('index 0 is white; palette has 1 + 6 + 6 = 13 entries', () => {
    expect(WHITE).toEqual([1, 1, 1]);
    expect(TINT_PALETTE.length).toBe(13);
    expect(TINT_PALETTE[0]).toEqual([1, 1, 1]);
  });
  it('Plains grass is the identity multiplier', () => {
    const i = tintIndexFor(Biome.Plains, 'grass');
    expect(i).toBe(1);
    expect(TINT_PALETTE[i]).toEqual([1, 1, 1]);
  });
  it('grass and foliage map to distinct index ranges; Swamp differs from Plains', () => {
    expect(tintIndexFor(Biome.Plains, 'foliage')).toBe(7);
    expect(tintIndexFor(Biome.Swamp, 'grass')).toBe(6);
    expect(TINT_PALETTE[tintIndexFor(Biome.Swamp, 'grass')]).not.toEqual([1, 1, 1]);
  });
  it('an out-of-range biome clamps to Plains (no out-of-bounds index)', () => {
    expect(tintIndexFor(99, 'grass')).toBe(1);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/tintPalette.test.ts`
Expected: FAIL — `src/mesh/Tint.ts` not found.

- [ ] **Step 3: Create `src/mesh/Tint.ts`**

```ts
import type { TintCategory } from '../blocks/blocks';

export type RGB = readonly [number, number, number];

/** The no-tint multiplier (and palette index 0). */
export const WHITE: RGB = [1, 1, 1];

// Per-biome multipliers, indexed by Biome ordinal 0..5
// (Plains, Forest, Desert, Mountains, Tundra, Swamp). Plains = identity so
// existing worlds' plains/forest grass renders unchanged.
const GRASS_TINTS: readonly RGB[] = [
  [1.0, 1.0, 1.0], // Plains
  [0.92, 1.0, 0.85], // Forest — lush
  [0.86, 0.78, 0.45], // Desert — dry tan
  [0.8, 0.85, 0.7], // Mountains
  [0.78, 0.86, 0.82], // Tundra — pale cold
  [0.62, 0.7, 0.42], // Swamp — murky
];
const FOLIAGE_TINTS: readonly RGB[] = [
  [1.0, 1.0, 1.0], // Plains
  [0.85, 0.98, 0.78], // Forest
  [0.8, 0.74, 0.42], // Desert
  [0.74, 0.82, 0.66], // Mountains
  [0.74, 0.84, 0.8], // Tundra
  [0.55, 0.66, 0.4], // Swamp
];

/** index 0 = white; 1..6 = grass per biome; 7..12 = foliage per biome. */
export const TINT_PALETTE: RGB[] = [WHITE, ...GRASS_TINTS, ...FOLIAGE_TINTS];

/** The palette index for a (biome, category). An unknown biome clamps to Plains. */
export function tintIndexFor(biome: number, category: TintCategory): number {
  const b = biome >= 0 && biome < 6 ? biome : 0;
  return category === 'grass' ? 1 + b : 7 + b;
}
```

- [ ] **Step 4: Run the test + build**

Run: `npx vitest run tests/tintPalette.test.ts && npm run -s build`
Expected: green.

- [ ] **Step 5: Commit**

```bash
git add src/mesh/Tint.ts tests/tintPalette.test.ts
git commit -m "feat(mesh): per-biome tint palette (Plains = identity) + tintIndexFor"
```

---

### Task 3: Per-column biome in `ChunkData` + `VoxelView.biomeAt`

**Files:**
- Modify: `src/world/ChunkData.ts` (`biomeData`, `getBiome`/`setBiome`)
- Modify: `src/worldgen/SurfacePainter.ts` (stamp biome)
- Modify: `src/world/VoxelView.ts` (`biomeAt`)
- Test: `tests/chunkBiome.test.ts` (new)

**Interfaces:**
- Produces: `ChunkData.getBiome(x,z)`/`setBiome(x,z,biome)`; `VoxelView.biomeAt(x,z): number`.

- [ ] **Step 1: Write the failing test** — `tests/chunkBiome.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { ChunkData } from '../src/world/ChunkData';
import { VoxelView } from '../src/world/VoxelView';
import { createWorldGenerator } from '../src/worldgen/LayeredGenerator';

describe('per-column biome', () => {
  it('ChunkData biome round-trips; default is 0', () => {
    const d = new ChunkData(0, 0);
    expect(d.getBiome(3, 4)).toBe(0);
    d.setBiome(3, 4, 5);
    expect(d.getBiome(3, 4)).toBe(5);
    expect(d.getBiome(0, 0)).toBe(0);
  });
  it('VoxelView.biomeAt reads the center chunk; neighbors read 0', () => {
    const d = new ChunkData(0, 0);
    d.setBiome(2, 2, 3);
    const view = new VoxelView(d, () => undefined);
    expect(view.biomeAt(2, 2)).toBe(3);
    expect(view.biomeAt(-1, 2)).toBe(0); // neighbor column → default
  });
  it('the generator stamps a biome for every column', () => {
    const chunk = createWorldGenerator().generateBaseChunk(12345, 0, 0);
    // Every column has a biome ordinal in 0..5.
    for (let x = 0; x < 16; x++)
      for (let z = 0; z < 16; z++) expect(chunk.getBiome(x, z)).toBeLessThanOrEqual(5);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/chunkBiome.test.ts`
Expected: FAIL — `getBiome`/`setBiome`/`biomeAt` missing.

- [ ] **Step 3: Add `biomeData` to `src/world/ChunkData.ts`**

Add `CHUNK_AREA` and `CHUNK_SIZE_X` to the constants import. After the `state` field, add:

```ts
  /** Per-column biome ordinal (0 = Plains). Regenerated, NOT serialized. */
  readonly biomeData = new Uint8Array(CHUNK_AREA);
```

Add the accessors (after `setState`):

```ts
  /** Biome ordinal for a column; 0 (Plains) out of bounds. */
  getBiome(x: number, z: number): number {
    if (x < 0 || x >= CHUNK_SIZE_X || z < 0 || z >= CHUNK_SIZE_X) return 0;
    return this.biomeData[x + CHUNK_SIZE_X * z];
  }

  setBiome(x: number, z: number, biome: number): void {
    if (x < 0 || x >= CHUNK_SIZE_X || z < 0 || z >= CHUNK_SIZE_X) {
      throw new RangeError(`ChunkData.setBiome out of bounds: (${x}, ${z})`);
    }
    this.biomeData[x + CHUNK_SIZE_X * z] = biome & 0xff;
  }
```

(Note: `CHUNK_AREA === CHUNK_SIZE_X * CHUNK_SIZE_Z` and `CHUNK_SIZE_X === CHUNK_SIZE_Z === 16`; the column stride is `CHUNK_SIZE_X`, matching `ctx.heights` in the generator.)

- [ ] **Step 4: Stamp the biome in `src/worldgen/SurfacePainter.ts`**

Inside the column loop, immediately after `const biome = ctx.biomes.biomeAt(worldX, worldZ);` add:

```ts
        chunk.setBiome(x, z, biome);
```

- [ ] **Step 5: Add `biomeAt` to `src/world/VoxelView.ts`**

`CHUNK_SIZE_X`/`CHUNK_SIZE_Z` are already imported. Add (after `getState`):

```ts
  /** Biome ordinal for a column; 0 (Plains) for neighbor/out-of-range columns. */
  biomeAt(x: number, z: number): number {
    const dcx = Math.floor(x / CHUNK_SIZE_X);
    const dcz = Math.floor(z / CHUNK_SIZE_Z);
    if (dcx !== 0 || dcz !== 0) return 0;
    return this.center.getBiome(x, z);
  }
```

- [ ] **Step 6: Run the test + full suite + build**

Run: `npx vitest run tests/chunkBiome.test.ts && npx vitest run && npm run -s build`
Expected: green. (Additive; `biomeData` is never read by save/load — confirm no save test changes.)

- [ ] **Step 7: Commit**

```bash
git add src/world/ChunkData.ts src/worldgen/SurfacePainter.ts src/world/VoxelView.ts tests/chunkBiome.test.ts
git commit -m "feat(world): per-column biome on ChunkData (stamped by SurfacePainter) + VoxelView.biomeAt"
```

---

### Task 4: Greedy mesher tint + `MeshData.tint`

**Files:**
- Modify: `src/mesh/MeshTypes.ts` (`MeshData.tint`)
- Modify: `src/mesh/GreedyMesher.ts` (merge key + per-vertex tint)
- Test: `tests/greedyTint.test.ts` (new)

**Interfaces:**
- Consumes: `registry.tintCategory` (T1), `TINT_PALETTE`/`tintIndexFor`/`RGB`/`WHITE` (T2), `view.biomeAt` (T3).
- Produces: every `MeshData` carries `tint: Float32Array` (3/vertex).

- [ ] **Step 1: Write the failing test** — `tests/greedyTint.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { ChunkData } from '../src/world/ChunkData';
import { VoxelView } from '../src/world/VoxelView';
import { GreedyMesher } from '../src/mesh/GreedyMesher';
import { BlockRegistry } from '../src/blocks/BlockRegistry';
import { opaquePass } from '../src/mesh/MeshPass';
import { GRASS, STONE } from '../src/blocks/blocks';
import { Biome } from '../src/worldgen/BiomeMap';

const reg = new BlockRegistry();
const opaque = opaquePass(reg);
const mesher = new GreedyMesher(reg);
const view = (d: ChunkData) => new VoxelView(d, () => undefined);

function topTints(biome: number, id: number): number[][] {
  const d = new ChunkData(0, 0);
  d.set(2, 1, 2, id);
  d.setBiome(2, 2, biome);
  // bake full skylight so the face emits
  for (let i = 0; i < d.skyLight.length; i++) d.skyLight[i] = 15;
  const m = mesher.mesh(view(d), opaque);
  const out: number[][] = [];
  for (let v = 0; v < m.positions.length / 3; v++) {
    if (m.normals[v * 3 + 1] === 1) out.push([m.tint[v * 3], m.tint[v * 3 + 1], m.tint[v * 3 + 2]]);
  }
  return out;
}

describe('greedy mesher tint', () => {
  it('grass top is white in Plains, non-white in Swamp', () => {
    expect(topTints(Biome.Plains, GRASS).every((t) => t[0] === 1 && t[1] === 1 && t[2] === 1)).toBe(true);
    const swamp = topTints(Biome.Swamp, GRASS);
    expect(swamp.length).toBeGreaterThan(0);
    expect(swamp.some((t) => t[0] !== 1 || t[1] !== 1 || t[2] !== 1)).toBe(true);
  });
  it('a stone top is always white (untinted)', () => {
    expect(topTints(Biome.Swamp, STONE).every((t) => t[0] === 1 && t[1] === 1 && t[2] === 1)).toBe(true);
  });
});

describe('greedy merge with tint', () => {
  it('same-biome grass tops merge (1 quad); different biomes split (2 quads)', () => {
    const same = new ChunkData(0, 0);
    same.set(1, 1, 1, GRASS);
    same.set(2, 1, 1, GRASS);
    for (let i = 0; i < same.skyLight.length; i++) same.skyLight[i] = 15;
    // both columns Swamp → merge
    same.setBiome(1, 1, Biome.Swamp);
    same.setBiome(2, 1, Biome.Swamp);
    const m1 = mesher.mesh(view(same), opaque);
    const topQuadsSame = countTopQuads(m1);

    const diff = new ChunkData(0, 0);
    diff.set(1, 1, 1, GRASS);
    diff.set(2, 1, 1, GRASS);
    for (let i = 0; i < diff.skyLight.length; i++) diff.skyLight[i] = 15;
    diff.setBiome(1, 1, Biome.Swamp);
    diff.setBiome(2, 1, Biome.Desert);
    const m2 = mesher.mesh(view(diff), opaque);
    expect(countTopQuads(m2)).toBe(topQuadsSame + 1); // border split
  });
});

function countTopQuads(m: { positions: Float32Array; normals: Float32Array; indices: Uint32Array }): number {
  // count PosY-facing triangles / 2
  let tris = 0;
  for (let t = 0; t < m.indices.length; t += 3) {
    const v = m.indices[t];
    if (m.normals[v * 3 + 1] === 1) tris++;
  }
  return tris / 2;
}
```

(`opaquePass`/`transparentPass` are factory functions exported from `src/mesh/MeshPass.ts` — the same ones `ChunkManager` uses.)

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/greedyTint.test.ts`
Expected: FAIL — `m.tint` is undefined.

- [ ] **Step 3: Add `tint` to `src/mesh/MeshTypes.ts`**

In `MeshData`, after `light`:

```ts
  /** Per-vertex biome-tint multiplier (r,g,b in 0..1); white = no tint. */
  tint: Float32Array;
```

- [ ] **Step 4: Thread tint through `src/mesh/GreedyMesher.ts`**

Add imports:

```ts
import { TINT_PALETTE, tintIndexFor, WHITE, type RGB } from './Tint';
```

`Buffers`: add `tint: number[];`. In `mesh()` init add `tint: [],`. In the returned object add `tint: new Float32Array(buf.tint),`.

`MaskCell`: add `tint: RGB;`.

In `meshDirection`, after `const layer = this.registry.faceLayer(id, faceFor(axis, sign));` compute the tint:

```ts
          const category = this.registry.tintCategory(id, faceFor(axis, sign));
          const tintIndex = category ? tintIndexFor(view.biomeAt(this._solid[0], this._solid[2]), category) : 0;
          const tint = TINT_PALETTE[tintIndex] ?? WHITE;
```

Extend the merge key with `tintIndex` in the high bits (untinted → 0 → key unchanged):

```ts
          const key =
            (tintIndex << 24) |
            (layer << 16) |
            (packAoLevels(aoLevels[0], aoLevels[1], aoLevels[2], aoLevels[3]) << 8) |
            light;
          mask[a + b * du] = { layer, ao, light, key, tint };
```

In `emitQuad`'s vertex loop, after `buf.light.push(cell.light);` add:

```ts
      buf.tint.push(cell.tint[0], cell.tint[1], cell.tint[2]);
```

- [ ] **Step 5: Run the test + the mesh regressions + full suite + build**

Run: `npx vitest run tests/greedyTint.test.ts && npx vitest run && npm run -s build`
Expected: green. The merge-key extension keeps untinted faces' key numerically identical (`tintIndex 0`), so existing greedy tests (cube geometry, AO, light) are unchanged. If any test builds a `MeshData` literal by hand, add `tint: new Float32Array(...)` to it.

- [ ] **Step 6: Commit**

```bash
git add src/mesh/MeshTypes.ts src/mesh/GreedyMesher.ts tests/greedyTint.test.ts
git commit -m "feat(mesh): per-vertex biome tint in the greedy mesher (merge key + MeshData.tint)"
```

---

### Task 5: `emitShaped` tint + `mergeMeshData`

**Files:**
- Modify: `src/mesh/emitShaped.ts` (`Buf`/`pushBoxFace`/`emitCross`/`mergeMeshData`)
- Test: `tests/emitShapedTint.test.ts` (new)

**Interfaces:**
- Consumes: `WHITE`/`TINT_PALETTE`/`tintIndexFor` (T2), `registry.tintCategory` (T1), `view.biomeAt` (T3), `MeshData.tint` (T4).
- Produces: every `emitShaped`/`mergeMeshData` `MeshData` carries `tint`.

- [ ] **Step 1: Write the failing test** — `tests/emitShapedTint.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { ChunkData } from '../src/world/ChunkData';
import { VoxelView } from '../src/world/VoxelView';
import { BlockRegistry } from '../src/blocks/BlockRegistry';
import { emitShaped, mergeMeshData } from '../src/mesh/emitShaped';
import { TALL_GRASS, STONE_SLAB } from '../src/blocks/blocks';
import { Biome } from '../src/worldgen/BiomeMap';

const reg = new BlockRegistry();
const view = (d: ChunkData) => new VoxelView(d, () => undefined);

describe('emitShaped tint', () => {
  it('tint length matches vertex count for both meshes', () => {
    const d = new ChunkData(0, 0);
    d.set(4, 1, 4, STONE_SLAB);
    d.set(5, 1, 5, TALL_GRASS);
    const { slabs, cross } = emitShaped(view(d), reg);
    expect(slabs.tint.length).toBe(slabs.positions.length);
    expect(cross.tint.length).toBe(cross.positions.length);
  });
  it('a slab box is white; a tall-grass cross tints by biome', () => {
    const d = new ChunkData(0, 0);
    d.set(4, 1, 4, STONE_SLAB);
    d.set(5, 1, 5, TALL_GRASS);
    d.setBiome(5, 5, Biome.Swamp);
    const { slabs, cross } = emitShaped(view(d), reg);
    expect([...slabs.tint].every((v) => v === 1)).toBe(true);
    expect([...cross.tint].some((v) => v !== 1)).toBe(true);
  });
  it('mergeMeshData preserves tint length', () => {
    const d = new ChunkData(0, 0);
    d.set(4, 1, 4, STONE_SLAB);
    const { slabs, cross } = emitShaped(view(d), reg);
    const merged = mergeMeshData(slabs, cross);
    expect(merged.tint.length).toBe(merged.positions.length);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/emitShapedTint.test.ts`
Expected: FAIL — `slabs.tint` undefined.

- [ ] **Step 3: Thread tint through `src/mesh/emitShaped.ts`**

Add imports:

```ts
import { WHITE, TINT_PALETTE, tintIndexFor, type RGB } from './Tint';
```

`Buf`: add `tint: number[];`. `emptyBuf()`: add `tint: [],`. `toMesh`: add `tint: new Float32Array(b.tint),`.

`pushBoxFace` — add a `tint: RGB` parameter (last param) and push it per vertex. Change its signature and the vertex loop:

```ts
function pushBoxFace(
  buf: Buf,
  axis: number,
  sign: number,
  lo: [number, number, number],
  hi: [number, number, number],
  layer: number,
  light: number,
  tint: RGB,
): void {
```

In the `for (let k = 0; k < 4; k++)` loop, after `buf.light.push(light);` add `buf.tint.push(tint[0], tint[1], tint[2]);`.

`emitBoxCulled` — boxes are never tinted; pass white. Change its `pushBoxFace(...)` call to append `WHITE`:

```ts
    pushBoxFace(buf, axis, sign, lo, hi, registry.faceLayer(id, face), packLight(view, nx, ny, nz), WHITE);
```

`emitCross` — tint the billboard by foliage biome. After `const light = packLight(view, x, y, z);` add:

```ts
  const category = registry.tintCategory(id, Face.PosY);
  const tint = category ? (TINT_PALETTE[tintIndexFor(view.biomeAt(x, z), category)] ?? WHITE) : WHITE;
```

In `emitCross`'s vertex loop, after `buf.light.push(light);` add `buf.tint.push(tint[0], tint[1], tint[2]);`.

`mergeMeshData` — add to the returned object: `tint: concatF32(a.tint, b.tint),`.

- [ ] **Step 4: Run the test + the shaped regressions + full suite + build**

Run: `npx vitest run tests/emitShapedTint.test.ts tests/emitShaped.test.ts tests/emitStair.test.ts tests/emitConnected.test.ts tests/emitGate.test.ts && npx vitest run && npm run -s build`
Expected: green. Box-based shapes are white (geometry unchanged); only the new `tint` field is added. If a shaped test compares a full `MeshData`, add the `tint` field.

- [ ] **Step 5: Commit**

```bash
git add src/mesh/emitShaped.ts tests/emitShapedTint.test.ts
git commit -m "feat(mesh): tint in emitShaped (white boxes, biome-tinted crosses) + mergeMeshData"
```

---

### Task 6: Shader + `buildChunkMesh` + verification/docs

**Files:**
- Modify: `src/render/buildChunkMesh.ts` (`tint` attribute)
- Modify: `src/render/ChunkMaterial.ts` (vertex/fragment shader)
- Modify: `docs/specs/2026-06-30-biome-tint-track-e5-design.md` (status)
- Test: `tests/buildChunkMesh.test.ts` (new or extend)

**Interfaces:**
- Consumes: `MeshData.tint` (T4/T5).

- [ ] **Step 1: Write the failing test** — `tests/buildChunkMesh.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { buildChunkMesh } from '../src/render/buildChunkMesh';
import { MeshBasicMaterial } from 'three';
import type { MeshData } from '../src/mesh/MeshTypes';

function quad(): MeshData {
  return {
    positions: new Float32Array([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0]),
    normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]),
    uvs: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]),
    layers: new Float32Array([0, 0, 0, 0]),
    ao: new Float32Array([1, 1, 1, 1]),
    light: new Float32Array([255, 255, 255, 255]),
    tint: new Float32Array([1, 1, 1, 0.6, 0.7, 0.4, 1, 1, 1, 1, 1, 1]),
    indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
  };
}

describe('buildChunkMesh tint attribute', () => {
  it('sets a tint attribute with itemSize 3 and one rgb per vertex', () => {
    const mesh = buildChunkMesh(quad(), new MeshBasicMaterial());
    const attr = mesh.geometry.getAttribute('tint');
    expect(attr).toBeDefined();
    expect(attr.itemSize).toBe(3);
    expect(attr.count).toBe(4);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/buildChunkMesh.test.ts`
Expected: FAIL — no `tint` attribute.

- [ ] **Step 3: Add the attribute in `src/render/buildChunkMesh.ts`**

After the `light` attribute line:

```ts
  geometry.setAttribute('tint', new BufferAttribute(mesh.tint, 3));
```

- [ ] **Step 4: Multiply tint in the shader (`src/render/ChunkMaterial.ts`)**

Vertex shader — add the input + varying:
- after `in float light;` add `in vec3 tint;`
- after `out float vLight;` add `out vec3 vTint;`
- in `main()` after `vLight = light;` add `vTint = tint;`

Fragment shader:
- after `in float vLight;` add `in vec3 vTint;`
- change `vec3 base = texel.rgb;` to `vec3 base = texel.rgb * vTint;`

- [ ] **Step 5: Run the test + lint + build + full suite**

Run: `npx vitest run tests/buildChunkMesh.test.ts && npx prettier --check "src/**/*.ts" "tests/**/*.ts" && npx eslint src tests && npm run -s build && npx vitest run`
Expected: all green/clean (`npx prettier --write` anything flagged, re-check, commit).

- [ ] **Step 6: Live smoke (dev server + preview tools)** — verify no regression + tint plumbing reaches the GPU (use a throwaway `?save=<name>&world=<preset>`; do not touch real saves):
- Boot a biome world (`?world=default`): no console errors; grass chunks mesh and render.
- `preview_eval`: confirm a built chunk geometry exposes a `tint` attribute (or, if the meshes aren't reachable via `__vr`, confirm via `__vr` that grass blocks place/read-back and the scene has no errors).
- Boot `?world=flat`: unchanged (Plains/white), no errors.
Capture a screenshot of a biome world as proof. (Per-vertex tint VALUES are covered by the T4/T5 unit tests — the GPU pixel output isn't assertable headless; note this in the report.)

- [ ] **Step 7: Update the spec status + commit**

In `docs/specs/2026-06-30-biome-tint-track-e5-design.md` set `Status:` to `Implemented (PR pending)`.

```bash
git add src/render/buildChunkMesh.ts src/render/ChunkMaterial.ts tests/buildChunkMesh.test.ts docs/specs/2026-06-30-biome-tint-track-e5-design.md
git commit -m "feat(render): per-vertex tint attribute + shader base*=vTint; mark E5 implemented"
```

- [ ] **Step 8: Hand off to finishing-a-development-branch**

Post-merge memory update (per-vertex tint, per-biome palette, ChunkData biome) happens then.

---

## Self-Review

**Spec coverage** (6 components): 1 palette → T2; 2 tint flags + registry → T1; 3 ChunkData biome + SurfacePainter + VoxelView → T3; 4 core mesher + MeshData.tint → T4; 5 emitShaped/cutout + mergeMeshData → T5; 6 buildChunkMesh + shader → T6. ✅ Non-goals (no manual tint, no gradient, no save change, no texture/grayscale change) respected.

**Type consistency:** `TintCategory` (T1) consumed by `Tint.ts` (T2), `tintCategory` (T1), the meshers (T4/T5); `RGB`/`WHITE`/`TINT_PALETTE`/`tintIndexFor` (T2) consumed by T4/T5; `view.biomeAt` (T3) consumed by T4/T5; `MeshData.tint` (T4) consumed by T5 (mergeMeshData) + T6 (buildChunkMesh). Layering: `Tint.ts` in `src/mesh` imports only `TintCategory` from `blocks` — no `mesh → render` edge. Consistent.

**No-save-change:** `biomeData` is constructed in `ChunkData` and written only by `SurfacePainter`; no serializer reads it. `parseWorldSnapshot`/`writeChunk`/`/__world` untouched. Plains + untinted = white → existing worlds pixel-identical and untinted greedy merges byte-identical (key folds in `tintIndex 0`).

**Placeholder scan:** every code step has full code; every test step has assertions. The two adaptive notes (T4 Step 1 "adapt to the project's `MeshPass` factory"; "if a test builds a MeshData literal, add `tint`") are precise fallbacks, not vague placeholders — the implementer checks `MeshPass.ts` and adds the one new field. The palette numbers are pinned exactly in T2.
