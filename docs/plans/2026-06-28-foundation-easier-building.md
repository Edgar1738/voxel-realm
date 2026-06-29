# Foundation + Easier Building Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make adding a block a single declarative table row, unify the dev-studio `Blueprint` and worldgen `Structure` into one `Prefab` type with pure transforms, and make `__vr` builds reliable (one structure = one undo, auto-preloaded) and expressive (`replace`/`move`/`mirror`/`rotate`/`array`).

**Architecture:** A new `src/core/Prefab.ts` holds the shared geometry type plus pure transforms. The block table in `src/blocks/blocks.ts` becomes declarative — each block owns a `TextureSpec`; a build step dedups specs into texture layers and resolves per-face layer indices, so `TextureArray.ts` renders from data and `BlockRegistry`/`CreativeInventory` derive everything. `EditService` gains a group/transaction API; `ChunkManager` gains `preloadBox` and honest edit counts; `DevControls` auto-preloads, groups builds, and exposes region ops built on the pure transforms.

**Tech Stack:** TypeScript (strict), three.js r0.185, Vite 8, Vitest 4. No new dependencies.

## Global Constraints

- **Block ids are append-only.** Never reorder, reuse, or renumber the id constants in `src/blocks/blocks.ts` — saves persist ids. (Texture *layer* indices are internal/derived and may change.)
- **Save format unchanged.** Do not touch `SAVE_VERSION`, `WorldSnapshot`, or any persistence schema in this plan.
- **Mesher/renderer contract unchanged.** `BlockRegistry.faceLayer(id, face): number` keeps its exact signature and meaning; the `DataArrayTexture` stays `TILE=16`, RGBA, NearestFilter.
- **Dev studio is dev-only.** `DevControls.ts` is imported under `import.meta.env.DEV`; nothing here may leak into production bundles.
- **TDD, DRY, YAGNI.** Write the failing test first; one logical change per commit. Run `npm test` (vitest) for tests, `npm run lint`, `npm run build` (tsc --noEmit && vite build) before the final commit.
- **Conventional commits**, ending with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- **Commands** run from repo root in bash; `npx vitest run <file>` runs a single test file.

---

## Component 1 — Unified `Prefab` type + pure transforms

### Task 1: Create `src/core/Prefab.ts` with the type and pure transforms

**Files:**
- Create: `src/core/Prefab.ts`
- Test: `tests/prefab.test.ts`

**Interfaces:**
- Consumes: `BlockId` from `src/core/types`.
- Produces:
  - `type PrefabVoxel = [number, number, number, BlockId]`
  - `interface Prefab { dims: [number, number, number]; blocks: PrefabVoxel[] }`
  - `normalize(p: Prefab): Prefab` — re-anchors so the min corner is `[0,0,0]` and `dims` is tight.
  - `rotateY(p: Prefab, quarterTurns: number): Prefab`
  - `mirror(p: Prefab, axis: 'x' | 'z'): Prefab`
  - `repeat(p: Prefab, nx: number, ny: number, nz: number, stride: [number, number, number]): Prefab`

- [ ] **Step 1: Write the failing test**

```ts
// tests/prefab.test.ts
import { describe, it, expect } from 'vitest';
import { normalize, rotateY, mirror, repeat, type Prefab } from '../src/core/Prefab';

const L: Prefab = {
  // An L-shape footprint (y=0): (0,0),(1,0),(0,1). dims 2x1x2.
  dims: [2, 1, 2],
  blocks: [
    [0, 0, 0, 1],
    [1, 0, 0, 2],
    [0, 0, 1, 3],
  ],
};

describe('normalize', () => {
  it('re-anchors min corner to origin and tightens dims', () => {
    const shifted: Prefab = { dims: [2, 1, 2], blocks: [[5, 2, 5, 1], [6, 2, 5, 2]] };
    const n = normalize(shifted);
    expect(n.blocks).toEqual([[0, 0, 0, 1], [1, 0, 0, 2]]);
    expect(n.dims).toEqual([2, 1, 1]);
  });
});

describe('rotateY', () => {
  it('rotated four times returns the original (normalized)', () => {
    let r = L;
    for (let i = 0; i < 4; i++) r = rotateY(r, 1);
    expect(normalize(r)).toEqual(normalize(L));
  });

  it('90deg maps (x,z) -> (z, maxX - x) and swaps x/z dims', () => {
    const r = rotateY(L, 1);
    expect(r.dims).toEqual([2, 1, 2]);
    // block (1,0,0,2) -> after rotate its new coords are normalized; assert the id set is preserved
    expect(r.blocks.map((b) => b[3]).sort()).toEqual([1, 2, 3]);
    // every block lands inside the new dims
    for (const [x, y, z] of r.blocks) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(z).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(r.dims[0]);
      expect(z).toBeLessThan(r.dims[2]);
    }
  });
});

describe('mirror', () => {
  it('mirror twice on x is identity', () => {
    expect(normalize(mirror(mirror(L, 'x'), 'x'))).toEqual(normalize(L));
  });
});

describe('repeat', () => {
  it('tiles 2x1x1 with stride and multiplies block count', () => {
    const r = repeat(L, 2, 1, 1, [2, 0, 0]);
    expect(r.blocks.length).toBe(L.blocks.length * 2);
    expect(r.dims).toEqual([4, 1, 2]); // two copies offset by stride 2 in x
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/prefab.test.ts`
Expected: FAIL — cannot find module `../src/core/Prefab`.

- [ ] **Step 3: Write the implementation**

```ts
// src/core/Prefab.ts
import type { BlockId } from './types';

/** A non-air voxel offset from the prefab's min corner: [dx, dy, dz, id]. */
export type PrefabVoxel = [number, number, number, BlockId];

/** Portable, position-independent block group. Identical shape to a dev Blueprint. */
export interface Prefab {
  dims: [number, number, number];
  blocks: PrefabVoxel[];
}

/** Re-anchor so the min corner is the origin and dims tightly bound the blocks. */
export function normalize(p: Prefab): Prefab {
  if (p.blocks.length === 0) return { dims: [0, 0, 0], blocks: [] };
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (const [x, y, z] of p.blocks) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (z < minZ) minZ = z;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
    if (z > maxZ) maxZ = z;
  }
  const blocks: PrefabVoxel[] = p.blocks.map(([x, y, z, id]) => [x - minX, y - minY, z - minZ, id]);
  return { dims: [maxX - minX + 1, maxY - minY + 1, maxZ - minZ + 1], blocks };
}

/** Rotate about the Y axis in 90-degree steps (positive = clockwise viewed from +Y). */
export function rotateY(p: Prefab, quarterTurns: number): Prefab {
  const turns = ((quarterTurns % 4) + 4) % 4;
  if (turns === 0) return normalize(p);
  const [sx, , sz] = p.dims;
  let blocks: PrefabVoxel[] = p.blocks;
  let dimX = sx, dimZ = sz;
  for (let t = 0; t < turns; t++) {
    const maxX = dimX - 1;
    blocks = blocks.map(([x, y, z, id]) => [z, y, maxX - x, id]);
    [dimX, dimZ] = [dimZ, dimX];
  }
  return normalize({ dims: [dimX, p.dims[1], dimZ], blocks });
}

/** Reflect across the given horizontal axis. */
export function mirror(p: Prefab, axis: 'x' | 'z'): Prefab {
  const [sx, , sz] = p.dims;
  const blocks: PrefabVoxel[] = p.blocks.map(([x, y, z, id]) =>
    axis === 'x' ? [sx - 1 - x, y, z, id] : [x, y, sz - 1 - z, id],
  );
  return normalize({ dims: p.dims, blocks });
}

/** Tile the prefab into an nx*ny*nz grid, each copy offset by `stride`. */
export function repeat(
  p: Prefab,
  nx: number,
  ny: number,
  nz: number,
  stride: [number, number, number],
): Prefab {
  const blocks: PrefabVoxel[] = [];
  for (let iz = 0; iz < nz; iz++)
    for (let iy = 0; iy < ny; iy++)
      for (let ix = 0; ix < nx; ix++)
        for (const [x, y, z, id] of p.blocks)
          blocks.push([
            x + ix * stride[0],
            y + iy * stride[1],
            z + iz * stride[2],
            id,
          ]);
  return normalize({ dims: p.dims, blocks });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/prefab.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add src/core/Prefab.ts tests/prefab.test.ts
git commit -m "feat(core): add Prefab type with pure rotate/mirror/repeat/normalize transforms"
```

---

### Task 2: Unify `Blueprint`/`Structure` onto `Prefab` and fix the scatter determinism bug

**Files:**
- Modify: `src/worldgen/Structures.ts` (alias `Structure`, fix `Math.imul` at line ~62)
- Modify: `src/app/DevControls.ts` (alias `Blueprint` at line ~54)
- Modify: `src/worldgen/prefabs.ts` (return `Prefab`)
- Test: `tests/structures.test.ts` (add a determinism-at-large-coords case)

**Interfaces:**
- Consumes: `Prefab` from `src/core/Prefab` (Task 1).
- Produces: `Structure` and `Blueprint` are now type aliases of `Prefab` (no behavior change at call sites).

- [ ] **Step 1: Write the failing test**

Append to `tests/structures.test.ts`:

```ts
import { placementsAt, type Structure } from '../src/worldgen/Structures';

it('placementsAt is deterministic at large cell coordinates (Math.imul, no float overflow)', () => {
  const structures: Structure[] = [{ dims: [1, 1, 1], blocks: [[0, 0, 0, 1]] }];
  const opts = { cellSize: 32, surfaceAt: () => 10, density: 1 };
  const seed = 1234;
  // A cell far from origin where plain * would overflow past 2^53.
  const a = placementsAt(structures, opts, seed, 900000, 900000);
  const b = placementsAt(structures, opts, seed, 900000, 900000);
  expect(a).toEqual(b);
  expect(a.length).toBe(1);
  // Differs from a neighbouring cell (hash actually mixes, not collapsed to a constant).
  const c = placementsAt(structures, opts, seed, 900001, 900000);
  expect(a[0].ox === c[0].ox && a[0].oz === c[0].oz).toBe(false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/structures.test.ts`
Expected: FAIL — the two far-coordinate calls may match each other but the neighbour-cell assertion or reproducibility is unstable because `cellX * 73856093` loses low bits past 2^53. (If it happens to pass by luck, the fix below still makes it correct and the test guards regressions.)

- [ ] **Step 3: Apply the fixes**

In `src/worldgen/Structures.ts`, replace the hash line (~62):

```ts
// before:
//   const rng = mulberry32(
//     ((cellX * 73856093) ^ (cellZ * 19349663) ^ (seed * 83492791) ^ (salt * 2654435761)) >>> 0,
//   );
const rng = mulberry32(
  (Math.imul(cellX, 73856093) ^
    Math.imul(cellZ, 19349663) ^
    Math.imul(seed, 83492791) ^
    Math.imul(salt, 2654435761)) >>>
    0,
);
```

Change the `Structure` declaration in `src/worldgen/Structures.ts` to alias `Prefab`:

```ts
import type { Prefab } from '../core/Prefab';
// Replace the `export interface Structure { ... }` block with:
export type Structure = Prefab;
```

In `src/app/DevControls.ts`, replace the local `Blueprint` interface (~54) with:

```ts
import type { Prefab } from '../core/Prefab';
export type Blueprint = Prefab;
```

In `src/worldgen/prefabs.ts`, the functions already return `{ dims, blocks }`; change their return annotations from `Structure` to `Prefab` (import `Prefab` from `../core/Prefab`) — or leave as `Structure` since it now aliases `Prefab`. Prefer importing `Prefab` directly for clarity.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/structures.test.ts tests/prefabs.test.ts && npm run -s lint`
Expected: PASS; lint clean; `tsc` (via lint/build later) sees `Structure`/`Blueprint` as `Prefab`.

- [ ] **Step 5: Commit**

```bash
git add src/worldgen/Structures.ts src/app/DevControls.ts src/worldgen/prefabs.ts tests/structures.test.ts
git commit -m "refactor(core): alias Structure/Blueprint to Prefab; fix Math.imul determinism in placementsAt"
```

---

## Component 2 — Data-driven block registry

### Task 3: Extract texture pattern engine into `src/blocks/textures.ts`

**Files:**
- Create: `src/blocks/textures.ts`
- Test: `tests/textures.test.ts`

**Interfaces:**
- Produces:
  - `type RGB = readonly [number, number, number]`
  - `type Pixel = (px: number, py: number, rng: () => number) => RGB`
  - `type PatternName` (the 14 existing builders)
  - `type TextureSpec = { pattern: PatternName; colors: RGB[]; amp?: number } | { custom: Pixel }`
  - `type FaceTextures = TextureSpec | { top: TextureSpec; side: TextureSpec; bottom: TextureSpec } | [TextureSpec, TextureSpec, TextureSpec, TextureSpec, TextureSpec, TextureSpec]`
  - `const TILE = 16`
  - `expandFaces(faces: FaceTextures): [TextureSpec, TextureSpec, TextureSpec, TextureSpec, TextureSpec, TextureSpec]` — Face order PosX,NegX,PosY(top),NegY(bottom),PosZ,NegZ
  - `specKey(spec: TextureSpec): string`
  - `resolvePixel(spec: TextureSpec): Pixel`
  - `paintLayer(out: Uint8Array, layer: number, spec: TextureSpec): void`

- [ ] **Step 1: Write the failing test**

```ts
// tests/textures.test.ts
import { describe, it, expect } from 'vitest';
import {
  TILE,
  expandFaces,
  specKey,
  resolvePixel,
  paintLayer,
  type TextureSpec,
} from '../src/blocks/textures';

const dirt: TextureSpec = { pattern: 'speckle', colors: [[134, 96, 62]], amp: 20 };
const grassTop: TextureSpec = { pattern: 'grassTop', colors: [[86, 152, 60]] };

describe('expandFaces', () => {
  it('expands a single spec to 6 identical faces', () => {
    const f = expandFaces(dirt);
    expect(f).toHaveLength(6);
    expect(f.every((s) => s === dirt)).toBe(true);
  });
  it('expands {top,side,bottom} to the right face order', () => {
    const side: TextureSpec = { pattern: 'bark', colors: [[105, 78, 46]] };
    const bottom: TextureSpec = dirt;
    // Face order: PosX, NegX, PosY(top), NegY(bottom), PosZ, NegZ
    const f = expandFaces({ top: grassTop, side, bottom });
    expect(f[2]).toBe(grassTop);
    expect(f[3]).toBe(bottom);
    expect(f[0]).toBe(side);
    expect(f[4]).toBe(side);
  });
});

describe('specKey', () => {
  it('is equal for structurally equal pattern specs and differs by color', () => {
    expect(specKey(dirt)).toBe(specKey({ pattern: 'speckle', colors: [[134, 96, 62]], amp: 20 }));
    expect(specKey(dirt)).not.toBe(specKey({ pattern: 'speckle', colors: [[100, 96, 62]], amp: 20 }));
  });
  it('gives every custom spec a unique key', () => {
    const c1: TextureSpec = { custom: () => [0, 0, 0] };
    const c2: TextureSpec = { custom: () => [0, 0, 0] };
    expect(specKey(c1)).not.toBe(specKey(c2));
  });
});

describe('paintLayer', () => {
  it('fills a TILE*TILE*4 RGBA block with opaque pixels', () => {
    const out = new Uint8Array(TILE * TILE * 4 * 2);
    paintLayer(out, 1, grassTop);
    const base = 1 * TILE * TILE * 4;
    // alpha is 255 everywhere in the painted layer
    for (let i = 0; i < TILE * TILE; i++) expect(out[base + i * 4 + 3]).toBe(255);
    // green channel dominates for grass top somewhere
    let greenish = false;
    for (let i = 0; i < TILE * TILE; i++) {
      const g = out[base + i * 4 + 1];
      const r = out[base + i * 4];
      if (g > r) greenish = true;
    }
    expect(greenish).toBe(true);
    // layer 0 untouched
    expect(out[0]).toBe(0);
  });
  it('resolvePixel returns the custom fn directly', () => {
    const px = resolvePixel({ custom: () => [1, 2, 3] });
    expect(px(0, 0, () => 0.5)).toEqual([1, 2, 3]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/textures.test.ts`
Expected: FAIL — module `../src/blocks/textures` not found.

- [ ] **Step 3: Write the implementation**

Move the pattern builders and `paint` out of `src/render/TextureArray.ts` into the new module, generalize them to the `(colors, amp?) => Pixel` shape, and add the spec machinery:

```ts
// src/blocks/textures.ts
import { mulberry32 } from '../core/math';

export const TILE = 16; // px per tile

export type RGB = readonly [number, number, number];
export type Pixel = (px: number, py: number, rng: () => number) => RGB;

export type PatternName =
  | 'speckle' | 'brick' | 'cobble' | 'planks' | 'rings' | 'bark'
  | 'ridges' | 'grassTop' | 'grassSide' | 'stone' | 'leaves'
  | 'glass' | 'lantern' | 'ore';

export type TextureSpec =
  | { pattern: PatternName; colors: RGB[]; amp?: number }
  | { custom: Pixel };

export type FaceTextures =
  | TextureSpec
  | { top: TextureSpec; side: TextureSpec; bottom: TextureSpec }
  | [TextureSpec, TextureSpec, TextureSpec, TextureSpec, TextureSpec, TextureSpec];

function clamp(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}
function shade(c: RGB, d: number): RGB {
  return [c[0] + d, c[1] + d, c[2] + d];
}

// ---- pattern builders (moved verbatim from TextureArray.ts, wrapped to (colors, amp?)) ----
const speckle = (base: RGB, amp: number): Pixel => (_px, _py, rng) =>
  shade(base, (rng() - 0.5) * 2 * amp);
const brick = (base: RGB, mortar: RGB): Pixel => (px, py, rng) => {
  const courseH = 4, brickW = 8;
  const ox = (Math.floor(py / courseH) % 2) * (brickW / 2);
  const onMortar = py % courseH === 0 || (px + ox) % brickW === 0;
  return onMortar ? shade(mortar, (rng() - 0.5) * 6) : shade(base, (rng() - 0.5) * 16);
};
const planks = (base: RGB): Pixel => (px, py, rng) => {
  if (py % 5 === 0) return shade(base, -38);
  const grain = px % 2 === 0 ? 4 : -4;
  return shade(base, grain + (rng() - 0.5) * 9);
};
const cobble = (base: RGB, mortar: RGB): Pixel => (px, py, rng) => {
  const cell = 8, lx = px % cell, ly = py % cell;
  if (lx === 0 || ly === 0 || lx === cell - 1 || ly === cell - 1) return shade(mortar, (rng() - 0.5) * 8);
  const r = Math.hypot(lx - (cell - 1) / 2, ly - (cell - 1) / 2) / (cell / 2);
  return shade(base, (1 - r) * 14 + (rng() - 0.5) * 22);
};
const rings = (base: RGB): Pixel => (px, py, rng) =>
  shade(base, Math.sin(Math.hypot(px - 7.5, py - 7.5) * 1.7) * 10 + (rng() - 0.5) * 8);
const bark = (base: RGB): Pixel => (px, _py, rng) => {
  const groove = px % 4 === 0 ? -14 : px % 4 === 2 ? 6 : 0;
  return shade(base, groove + (rng() - 0.5) * 10);
};
const ridges = (base: RGB): Pixel => (px, _py, rng) => {
  const ridge = px === 0 || px === TILE - 1 ? -16 : px % 5 === 0 ? 8 : 0;
  return shade(base, ridge + (rng() - 0.5) * 10);
};
const grassTopP = (base: RGB): Pixel => (_px, _py, rng) => {
  const r = rng();
  const blade = r < 0.14 ? 22 : r > 0.9 ? -16 : 0;
  return shade(base, blade + (rng() - 0.5) * 14);
};
const grassSideP = (dirt: RGB, green: RGB): Pixel => (_px, py, rng) => {
  const lip = py < 3 || (py === 3 && rng() < 0.5);
  return lip ? shade(green, (rng() - 0.5) * 16) : shade(dirt, (rng() - 0.5) * 18);
};
const stoneFace = (base: RGB): Pixel => (_px, _py, rng) =>
  rng() < 0.05 ? shade(base, -36) : shade(base, (rng() - 0.5) * 20);
const leavesP = (base: RGB): Pixel => (_px, _py, rng) => {
  const r = rng();
  return r < 0.1 ? shade(base, -34) : r > 0.88 ? shade(base, 26) : shade(base, (rng() - 0.5) * 22);
};
const glassP = (base: RGB): Pixel => (px, py, rng) => {
  const border = px === 0 || py === 0 || px === TILE - 1 || py === TILE - 1;
  return border ? shade(base, 24) : shade(base, (rng() - 0.5) * 6);
};
const lanternP = (frame: RGB, glow: RGB): Pixel => (px, py, rng) => {
  const onFrame = px <= 1 || py <= 1 || px >= TILE - 2 || py >= TILE - 2 || px === 7 || px === 8;
  return onFrame ? shade(frame, (rng() - 0.5) * 8) : shade(glow, (rng() - 0.5) * 18);
};
const oreP = (spot: RGB): Pixel => (_px, _py, rng) =>
  rng() < 0.18 ? shade(spot, (rng() - 0.5) * 26) : shade([128, 128, 132], (rng() - 0.5) * 18);

/** Map a pattern name + its color list to a Pixel. colors[0] is the base; others as documented. */
function buildPattern(name: PatternName, colors: RGB[], amp?: number): Pixel {
  const c0 = colors[0] ?? [128, 128, 128];
  const c1 = colors[1] ?? c0;
  switch (name) {
    case 'speckle': return speckle(c0, amp ?? 16);
    case 'brick': return brick(c0, c1);
    case 'cobble': return cobble(c0, c1);
    case 'planks': return planks(c0);
    case 'rings': return rings(c0);
    case 'bark': return bark(c0);
    case 'ridges': return ridges(c0);
    case 'grassTop': return grassTopP(c0);
    case 'grassSide': return grassSideP(c0, c1);
    case 'stone': return stoneFace(c0);
    case 'leaves': return leavesP(c0);
    case 'glass': return glassP(c0);
    case 'lantern': return lanternP(c0, c1);
    case 'ore': return oreP(c0);
  }
}

let customCounter = 0;
const customKeys = new WeakMap<Pixel, string>();

export function resolvePixel(spec: TextureSpec): Pixel {
  return 'custom' in spec ? spec.custom : buildPattern(spec.pattern, spec.colors, spec.amp);
}

/** Stable key for deduping specs into texture layers. Customs are always unique. */
export function specKey(spec: TextureSpec): string {
  if ('custom' in spec) {
    let k = customKeys.get(spec.custom);
    if (!k) {
      k = `custom#${customCounter++}`;
      customKeys.set(spec.custom, k);
    }
    return k;
  }
  return `${spec.pattern}|${spec.colors.map((c) => c.join(',')).join(';')}|${spec.amp ?? ''}`;
}

/** A stable, key-derived seed so a spec's pixels do not depend on its layer index. */
function specSeed(spec: TextureSpec): number {
  const key = specKey(spec);
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

/** Expand any FaceTextures shorthand into 6 specs in Face order (PosX,NegX,PosY,NegY,PosZ,NegZ). */
export function expandFaces(
  faces: FaceTextures,
): [TextureSpec, TextureSpec, TextureSpec, TextureSpec, TextureSpec, TextureSpec] {
  if (Array.isArray(faces)) return faces;
  if ('top' in faces) {
    const { top, side, bottom } = faces;
    return [side, side, top, bottom, side, side];
  }
  return [faces, faces, faces, faces, faces, faces];
}

/** Paint one TILE*TILE RGBA layer from a spec (seeded by the spec's stable key). */
export function paintLayer(out: Uint8Array, layer: number, spec: TextureSpec): void {
  const fn = resolvePixel(spec);
  const rng = mulberry32(specSeed(spec));
  const offset = layer * TILE * TILE * 4;
  for (let py = 0; py < TILE; py++) {
    for (let px = 0; px < TILE; px++) {
      const c = fn(px, py, rng);
      const p = offset + (py * TILE + px) * 4;
      out[p] = clamp(c[0]);
      out[p + 1] = clamp(c[1]);
      out[p + 2] = clamp(c[2]);
      out[p + 3] = 255;
    }
  }
}
```

> Note: seeding by spec key (not layer index) intentionally decouples a texture's appearance from where it lands in the array. This is a reviewed cosmetic change — same patterns and palettes, equivalent procedural noise — and makes layer dedup/reordering safe.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/textures.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/blocks/textures.ts tests/textures.test.ts
git commit -m "feat(blocks): add declarative TextureSpec engine (patterns, expandFaces, paintLayer)"
```

---

### Task 4: Convert `blocks.ts` to the declarative table + derived layers

**Files:**
- Modify: `src/blocks/blocks.ts`
- Test: `tests/blocks.test.ts`

**Interfaces:**
- Consumes: `TextureSpec`, `FaceTextures`, `expandFaces`, `specKey` from `src/blocks/textures` (Task 3).
- Produces:
  - `interface BlockDef { id: BlockId; name: string; opaque: boolean; transparent: boolean; light?: number; creative?: boolean; faces?: FaceTextures }`
  - `const BLOCK_DEFS: BlockDef[]`
  - `interface BlockTextures { uniqueSpecs: TextureSpec[]; faceLayers: Map<BlockId, number[]>; layerCount: number }`
  - `function buildBlockTextures(defs: BlockDef[]): BlockTextures`
  - `const BLOCK_TEXTURES: BlockTextures`
  - `const TEXTURE_LAYER_COUNT: number` (= `BLOCK_TEXTURES.layerCount`)
  - Keep all existing id consts and `enum Face` unchanged.

- [ ] **Step 1: Write the failing test**

Append to `tests/blocks.test.ts`:

```ts
import {
  BLOCK_DEFS,
  BLOCK_TEXTURES,
  TEXTURE_LAYER_COUNT,
  buildBlockTextures,
  GRASS,
  DIRT,
  Face,
  type BlockDef,
} from '../src/blocks/blocks';

describe('buildBlockTextures', () => {
  it('resolves every non-air block to 6 in-range face layers', () => {
    for (const def of BLOCK_DEFS) {
      if (!def.faces) continue;
      const layers = BLOCK_TEXTURES.faceLayers.get(def.id);
      expect(layers, `block ${def.name}`).toBeDefined();
      expect(layers).toHaveLength(6);
      for (const l of layers!) {
        expect(l).toBeGreaterThanOrEqual(0);
        expect(l).toBeLessThan(TEXTURE_LAYER_COUNT);
      }
    }
  });

  it('dedups identical specs into one layer', () => {
    const defs: BlockDef[] = [
      { id: 1, name: 'a', opaque: true, transparent: false, faces: { pattern: 'speckle', colors: [[1, 2, 3]] } },
      { id: 2, name: 'b', opaque: true, transparent: false, faces: { pattern: 'speckle', colors: [[1, 2, 3]] } },
    ];
    const t = buildBlockTextures(defs);
    expect(t.layerCount).toBe(1); // both blocks share the single unique spec
    expect(t.faceLayers.get(1)).toEqual([0, 0, 0, 0, 0, 0]);
    expect(t.faceLayers.get(2)).toEqual([0, 0, 0, 0, 0, 0]);
  });

  it('grass top and side resolve to different layers', () => {
    const g = BLOCK_TEXTURES.faceLayers.get(GRASS)!;
    expect(g[Face.PosY]).not.toBe(g[Face.PosX]); // top != side
    expect(g[Face.NegY]).toBe(BLOCK_TEXTURES.faceLayers.get(DIRT)![Face.PosY]); // grass bottom == dirt
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/blocks.test.ts`
Expected: FAIL — `BLOCK_TEXTURES`/`buildBlockTextures` not exported.

- [ ] **Step 3: Rewrite `blocks.ts`**

Keep the id constants (`AIR..CRYSTAL`) and `enum Face` exactly as-is. Replace the `TextureLayer` object, `TEXTURE_LAYER_COUNT`, `BlockDef`, `uniform`, and `BLOCK_DEFS` with the declarative table and the build step. Full replacement for everything below the `Face` enum:

```ts
import type { TextureSpec, FaceTextures } from './textures';
import { expandFaces, specKey } from './textures';
import type { BlockId } from '../core/types';

/** Definition of one block type. `faces` is declarative; AIR omits it. */
export interface BlockDef {
  id: BlockId;
  name: string;
  opaque: boolean;
  transparent: boolean;
  /** Self-emitted light (0..15). */
  light?: number;
  /** Whether the block appears in the creative picker. */
  creative?: boolean;
  /** Per-face texture specs (shorthand allowed). Omitted only for AIR. */
  faces?: FaceTextures;
}

const stone = (c: [number, number, number]): TextureSpec => ({ pattern: 'stone', colors: [c] });
const speck = (c: [number, number, number], amp: number): TextureSpec => ({ pattern: 'speckle', colors: [c], amp });
const ore = (spot: [number, number, number]): TextureSpec => ({ pattern: 'ore', colors: [spot] });

/** The block table — the single source of truth. Order here does NOT affect ids. */
export const BLOCK_DEFS: BlockDef[] = [
  { id: AIR, name: 'air', opaque: false, transparent: true },
  {
    id: GRASS, name: 'grass', opaque: true, transparent: false, creative: true,
    faces: {
      top: { pattern: 'grassTop', colors: [[86, 152, 60]] },
      side: { pattern: 'grassSide', colors: [[134, 96, 62], [86, 152, 60]] },
      bottom: speck([134, 96, 62], 20),
    },
  },
  { id: DIRT, name: 'dirt', opaque: true, transparent: false, creative: true, faces: speck([134, 96, 62], 20) },
  { id: STONE, name: 'stone', opaque: true, transparent: false, creative: true, faces: stone([128, 128, 132]) },
  {
    id: WOOD, name: 'wood', opaque: true, transparent: false, creative: true,
    faces: {
      top: { pattern: 'rings', colors: [[160, 130, 85]] },
      side: { pattern: 'bark', colors: [[105, 78, 46]] },
      bottom: { pattern: 'rings', colors: [[160, 130, 85]] },
    },
  },
  { id: LEAVES, name: 'leaves', opaque: true, transparent: false, creative: true, faces: { pattern: 'leaves', colors: [[54, 120, 44]] } },
  { id: SAND, name: 'sand', opaque: true, transparent: false, creative: true, faces: speck([206, 190, 140], 12) },
  { id: WATER, name: 'water', opaque: false, transparent: true, faces: speck([50, 110, 200], 10) },
  { id: SNOW, name: 'snow', opaque: true, transparent: false, creative: true, faces: speck([236, 240, 245], 6) },
  { id: CACTUS, name: 'cactus', opaque: true, transparent: false, creative: true, faces: { pattern: 'ridges', colors: [[60, 110, 60]] } },
  { id: GLASS, name: 'glass', opaque: false, transparent: true, creative: true, faces: { pattern: 'glass', colors: [[205, 232, 240]] } },
  { id: PLANKS, name: 'planks', opaque: true, transparent: false, creative: true, faces: { pattern: 'planks', colors: [[165, 130, 80]] } },
  { id: COBBLESTONE, name: 'cobblestone', opaque: true, transparent: false, creative: true, faces: { pattern: 'cobble', colors: [[118, 118, 122], [70, 70, 74]] } },
  { id: BRICK, name: 'brick', opaque: true, transparent: false, creative: true, faces: { pattern: 'brick', colors: [[150, 70, 58], [198, 182, 162]] } },
  { id: LANTERN, name: 'lantern', opaque: true, transparent: false, light: 14, creative: true, faces: { pattern: 'lantern', colors: [[60, 52, 40], [255, 226, 140]] } },
  { id: COAL_ORE, name: 'coal ore', opaque: true, transparent: false, faces: ore([40, 40, 44]) },
  { id: IRON_ORE, name: 'iron ore', opaque: true, transparent: false, faces: ore([196, 150, 110]) },
  { id: GOLD_ORE, name: 'gold ore', opaque: true, transparent: false, faces: ore([235, 205, 70]) },
  { id: CRYSTAL, name: 'crystal', opaque: true, transparent: false, light: 7, faces: ore([120, 220, 235]) },
];

export interface BlockTextures {
  uniqueSpecs: TextureSpec[];
  faceLayers: Map<BlockId, number[]>;
  layerCount: number;
}

/** Dedup all face specs into layers (first-appearance order) and resolve per-block face layers. */
export function buildBlockTextures(defs: BlockDef[]): BlockTextures {
  const uniqueSpecs: TextureSpec[] = [];
  const layerByKey = new Map<string, number>();
  const faceLayers = new Map<BlockId, number[]>();
  for (const def of defs) {
    if (!def.faces) continue;
    const specs = expandFaces(def.faces);
    const layers = specs.map((spec) => {
      const key = specKey(spec);
      let layer = layerByKey.get(key);
      if (layer === undefined) {
        layer = uniqueSpecs.length;
        layerByKey.set(key, layer);
        uniqueSpecs.push(spec);
      }
      return layer;
    });
    faceLayers.set(def.id, layers);
  }
  return { uniqueSpecs, faceLayers, layerCount: uniqueSpecs.length };
}

export const BLOCK_TEXTURES: BlockTextures = buildBlockTextures(BLOCK_DEFS);
export const TEXTURE_LAYER_COUNT = BLOCK_TEXTURES.layerCount;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/blocks.test.ts`
Expected: PASS. (Other files still import the now-removed `TextureLayer`; those are fixed in Tasks 5–6. Do not run the full suite yet.)

- [ ] **Step 5: Commit**

```bash
git add src/blocks/blocks.ts tests/blocks.test.ts
git commit -m "feat(blocks): declarative BLOCK_DEFS table with derived texture layers"
```

---

### Task 5: Render the texture array from `BLOCK_TEXTURES`

**Files:**
- Modify: `src/render/TextureArray.ts`
- Test: `tests/textureArray.test.ts` (create)

**Interfaces:**
- Consumes: `BLOCK_TEXTURES`, `TEXTURE_LAYER_COUNT` from `src/blocks/blocks`; `TILE`, `paintLayer` from `src/blocks/textures`.
- Produces: `createTextureArray(): DataArrayTexture` (unchanged signature).

- [ ] **Step 1: Write the failing test**

```ts
// tests/textureArray.test.ts
import { describe, it, expect } from 'vitest';
import { createTextureArray } from '../src/render/TextureArray';
import { TEXTURE_LAYER_COUNT } from '../src/blocks/blocks';
import { TILE } from '../src/blocks/textures';

describe('createTextureArray', () => {
  it('allocates one TILE*TILE RGBA layer per derived texture layer', () => {
    const tex = createTextureArray();
    const data = tex.image.data as Uint8Array;
    expect(data.length).toBe(TILE * TILE * 4 * TEXTURE_LAYER_COUNT);
    expect(tex.image.depth).toBe(TEXTURE_LAYER_COUNT);
    // every alpha byte is opaque
    for (let i = 3; i < data.length; i += 4) expect(data[i]).toBe(255);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/textureArray.test.ts`
Expected: FAIL — `createTextureArray` still references the removed `TextureLayer` (import error) or the test asserts new behavior.

- [ ] **Step 3: Rewrite `createTextureArray`**

Replace the body of `src/render/TextureArray.ts` (the builders and explicit `paint` calls are gone — they now live in `textures.ts`):

```ts
// src/render/TextureArray.ts
import { DataArrayTexture, RGBAFormat, UnsignedByteType, NearestFilter, RepeatWrapping } from 'three';
import { BLOCK_TEXTURES, TEXTURE_LAYER_COUNT } from '../blocks/blocks';
import { TILE, paintLayer } from '../blocks/textures';

/** Builds the procedural block-face texture array (one layer per derived texture spec). */
export function createTextureArray(): DataArrayTexture {
  const data = new Uint8Array(TILE * TILE * 4 * TEXTURE_LAYER_COUNT);
  BLOCK_TEXTURES.uniqueSpecs.forEach((spec, layer) => paintLayer(data, layer, spec));

  const tex = new DataArrayTexture(data, TILE, TILE, TEXTURE_LAYER_COUNT);
  tex.format = RGBAFormat;
  tex.type = UnsignedByteType;
  tex.magFilter = NearestFilter;
  tex.minFilter = NearestFilter;
  tex.wrapS = RepeatWrapping;
  tex.wrapT = RepeatWrapping;
  tex.needsUpdate = true;
  return tex;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/textureArray.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/render/TextureArray.ts tests/textureArray.test.ts
git commit -m "refactor(render): build texture array from declarative block specs"
```

---

### Task 6: `BlockRegistry` reads derived layers + runs a startup self-check

**Files:**
- Modify: `src/blocks/BlockRegistry.ts`
- Test: `tests/blockRegistry.test.ts` (create)

**Interfaces:**
- Consumes: `BLOCK_DEFS`, `BLOCK_TEXTURES`, `TEXTURE_LAYER_COUNT`, `Face` from `src/blocks/blocks`.
- Produces: `class BlockRegistry` with unchanged public methods `get/has/isOpaque/emission/faceLayer/layerCount`, plus it throws on construction if the table is inconsistent.

- [ ] **Step 1: Write the failing test**

```ts
// tests/blockRegistry.test.ts
import { describe, it, expect } from 'vitest';
import { BlockRegistry } from '../src/blocks/BlockRegistry';
import { GRASS, AIR, Face } from '../src/blocks/blocks';

describe('BlockRegistry', () => {
  const reg = new BlockRegistry();
  it('resolves a known face to a derived layer', () => {
    expect(typeof reg.faceLayer(GRASS, Face.PosY)).toBe('number');
  });
  it('throws faceLayer on AIR (no faces)', () => {
    expect(() => reg.faceLayer(AIR, Face.PosY)).toThrow();
  });
  it('reports emission and opacity from the table', () => {
    expect(reg.isOpaque(GRASS)).toBe(true);
    expect(reg.emission(AIR)).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/blockRegistry.test.ts`
Expected: FAIL — `BlockRegistry` still imports the removed `TEXTURE_LAYER_COUNT`/`faces` shape (compile/runtime error).

- [ ] **Step 3: Rewrite `BlockRegistry.ts`**

```ts
// src/blocks/BlockRegistry.ts
import type { BlockId } from '../core/types';
import { BLOCK_DEFS, BLOCK_TEXTURES, TEXTURE_LAYER_COUNT, type BlockDef, type Face } from './blocks';

/** Single source of truth for block lookups. Built from the stable BLOCK_DEFS table. */
export class BlockRegistry {
  private readonly byId = new Map<BlockId, BlockDef>();

  constructor() {
    for (const def of BLOCK_DEFS) {
      if (this.byId.has(def.id)) throw new Error(`Duplicate block id: ${def.id} (${def.name})`);
      this.byId.set(def.id, def);
    }
    this.selfCheck();
  }

  /** Fail loudly at boot if the declarative table is internally inconsistent. */
  private selfCheck(): void {
    for (const def of BLOCK_DEFS) {
      if (!def.faces) continue;
      const layers = BLOCK_TEXTURES.faceLayers.get(def.id);
      if (!layers || layers.length !== 6) {
        throw new Error(`Block "${def.name}" (id ${def.id}) did not resolve to 6 face layers`);
      }
      for (const l of layers) {
        if (l < 0 || l >= TEXTURE_LAYER_COUNT) {
          throw new Error(`Block "${def.name}" face layer ${l} out of range 0..${TEXTURE_LAYER_COUNT - 1}`);
        }
      }
    }
  }

  get(id: BlockId): BlockDef {
    const def = this.byId.get(id);
    if (!def) throw new Error(`Unknown block id: ${id}`);
    return def;
  }

  has(id: BlockId): boolean {
    return this.byId.has(id);
  }

  isOpaque(id: BlockId): boolean {
    return this.get(id).opaque;
  }

  emission(id: BlockId): number {
    return this.get(id).light ?? 0;
  }

  /** Texture layer index for a block face. Throws on faceless blocks (e.g. AIR). */
  faceLayer(id: BlockId, face: Face): number {
    const def = this.get(id);
    const layers = BLOCK_TEXTURES.faceLayers.get(id);
    if (!layers) {
      throw new Error(`faceLayer called on block "${def.name}" (id ${id}) which has no faces`);
    }
    return layers[face];
  }

  get layerCount(): number {
    return TEXTURE_LAYER_COUNT;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/blockRegistry.test.ts tests/blocks.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/blocks/BlockRegistry.ts tests/blockRegistry.test.ts
git commit -m "feat(blocks): registry self-check + derived face layers"
```

---

### Task 7: Derive the creative picker from the `creative` flag

**Files:**
- Modify: `src/app/CreativeInventory.ts`
- Test: `tests/creativeInventory.test.ts` (extend)

**Interfaces:**
- Consumes: `BLOCK_DEFS` from `src/blocks/blocks`.
- Produces: `CREATIVE_BLOCKS: BlockId[]` (now derived) — value/order = `BLOCK_DEFS.filter(d => d.creative).map(d => d.id)`.

- [ ] **Step 1: Write the failing test**

Append to `tests/creativeInventory.test.ts`:

```ts
import { CREATIVE_BLOCKS } from '../src/app/CreativeInventory';
import { BLOCK_DEFS, AIR } from '../src/blocks/blocks';

describe('CREATIVE_BLOCKS derivation', () => {
  it('contains exactly the blocks flagged creative, never AIR', () => {
    const expected = BLOCK_DEFS.filter((d) => d.creative).map((d) => d.id);
    expect(CREATIVE_BLOCKS).toEqual(expected);
    expect(CREATIVE_BLOCKS).not.toContain(AIR);
    expect(CREATIVE_BLOCKS.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/creativeInventory.test.ts`
Expected: FAIL — `CREATIVE_BLOCKS` is still the hand-written list.

- [ ] **Step 3: Implement the derivation**

Replace the top of `src/app/CreativeInventory.ts` (remove the hand-maintained import list and array):

```ts
// src/app/CreativeInventory.ts
import { BLOCK_DEFS } from '../blocks/blocks';
import type { BlockId } from '../core/types';

/** The blocks offered in the creative picker — derived from the `creative` flag in BLOCK_DEFS. */
export const CREATIVE_BLOCKS: BlockId[] = BLOCK_DEFS.filter((d) => d.creative).map((d) => d.id);
```

Leave the `CreativeInventory` class below unchanged.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/creativeInventory.test.ts`
Expected: PASS.

- [ ] **Step 5: Verify the whole Component-2 refactor compiles and the full suite is green**

Run: `npm run -s lint && npx vitest run`
Expected: lint clean (no remaining `TextureLayer` references anywhere), all tests pass. If any file still imports `TextureLayer`/`uniform`, fix the import to use the new API and re-run.

- [ ] **Step 6: Commit**

```bash
git add src/app/CreativeInventory.ts tests/creativeInventory.test.ts
git commit -m "feat(blocks): derive creative picker from BlockDef.creative flag"
```

---

## Component 3 — Reliable builds

### Task 8: `EditService` group/transaction API

**Files:**
- Modify: `src/edit/EditService.ts`
- Test: `tests/editService.test.ts` (extend)

**Interfaces:**
- Produces on `EditService`:
  - `beginGroup(): void`
  - `endGroup(): EditBatch | undefined` — pushes the accumulated changes as one batch (or nothing if empty).
  - `group<T>(fn: () => T): T` — begin/run/end, always closing the group even on throw.
  - Existing `apply(edits): EditBatch | undefined` is unchanged for non-grouped callers; while a group is open it mutates immediately but accumulates into the open group instead of pushing.

- [ ] **Step 1: Write the failing test**

Append to `tests/editService.test.ts` (reuse the file's existing fake world helper; a minimal one is shown if absent):

```ts
import { EditService } from '../src/edit/EditService';
import type { EditableWorld, SetVoxel, WorldVoxel } from '../src/edit/EditTypes';

function fakeWorld(): EditableWorld {
  const map = new Map<string, number>();
  const k = (v: { x: number; y: number; z: number }) => `${v.x},${v.y},${v.z}`;
  return {
    applyEdits(edits: SetVoxel[]): WorldVoxel[] {
      const changes: WorldVoxel[] = [];
      for (const e of edits) {
        const before = map.get(k(e)) ?? 0;
        if (before === e.id) continue;
        changes.push({ x: e.x, y: e.y, z: e.z, before, after: e.id });
        map.set(k(e), e.id);
      }
      return changes;
    },
    canApply: () => true,
  };
}

describe('EditService grouping', () => {
  it('coalesces multiple applies into one undo', () => {
    const svc = new EditService(fakeWorld());
    svc.group(() => {
      svc.apply([{ x: 0, y: 0, z: 0, id: 1 }]);
      svc.apply([{ x: 1, y: 0, z: 0, id: 1 }]);
      svc.apply([{ x: 2, y: 0, z: 0, id: 1 }]);
    });
    expect(svc.undo()).toBe('ok');
    // one undo reverses ALL three
    expect(svc.undo()).toBe('empty');
  });

  it('closes the group even when fn throws', () => {
    const svc = new EditService(fakeWorld());
    expect(() =>
      svc.group(() => {
        svc.apply([{ x: 0, y: 0, z: 0, id: 1 }]);
        throw new Error('boom');
      }),
    ).toThrow('boom');
    // history is intact and the partial work is one undoable batch
    expect(svc.undo()).toBe('ok');
    expect(svc.undo()).toBe('empty');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/editService.test.ts`
Expected: FAIL — `group`/`beginGroup`/`endGroup` not defined.

- [ ] **Step 3: Implement grouping in `EditService`**

Add a pending-group field and route `apply` through it. Insert into the class:

```ts
  private pending: WorldVoxel[] | null = null;

  beginGroup(): void {
    if (this.pending) return; // already grouping; ignore nested begins
    this.pending = [];
    this.redoStack.length = 0; // a new group invalidates redo, like a normal apply
  }

  endGroup(): EditBatch | undefined {
    const changes = this.pending;
    this.pending = null;
    if (!changes || changes.length === 0) return undefined;
    const batch: EditBatch = { changes };
    if (this.undoStack.length >= this.historyLimit) this.undoStack.shift();
    this.undoStack.push(batch);
    return batch;
  }

  group<T>(fn: () => T): T {
    this.beginGroup();
    try {
      return fn();
    } finally {
      this.endGroup();
    }
  }
```

And change `apply` so that while a group is open it accumulates instead of pushing:

```ts
  apply(edits: SetVoxel[]): EditBatch | undefined {
    const changes = this.world.applyEdits(edits);
    if (changes.length === 0) return undefined;

    if (this.pending) {
      this.pending.push(...changes);
      return { changes };
    }

    const batch: EditBatch = { changes };
    if (this.undoStack.length >= this.historyLimit) this.undoStack.shift();
    this.undoStack.push(batch);
    this.redoStack.length = 0;
    return batch;
  }
```

(Import `WorldVoxel` in the type import at the top: `import type { EditableWorld, EditBatch, EditOutcome, SetVoxel, WorldVoxel } from './EditTypes';`.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/editService.test.ts`
Expected: PASS (existing tests too).

- [ ] **Step 5: Commit**

```bash
git add src/edit/EditService.ts tests/editService.test.ts
git commit -m "feat(edit): group/transaction API so a multi-call build is one undo"
```

---

### Task 9: `ChunkManager.preloadBox` + honest edit counts

**Files:**
- Modify: `src/world/ChunkManager.ts`
- Modify: `src/app/DevBuildTools.ts` (extend `EditResult` with `unloadedChunks`)
- Test: `tests/chunkManager.test.ts` (extend)

**Interfaces:**
- Consumes: `worldToChunkCoord` from `src/core/coords`.
- Produces:
  - `ChunkManager.preloadBox(minX: number, minZ: number, maxX: number, maxZ: number): { generated: number; meshed: number }` — preloads every chunk overlapping the world-space XZ box (clamped to a max chunk count).
  - `EditResult` (in `DevBuildTools.ts`) gains `unloadedChunks: string[]` (chunk keys, deduped) so a failed build self-diagnoses.

- [ ] **Step 1: Write the failing test**

Append to `tests/chunkManager.test.ts` (use the file's existing manager setup; the assertion only needs the public surface):

```ts
import { worldToChunkCoord } from '../src/core/coords';

it('preloadBox loads every chunk overlapping the box', () => {
  const mgr = makeManager(); // existing helper in this test file
  const res = mgr.preloadBox(0, 0, 40, 40); // spans ~3 chunks per axis at CHUNK_SIZE 16
  expect(res.generated + res.meshed).toBeGreaterThan(0);
  // all four corners are now loaded
  expect(mgr.isLoaded(0, 0)).toBe(true);
  expect(mgr.isLoaded(40, 40)).toBe(true);
  expect(mgr.isLoaded(0, 40)).toBe(true);
  expect(mgr.isLoaded(40, 0)).toBe(true);
});
```

> If `tests/chunkManager.test.ts` has no `makeManager` helper, mirror the construction already used by the existing tests in that file (same world/generator stubs) — do not invent a new harness.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/chunkManager.test.ts`
Expected: FAIL — `preloadBox` not defined.

- [ ] **Step 3: Implement `preloadBox`**

Add to `ChunkManager` (reuse the existing `preload(cx, cz, radius)` per-chunk generate+mesh path by iterating the chunk range; do not duplicate its body):

```ts
  /** Preload every chunk overlapping the world-space XZ box [minX..maxX] x [minZ..maxZ]. */
  preloadBox(
    minX: number,
    minZ: number,
    maxX: number,
    maxZ: number,
  ): { generated: number; meshed: number } {
    const cx0 = worldToChunkCoord(Math.min(minX, maxX));
    const cx1 = worldToChunkCoord(Math.max(minX, maxX));
    const cz0 = worldToChunkCoord(Math.min(minZ, maxZ));
    const cz1 = worldToChunkCoord(Math.max(minZ, maxZ));
    const MAX_CHUNKS = 256; // guard against a pathological AABB
    if ((cx1 - cx0 + 1) * (cz1 - cz0 + 1) > MAX_CHUNKS) {
      throw new Error('preloadBox region too large (>256 chunks)');
    }
    let generated = 0;
    let meshed = 0;
    for (let cz = cz0; cz <= cz1; cz++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const r = this.preload(cx, cz, 0); // radius 0 = just this chunk
        generated += r.generated;
        meshed += r.meshed;
      }
    }
    return { generated, meshed };
  }
```

In `src/app/DevBuildTools.ts`, extend `EditResult` and `combineEditResults`:

```ts
export interface EditResult {
  requested: number;
  applied: number;
  outOfWorld: number;
  unloaded: number;
  noChange: number;
  /** Chunk keys that were unloaded at apply time (deduped) — for self-diagnosing failed builds. */
  unloadedChunks: string[];
}
```

```ts
function combineEditResults(batches: EditResult[]): BatchedEditResult {
  const chunks = new Set<string>();
  for (const b of batches) for (const c of b.unloadedChunks) chunks.add(c);
  return {
    requested: sum(batches, 'requested'),
    applied: sum(batches, 'applied'),
    unloaded: sum(batches, 'unloaded'),
    outOfWorld: sum(batches, 'outOfWorld'),
    noChange: sum(batches, 'noChange'),
    unloadedChunks: [...chunks],
    batches,
  };
}
```

(Adjust `sum` calls only over numeric keys; `unloadedChunks` is aggregated via the Set above.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/chunkManager.test.ts tests/devBuildTools.test.ts`
Expected: PASS. Fix any `devBuildTools.test.ts` fixtures that construct an `EditResult` literal to include `unloadedChunks: []`.

- [ ] **Step 5: Commit**

```bash
git add src/world/ChunkManager.ts src/app/DevBuildTools.ts tests/chunkManager.test.ts tests/devBuildTools.test.ts
git commit -m "feat(world): preloadBox + unloadedChunks in EditResult for honest build diagnostics"
```

---

### Task 10: `DevControls` auto-preloads, groups builds, reports honestly

**Files:**
- Modify: `src/app/DevControls.ts`
- Test: covered via `tests/devBuildTools.test.ts` for pure pieces; the `__vr` wiring is verified by the full build/lint in Task 12.

**Interfaces:**
- Consumes: `EditService.group`, `ChunkManager.preloadBox`, the extended `EditResult`.
- Produces: `applyAny` now (a) preloads the voxel AABB, (b) wraps the apply in `edit.group(...)` so the whole call is one undo, (c) `console.warn`s when `unloaded > 0`, and (d) populates `unloadedChunks`. `place/fill/clearBox/sphere/tunnel/line/cylinder/pyramid/hollowBox/path` are annotated `BatchedEditResult`.

- [ ] **Step 1: Update `applyBatch` to record unloaded chunk keys**

In `src/app/DevControls.ts`, change `applyBatch` (~166) so it collects unloaded chunk keys and returns them:

```ts
  const applyBatch = (voxels: SetVoxel[]): EditResult => {
    if (voxels.length > MAX_BUILD) throw new Error(`build too large (${voxels.length} > ${MAX_BUILD})`);
    let outOfWorld = 0;
    let unloaded = 0;
    const unloadedChunks = new Set<string>();
    for (const v of voxels) {
      if (v.y < 0 || v.y >= WORLD_HEIGHT) outOfWorld++;
      else if (!manager.isLoaded(v.x, v.z)) {
        unloaded++;
        unloadedChunks.add(`${worldToChunkCoord(v.x)},${worldToChunkCoord(v.z)}`);
      }
    }
    const batch = edit.apply(voxels);
    const applied = batch ? batch.changes.length : 0;
    const noChange = Math.max(0, voxels.length - applied - outOfWorld - unloaded);
    return { requested: voxels.length, applied, outOfWorld, unloaded, noChange, unloadedChunks: [...unloadedChunks] };
  };
```

- [ ] **Step 2: Auto-preload + group in `applyAny`**

Replace `applyAny` (~180) with a version that preloads the AABB and groups:

```ts
  const voxelBounds = (voxels: SetVoxel[]) => {
    let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
    for (const v of voxels) {
      if (v.x < minX) minX = v.x;
      if (v.z < minZ) minZ = v.z;
      if (v.x > maxX) maxX = v.x;
      if (v.z > maxZ) maxZ = v.z;
    }
    return { minX, minZ, maxX, maxZ };
  };

  const applyAny = (
    voxels: SetVoxel[],
    opts: { label?: string; maxBatchSize?: number; preload?: boolean } = {},
  ): BatchedEditResult => {
    if (voxels.length > 0 && opts.preload !== false) {
      const b = voxelBounds(voxels);
      try {
        manager.preloadBox(b.minX, b.minZ, b.maxX, b.maxZ);
      } catch {
        /* region too large to auto-preload; fall through and report unloaded honestly */
      }
    }
    const maxBatchSize = Math.min(MAX_BUILD, Math.max(1, Math.floor(opts.maxBatchSize ?? MAX_BUILD)));
    const result = edit.group(() => applyVoxelsInBatches(voxels, applyBatch, maxBatchSize));
    if (result.unloaded > 0) {
      console.warn(
        `Voxel Realm build: ${result.unloaded} voxel(s) hit unloaded chunks ${result.unloadedChunks.join(' ')}`,
      );
    }
    if (opts.label) console.debug(`Voxel Realm build: ${opts.label}`, result);
    return result;
  };
```

- [ ] **Step 3: Fix the return-type annotations**

In `src/app/DevControls.ts`, change the annotations on `place`, `fill`, `clearBox`, `sphere`, `tunnel` from `EditResult` to `BatchedEditResult` (they already call `applyAny`, which returns `BatchedEditResult`). `line/cylinder/pyramid/hollowBox` already infer it.

- [ ] **Step 4: Run the focused + full suite**

Run: `npx vitest run tests/devBuildTools.test.ts && npm run -s lint`
Expected: PASS, lint clean (TS confirms the `BatchedEditResult` annotations and the new `applyAny` signature typecheck).

- [ ] **Step 5: Commit**

```bash
git add src/app/DevControls.ts
git commit -m "feat(dev): __vr builds auto-preload, group into one undo, and warn on unloaded chunks"
```

---

## Component 4 — Region & prefab transforms in `__vr`

### Task 11: `replace` / `move` / `mirror` / `rotate` / `array`

**Files:**
- Modify: `src/app/DevControls.ts`
- Create: `src/app/RegionOps.ts` (pure helpers for testability)
- Test: `tests/regionOps.test.ts`

**Interfaces:**
- Consumes: `Prefab`, `rotateY`, `mirror`, `repeat` from `src/core/Prefab`; `SetVoxel` from `src/edit/EditTypes`.
- Produces in `src/app/RegionOps.ts`:
  - `replaceVoxels(read: (x,y,z) => BlockId, box, fromId, toId): SetVoxel[]` — voxels in `box` equal to `fromId`, retargeted to `toId`.
  - `prefabToVoxels(p: Prefab, ox: number, oy: number, oz: number): SetVoxel[]`
- Produces on `__vr` (DevControls): `replace`, `move`, `mirror`, `rotate`, `array` — each one grouped, undoable action. (`copy`, `clearBox`, `paste` already exist.)

- [ ] **Step 1: Write the failing test**

```ts
// tests/regionOps.test.ts
import { describe, it, expect } from 'vitest';
import { replaceVoxels, prefabToVoxels } from '../src/app/RegionOps';
import type { Prefab } from '../src/core/Prefab';

describe('replaceVoxels', () => {
  it('retargets only matching ids inside the box', () => {
    const world: Record<string, number> = { '0,0,0': 3, '1,0,0': 5, '2,0,0': 3 };
    const read = (x: number, y: number, z: number) => world[`${x},${y},${z}`] ?? 0;
    const out = replaceVoxels(read, { x1: 0, y1: 0, z1: 0, x2: 2, y2: 0, z2: 0 }, 3, 7);
    expect(out).toEqual([
      { x: 0, y: 0, z: 0, id: 7 },
      { x: 2, y: 0, z: 0, id: 7 },
    ]);
  });
});

describe('prefabToVoxels', () => {
  it('offsets prefab blocks to a paste origin', () => {
    const p: Prefab = { dims: [1, 1, 2], blocks: [[0, 0, 0, 1], [0, 0, 1, 2]] };
    expect(prefabToVoxels(p, 10, 20, 30)).toEqual([
      { x: 10, y: 20, z: 30, id: 1 },
      { x: 10, y: 20, z: 31, id: 2 },
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/regionOps.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the pure helpers**

```ts
// src/app/RegionOps.ts
import type { Prefab } from '../core/Prefab';
import type { BlockId } from '../core/types';
import type { SetVoxel } from '../edit/EditTypes';

export interface Box {
  x1: number; y1: number; z1: number;
  x2: number; y2: number; z2: number;
}

/** Voxels inside `box` whose current id equals `fromId`, retargeted to `toId`. */
export function replaceVoxels(
  read: (x: number, y: number, z: number) => BlockId,
  box: Box,
  fromId: BlockId,
  toId: BlockId,
): SetVoxel[] {
  const [ax, bx] = [Math.min(box.x1, box.x2), Math.max(box.x1, box.x2)];
  const [ay, by] = [Math.min(box.y1, box.y2), Math.max(box.y1, box.y2)];
  const [az, bz] = [Math.min(box.z1, box.z2), Math.max(box.z1, box.z2)];
  const out: SetVoxel[] = [];
  for (let x = ax; x <= bx; x++)
    for (let y = ay; y <= by; y++)
      for (let z = az; z <= bz; z++)
        if (read(x, y, z) === fromId) out.push({ x, y, z, id: toId });
  return out;
}

/** Stamp a prefab's non-air blocks at a paste origin. */
export function prefabToVoxels(p: Prefab, ox: number, oy: number, oz: number): SetVoxel[] {
  return p.blocks.map(([dx, dy, dz, id]) => ({ x: ox + dx, y: oy + dy, z: oz + dz, id }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/regionOps.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire the `__vr` region ops**

In `src/app/DevControls.ts`, import the helpers and transforms:

```ts
import { rotateY, mirror as mirrorPrefab, repeat, normalize, type Prefab } from '../core/Prefab';
import { replaceVoxels, prefabToVoxels, type Box } from './RegionOps';
```

Add these methods to the `api` object (they reuse existing `copy`, and `applyAny` already groups + preloads, so each call is one undo). Insert near the other build methods:

```ts
    /** Replace every `fromId` voxel in the box with `toId` (one undo). */
    replace: (x1: number, y1: number, z1: number, x2: number, y2: number, z2: number, fromId: BlockId, toId: BlockId): BatchedEditResult =>
      applyAny(
        replaceVoxels((x, y, z) => manager.getBlock(x, y, z), { x1, y1, z1, x2, y2, z2 }, fromId, toId),
        { label: 'replace' },
      ),

    /** Move a box by (dx,dy,dz): copy, clear the source, paste at the offset — one undo. */
    move: (x1: number, y1: number, z1: number, x2: number, y2: number, z2: number, dx: number, dy: number, dz: number): BatchedEditResult => {
      const bp = api.copy(x1, y1, z1, x2, y2, z2);
      const ox = Math.min(x1, x2), oy = Math.min(y1, y2), oz = Math.min(z1, z2);
      const clear = boxVoxels({ x: x1, y: y1, z: z1 }, { x: x2, y: y2, z: z2 }).map((v) => ({ ...v, id: AIR }));
      const paste = prefabToVoxels(bp, ox + dx, oy + dy, oz + dz);
      return applyAny([...clear, ...paste], { label: 'move' });
    },

    /** Mirror a box in place across 'x' or 'z' (one undo). */
    mirror: (x1: number, y1: number, z1: number, x2: number, y2: number, z2: number, axis: 'x' | 'z'): BatchedEditResult => {
      const bp = api.copy(x1, y1, z1, x2, y2, z2);
      const ox = Math.min(x1, x2), oy = Math.min(y1, y2), oz = Math.min(z1, z2);
      return applyAny(prefabToVoxels(mirrorPrefab(bp, axis), ox, oy, oz), { label: 'mirror' });
    },

    /** Rotate a box in place about Y by `quarterTurns` * 90deg, re-anchored at the min corner (one undo). */
    rotate: (x1: number, y1: number, z1: number, x2: number, y2: number, z2: number, quarterTurns: number): BatchedEditResult => {
      const bp = api.copy(x1, y1, z1, x2, y2, z2);
      const ox = Math.min(x1, x2), oy = Math.min(y1, y2), oz = Math.min(z1, z2);
      return applyAny(prefabToVoxels(rotateY(bp, quarterTurns), ox, oy, oz), { label: 'rotate' });
    },

    /** Tile a box into an nx*ny*nz grid with the given per-axis stride (one undo). */
    array: (x1: number, y1: number, z1: number, x2: number, y2: number, z2: number, nx: number, ny: number, nz: number, sx: number, sy: number, sz: number): BatchedEditResult => {
      const bp = api.copy(x1, y1, z1, x2, y2, z2);
      const ox = Math.min(x1, x2), oy = Math.min(y1, y2), oz = Math.min(z1, z2);
      return applyAny(prefabToVoxels(repeat(bp, nx, ny, nz, [sx, sy, sz]), ox, oy, oz), { label: 'array' });
    },
```

(`normalize` is imported for parity with the Prefab API even if unused directly; remove the import if lint flags it as unused.)

- [ ] **Step 6: Run focused tests + lint**

Run: `npx vitest run tests/regionOps.test.ts && npm run -s lint`
Expected: PASS, lint clean.

- [ ] **Step 7: Commit**

```bash
git add src/app/RegionOps.ts src/app/DevControls.ts tests/regionOps.test.ts
git commit -m "feat(dev): __vr replace/move/mirror/rotate/array region ops (each one undo)"
```

---

### Task 12: Full verification + docs

**Files:**
- Modify: `README` note or `docs/` if a dev API list exists (optional); otherwise none.
- No test file changes.

- [ ] **Step 1: Run the full gate**

Run: `npm run -s lint && npx vitest run && npm run -s build`
Expected: lint clean, all tests pass, `tsc --noEmit` + `vite build` succeed with no remaining references to `TextureLayer`, `uniform`, or the old `Blueprint`/`Structure` interfaces.

- [ ] **Step 2: Manual smoke (dev studio)**

Run: `npm run dev`, open `http://localhost:5173/?world=flat`, and in the console:

```js
__vr.help();                       // includes replace, move, mirror, rotate, array
__vr.fill(0, 32, 0, 4, 32, 4, 3);  // stone pad, auto-preloaded
__vr.replace(0, 32, 0, 4, 32, 4, 3, 13); // stone -> brick, one action
__vr.undo();                       // reverts the whole replace in one step
__vr.rotate(0, 32, 0, 4, 33, 4, 1);// rotate a small box 90deg
```

Expected: blocks appear without manual `preloadArea`; a single `undo()` reverses each whole operation; textures look correct.

- [ ] **Step 3: Commit any doc tweak (if made)**

```bash
git add -A
git commit -m "docs(dev): note __vr region ops and one-edit block authoring"
```

> After merge, update the `voxel-realm-agent-playground` memory note to mention: blocks are now one declarative row in `BLOCK_DEFS`; `__vr` builds auto-preload + group into one undo; new `replace/move/mirror/rotate/array` ops exist.

---

## Self-Review

**Spec coverage:**
- Component 1 (Prefab + transforms + Math.imul fix) → Tasks 1–2. ✓
- Component 2 (declarative registry: table, layer derivation, texture renderer, registry self-check, derived creative list) → Tasks 3–7. ✓
- Component 3 (group-undo, auto-preload, honest diagnostics) → Tasks 8–10. ✓
- Component 4 (replace/move/mirror/rotate/array) → Task 11. ✓
- Testing strategy (prefab, registry/layers, editService grouping, chunkManager preload/counts, region ops, determinism) → Tasks 1,3,4,5,6,8,9,11 + full gate Task 12. ✓
- Migration/compat (ids append-only, save format untouched, mesher contract intact) → enforced by Global Constraints + Task 6 keeping `faceLayer` signature + Task 12 build gate. ✓
- Non-goals (no shape system, no new content, no Track A beyond the adjacent `Math.imul` fix) → respected; nothing in tasks adds them. ✓

**Placeholder scan:** No "TBD/TODO/handle edge cases" — every code and test step shows real content. The one conditional ("if `makeManager` helper absent, mirror existing construction") points to a concrete existing pattern, not a placeholder.

**Type consistency:** `Prefab`/`PrefabVoxel` (Task 1) used identically in Tasks 2, 11. `TextureSpec`/`FaceTextures`/`expandFaces`/`specKey`/`paintLayer`/`TILE` (Task 3) consumed unchanged in Tasks 4–5. `BLOCK_TEXTURES`/`buildBlockTextures`/`TEXTURE_LAYER_COUNT` (Task 4) consumed in Tasks 5–6. `EditService.group` (Task 8) used in Task 10. `preloadBox` (Task 9) used in Task 10. `EditResult.unloadedChunks` (Task 9) populated in Task 10. `replaceVoxels`/`prefabToVoxels`/`Box` (Task 11) match their test. No signature drift.
