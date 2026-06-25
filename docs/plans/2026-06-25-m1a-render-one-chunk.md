# M1A — Render One Chunk Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the Vite+TS+three.js skeleton and render one seeded, textured, procedurally-generated voxel chunk in the browser.

**Architecture:** Pure logic (`core`, `blocks`, `world`, `worldgen`, `mesh`) has **no three.js imports** and is unit-tested headlessly with Vitest. Only `render/` and `app/` touch three.js. A naive face-culling mesher (greedy/AO comes in M1B) produces a `MeshData` POJO that `render/` converts to a `THREE.BufferGeometry` drawn with a `RawShaderMaterial` sampling a `DataArrayTexture` (one layer per block-face texture).

**Tech Stack:** Vite, TypeScript (strict), three.js, Vitest, ESLint, Prettier, `simplex-noise` (seeded via a local mulberry32 PRNG).

---

## File Structure

```txt
voxel-realm/
  package.json, tsconfig.json, vite.config.ts, .eslintrc.cjs, .prettierrc, vitest.config.ts
  index.html
  src/
    app/        main.ts, Game.ts
    core/       constants.ts, coords.ts, math.ts, types.ts
    blocks/     blocks.ts, BlockRegistry.ts
    world/      ChunkData.ts
    worldgen/   Generator.ts, HeightmapGenerator.ts
    mesh/       MeshTypes.ts, BasicMesher.ts
    render/     TextureArray.ts, ChunkMaterial.ts, buildChunkMesh.ts, Renderer.ts
  tests/
    coords.test.ts, blocks.test.ts, chunkData.test.ts, math.test.ts,
    heightmapGenerator.test.ts, basicMesher.test.ts
```

Responsibilities:
- `core/` — dimensionless constants, the **single** voxel-index convention, world↔chunk↔local conversions, seeded PRNG, shared types.
- `blocks/` — stable/append-only block id table and per-face texture **layer indices** (pure data; pixels live in `render/`).
- `world/ChunkData.ts` — flat `Uint8Array` chunk storage with `get`/`set`.
- `worldgen/` — `Generator` interface + overlay seam (empty list in M1) + `HeightmapGenerator`.
- `mesh/` — `MeshData` type + naive face-culling mesher (no three.js).
- `render/` — `DataArrayTexture` builder, the shader material, `MeshData`→`THREE.Mesh`, and the scene/camera/loop.
- `app/` — composition root: wire registry → generate → mesh → upload → render.

---

## Task 0: Project scaffold

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `vitest.config.ts`, `.eslintrc.cjs`, `.prettierrc`, `.prettierignore`, `index.html`, `src/app/main.ts`, `tests/smoke.test.ts`

- [ ] **Step 1: Initialize npm and install deps**

Run:
```bash
cd /c/Users/Edgar/Desktop/voxel-realm
npm init -y
npm install three simplex-noise
npm install -D typescript vite vitest @types/three eslint prettier \
  @typescript-eslint/parser @typescript-eslint/eslint-plugin \
  eslint-config-prettier eslint-plugin-prettier
```
Expected: `node_modules/` created, dependencies in `package.json`.

- [ ] **Step 2: Write `package.json` scripts**

Replace the `"scripts"` block in `package.json` with:
```json
{
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "eslint \"src/**/*.ts\" \"tests/**/*.ts\"",
    "format": "prettier --write \"src/**/*.ts\" \"tests/**/*.ts\""
  }
}
```

- [ ] **Step 3: Write `tsconfig.json` (strict)**

`tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "exactOptionalPropertyTypes": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "types": ["vitest/globals"]
  },
  "include": ["src", "tests"]
}
```

- [ ] **Step 4: Write `vite.config.ts` and `vitest.config.ts`**

`vite.config.ts`:
```ts
import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  build: { outDir: 'dist' },
});
```

`vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
```

- [ ] **Step 5: Write ESLint + Prettier config**

`.eslintrc.cjs`:
```js
module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
  plugins: ['@typescript-eslint', 'prettier'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'eslint-config-prettier',
  ],
  env: { browser: true, node: true, es2022: true },
  rules: {
    'prettier/prettier': 'warn',
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
  },
  ignorePatterns: ['dist', 'node_modules'],
};
```

`.prettierrc`:
```json
{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100
}
```

`.prettierignore`:
```txt
dist
node_modules
package-lock.json
```

- [ ] **Step 6: Write `index.html` and entry**

`index.html`:
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Voxel Realm</title>
    <style>
      html, body { margin: 0; height: 100%; overflow: hidden; background: #87b9e8; }
      #app { width: 100vw; height: 100vh; display: block; }
    </style>
  </head>
  <body>
    <canvas id="app"></canvas>
    <script type="module" src="/src/app/main.ts"></script>
  </body>
</html>
```

`src/app/main.ts` (temporary placeholder, replaced in Task 10):
```ts
console.log('Voxel Realm booting…');
```

- [ ] **Step 7: Write the smoke test**

`tests/smoke.test.ts`:
```ts
import { describe, it, expect } from 'vitest';

describe('toolchain', () => {
  it('runs vitest', () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 8: Verify toolchain**

Run: `npm run test && npm run lint`
Expected: 1 test passes; lint reports no errors.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "chore: scaffold vite+ts+three.js project for M1A"
```

---

## Task 1: Core constants & coordinate convention

**Files:**
- Create: `src/core/constants.ts`, `src/core/coords.ts`, `src/core/types.ts`
- Test: `tests/coords.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/coords.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { CHUNK_SIZE_X, CHUNK_SIZE_Z, WORLD_HEIGHT, CHUNK_VOLUME } from '../src/core/constants';
import {
  voxelIndex,
  indexToLocal,
  inChunkBounds,
  worldToChunkCoord,
  worldToLocal,
} from '../src/core/coords';

describe('constants', () => {
  it('chunk volume matches dimensions', () => {
    expect(CHUNK_VOLUME).toBe(CHUNK_SIZE_X * WORLD_HEIGHT * CHUNK_SIZE_Z);
  });
});

describe('voxelIndex', () => {
  it('is zero at the origin voxel', () => {
    expect(voxelIndex(0, 0, 0)).toBe(0);
  });

  it('round-trips index -> local -> index across the whole volume corners', () => {
    const corners: Array<[number, number, number]> = [
      [0, 0, 0],
      [CHUNK_SIZE_X - 1, 0, 0],
      [0, WORLD_HEIGHT - 1, 0],
      [0, 0, CHUNK_SIZE_Z - 1],
      [CHUNK_SIZE_X - 1, WORLD_HEIGHT - 1, CHUNK_SIZE_Z - 1],
      [5, 100, 9],
    ];
    for (const [x, y, z] of corners) {
      const idx = voxelIndex(x, y, z);
      expect(indexToLocal(idx)).toEqual({ x, y, z });
    }
  });

  it('produces unique indices for every voxel', () => {
    const seen = new Set<number>();
    for (let y = 0; y < WORLD_HEIGHT; y++)
      for (let z = 0; z < CHUNK_SIZE_Z; z++)
        for (let x = 0; x < CHUNK_SIZE_X; x++) seen.add(voxelIndex(x, y, z));
    expect(seen.size).toBe(CHUNK_VOLUME);
  });
});

describe('bounds', () => {
  it('accepts in-range and rejects out-of-range', () => {
    expect(inChunkBounds(0, 0, 0)).toBe(true);
    expect(inChunkBounds(CHUNK_SIZE_X - 1, WORLD_HEIGHT - 1, CHUNK_SIZE_Z - 1)).toBe(true);
    expect(inChunkBounds(-1, 0, 0)).toBe(false);
    expect(inChunkBounds(0, WORLD_HEIGHT, 0)).toBe(false);
    expect(inChunkBounds(CHUNK_SIZE_X, 0, 0)).toBe(false);
  });
});

describe('world <-> chunk/local', () => {
  it('maps world coords into chunk coords with floor division', () => {
    expect(worldToChunkCoord(0)).toBe(0);
    expect(worldToChunkCoord(15)).toBe(0);
    expect(worldToChunkCoord(16)).toBe(1);
    expect(worldToChunkCoord(-1)).toBe(-1);
    expect(worldToChunkCoord(-16)).toBe(-1);
    expect(worldToChunkCoord(-17)).toBe(-2);
  });

  it('maps world coords into non-negative local coords', () => {
    expect(worldToLocal(0)).toBe(0);
    expect(worldToLocal(16)).toBe(0);
    expect(worldToLocal(-1)).toBe(15);
    expect(worldToLocal(-16)).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- coords`
Expected: FAIL — cannot resolve `../src/core/constants`.

- [ ] **Step 3: Write the implementation**

`src/core/constants.ts`:
```ts
/** Horizontal chunk footprint (X). */
export const CHUNK_SIZE_X = 16;
/** Horizontal chunk footprint (Z). */
export const CHUNK_SIZE_Z = 16;
/** Bounded vertical extent of the world (tunable; bump persistence version if changed). */
export const WORLD_HEIGHT = 192;

export const CHUNK_AREA = CHUNK_SIZE_X * CHUNK_SIZE_Z;
export const CHUNK_VOLUME = CHUNK_SIZE_X * WORLD_HEIGHT * CHUNK_SIZE_Z;
```

`src/core/types.ts`:
```ts
/** Stable numeric block id (see blocks/blocks.ts). */
export type BlockId = number;

/** World generation seed. */
export type WorldSeed = number;

/** Local voxel coordinate inside a chunk. */
export interface LocalCoord {
  x: number;
  y: number;
  z: number;
}
```

`src/core/coords.ts`:
```ts
import { CHUNK_SIZE_X, CHUNK_SIZE_Z, WORLD_HEIGHT } from './constants';
import type { LocalCoord } from './types';

/**
 * THE voxel-index convention. Flat layout, x fastest then z then y:
 *   index = x + CHUNK_SIZE_X * (z + CHUNK_SIZE_Z * y)
 * Used everywhere; never duplicate this formula elsewhere.
 */
export function voxelIndex(x: number, y: number, z: number): number {
  return x + CHUNK_SIZE_X * (z + CHUNK_SIZE_Z * y);
}

export function indexToLocal(index: number): LocalCoord {
  const x = index % CHUNK_SIZE_X;
  const rest = (index - x) / CHUNK_SIZE_X;
  const z = rest % CHUNK_SIZE_Z;
  const y = (rest - z) / CHUNK_SIZE_Z;
  return { x, y, z };
}

export function inChunkBounds(x: number, y: number, z: number): boolean {
  return (
    x >= 0 &&
    x < CHUNK_SIZE_X &&
    y >= 0 &&
    y < WORLD_HEIGHT &&
    z >= 0 &&
    z < CHUNK_SIZE_Z
  );
}

/** Floor-divide a world coordinate to its chunk coordinate (handles negatives). */
export function worldToChunkCoord(world: number): number {
  return Math.floor(world / CHUNK_SIZE_X);
}

/** Map a world coordinate to its non-negative local coordinate (handles negatives). */
export function worldToLocal(world: number): number {
  return ((world % CHUNK_SIZE_X) + CHUNK_SIZE_X) % CHUNK_SIZE_X;
}
```

> Note: `worldToChunkCoord` / `worldToLocal` assume square horizontal footprint (`CHUNK_SIZE_X === CHUNK_SIZE_Z`), which holds in M1.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- coords`
Expected: PASS (all coords tests green).

- [ ] **Step 5: Commit**

```bash
git add src/core tests/coords.test.ts
git commit -m "feat(core): add constants and voxel-index/world-chunk coordinate convention"
```

---

## Task 2: Block registry & face texture layers

**Files:**
- Create: `src/blocks/blocks.ts`, `src/blocks/BlockRegistry.ts`
- Test: `tests/blocks.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/blocks.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { AIR, GRASS, DIRT, STONE, TextureLayer, Face } from '../src/blocks/blocks';
import { BlockRegistry } from '../src/blocks/BlockRegistry';

describe('block ids are stable and append-only', () => {
  it('matches the spec table', () => {
    expect(AIR).toBe(0);
    expect(GRASS).toBe(1);
    expect(DIRT).toBe(2);
    expect(STONE).toBe(3);
  });
});

describe('BlockRegistry', () => {
  const reg = new BlockRegistry();

  it('reports air as non-opaque and others as opaque', () => {
    expect(reg.isOpaque(AIR)).toBe(false);
    expect(reg.isOpaque(GRASS)).toBe(true);
    expect(reg.isOpaque(DIRT)).toBe(true);
    expect(reg.isOpaque(STONE)).toBe(true);
  });

  it('maps grass faces: top=grass-top, bottom=dirt, sides=grass-side', () => {
    expect(reg.faceLayer(GRASS, Face.PosY)).toBe(TextureLayer.GrassTop);
    expect(reg.faceLayer(GRASS, Face.NegY)).toBe(TextureLayer.Dirt);
    expect(reg.faceLayer(GRASS, Face.PosX)).toBe(TextureLayer.GrassSide);
    expect(reg.faceLayer(GRASS, Face.NegZ)).toBe(TextureLayer.GrassSide);
  });

  it('maps dirt and stone uniformly on all faces', () => {
    for (const f of [Face.PosX, Face.NegX, Face.PosY, Face.NegY, Face.PosZ, Face.NegZ]) {
      expect(reg.faceLayer(DIRT, f)).toBe(TextureLayer.Dirt);
      expect(reg.faceLayer(STONE, f)).toBe(TextureLayer.Stone);
    }
  });

  it('exposes the number of texture layers for the DataArrayTexture', () => {
    expect(reg.layerCount).toBe(4);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- blocks`
Expected: FAIL — cannot resolve `../src/blocks/blocks`.

- [ ] **Step 3: Write the implementation**

`src/blocks/blocks.ts`:
```ts
import type { BlockId } from '../core/types';

/** Stable, append-only block ids. NEVER reorder or reuse (saves store ids). */
export const AIR: BlockId = 0;
export const GRASS: BlockId = 1;
export const DIRT: BlockId = 2;
export const STONE: BlockId = 3;

/** Cube face directions, indexed 0..5 and used by the mesher. */
export enum Face {
  PosX = 0,
  NegX = 1,
  PosY = 2,
  NegY = 3,
  PosZ = 4,
  NegZ = 5,
}

/** Texture layer indices into the DataArrayTexture (one layer per face texture). */
export const TextureLayer = {
  GrassTop: 0,
  GrassSide: 1,
  Dirt: 2,
  Stone: 3,
} as const;

export const TEXTURE_LAYER_COUNT = 4;

/** Definition of one block type. `faces` lists the texture layer per Face (0..5). */
export interface BlockDef {
  id: BlockId;
  name: string;
  opaque: boolean;
  /** Forward-looking flags (unused in M1; opaque blocks only). */
  transparent: boolean;
  /** Texture layer per face, indexed by Face; empty for air. */
  faces: number[];
}

function uniform(layer: number): number[] {
  return [layer, layer, layer, layer, layer, layer];
}

/** The block table. Order here does not affect ids — ids are explicit above. */
export const BLOCK_DEFS: BlockDef[] = [
  { id: AIR, name: 'air', opaque: false, transparent: true, faces: [] },
  {
    id: GRASS,
    name: 'grass',
    opaque: true,
    transparent: false,
    // PosX, NegX, PosY(top), NegY(bottom), PosZ, NegZ
    faces: [
      TextureLayer.GrassSide,
      TextureLayer.GrassSide,
      TextureLayer.GrassTop,
      TextureLayer.Dirt,
      TextureLayer.GrassSide,
      TextureLayer.GrassSide,
    ],
  },
  { id: DIRT, name: 'dirt', opaque: true, transparent: false, faces: uniform(TextureLayer.Dirt) },
  { id: STONE, name: 'stone', opaque: true, transparent: false, faces: uniform(TextureLayer.Stone) },
];
```

`src/blocks/BlockRegistry.ts`:
```ts
import type { BlockId } from '../core/types';
import { BLOCK_DEFS, TEXTURE_LAYER_COUNT, type BlockDef, type Face } from './blocks';

/** Single source of truth for block lookups. Built from the stable BLOCK_DEFS table. */
export class BlockRegistry {
  private readonly byId = new Map<BlockId, BlockDef>();

  constructor() {
    for (const def of BLOCK_DEFS) this.byId.set(def.id, def);
  }

  get(id: BlockId): BlockDef {
    const def = this.byId.get(id);
    if (!def) throw new Error(`Unknown block id: ${id}`);
    return def;
  }

  isOpaque(id: BlockId): boolean {
    return this.get(id).opaque;
  }

  /** Texture layer index for a given block face. */
  faceLayer(id: BlockId, face: Face): number {
    return this.get(id).faces[face];
  }

  /** Number of DataArrayTexture layers the renderer must allocate. */
  get layerCount(): number {
    return TEXTURE_LAYER_COUNT;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- blocks`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/blocks tests/blocks.test.ts
git commit -m "feat(blocks): add stable block registry and per-face texture layers"
```

---

## Task 3: ChunkData storage

**Files:**
- Create: `src/world/ChunkData.ts`
- Test: `tests/chunkData.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/chunkData.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { ChunkData } from '../src/world/ChunkData';
import { CHUNK_VOLUME } from '../src/core/constants';
import { AIR, STONE } from '../src/blocks/blocks';

describe('ChunkData', () => {
  it('starts full of air', () => {
    const c = new ChunkData(0, 0);
    expect(c.data.length).toBe(CHUNK_VOLUME);
    expect(c.get(3, 10, 5)).toBe(AIR);
  });

  it('stores and reads back a block', () => {
    const c = new ChunkData(2, -1);
    c.set(3, 10, 5, STONE);
    expect(c.get(3, 10, 5)).toBe(STONE);
    expect(c.cx).toBe(2);
    expect(c.cz).toBe(-1);
  });

  it('treats out-of-bounds reads as air', () => {
    const c = new ChunkData(0, 0);
    expect(c.get(-1, 0, 0)).toBe(AIR);
    expect(c.get(0, -1, 0)).toBe(AIR);
    expect(c.get(16, 0, 0)).toBe(AIR);
  });

  it('throws on out-of-bounds writes', () => {
    const c = new ChunkData(0, 0);
    expect(() => c.set(-1, 0, 0, STONE)).toThrow();
    expect(() => c.set(0, 1000, 0, STONE)).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- chunkData`
Expected: FAIL — cannot resolve `../src/world/ChunkData`.

- [ ] **Step 3: Write the implementation**

`src/world/ChunkData.ts`:
```ts
import { CHUNK_VOLUME } from '../core/constants';
import { voxelIndex, inChunkBounds } from '../core/coords';
import { AIR } from '../blocks/blocks';
import type { BlockId } from '../core/types';

/** Flat voxel storage for one chunk column (16 x WORLD_HEIGHT x 16). */
export class ChunkData {
  readonly cx: number;
  readonly cz: number;
  readonly data: Uint8Array;

  constructor(cx: number, cz: number, data?: Uint8Array) {
    this.cx = cx;
    this.cz = cz;
    this.data = data ?? new Uint8Array(CHUNK_VOLUME); // Uint8Array defaults to 0 = AIR
  }

  /** Reads a voxel; out-of-bounds returns AIR (callers rely on this for border meshing). */
  get(x: number, y: number, z: number): BlockId {
    if (!inChunkBounds(x, y, z)) return AIR;
    return this.data[voxelIndex(x, y, z)];
  }

  set(x: number, y: number, z: number, id: BlockId): void {
    if (!inChunkBounds(x, y, z)) {
      throw new RangeError(`ChunkData.set out of bounds: (${x}, ${y}, ${z})`);
    }
    this.data[voxelIndex(x, y, z)] = id;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- chunkData`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/world/ChunkData.ts tests/chunkData.test.ts
git commit -m "feat(world): add flat Uint8Array ChunkData storage"
```

---

## Task 4: Seeded PRNG

**Files:**
- Create: `src/core/math.ts`
- Test: `tests/math.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/math.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { mulberry32 } from '../src/core/math';

describe('mulberry32', () => {
  it('is deterministic for a given seed', () => {
    const a = mulberry32(12345);
    const b = mulberry32(12345);
    const seqA = [a(), a(), a(), a()];
    const seqB = [b(), b(), b(), b()];
    expect(seqA).toEqual(seqB);
  });

  it('produces values in [0, 1)', () => {
    const r = mulberry32(7);
    for (let i = 0; i < 1000; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('differs across seeds', () => {
    expect(mulberry32(1)()).not.toBe(mulberry32(2)());
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- math`
Expected: FAIL — cannot resolve `../src/core/math`.

- [ ] **Step 3: Write the implementation**

`src/core/math.ts`:
```ts
/**
 * Mulberry32 PRNG. Returns a function yielding deterministic floats in [0, 1)
 * for a given 32-bit seed. Used to seed simplex-noise so worldgen is reproducible.
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- math`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/math.ts tests/math.test.ts
git commit -m "feat(core): add seeded mulberry32 PRNG"
```

---

## Task 5: Generator interface, overlay seam & HeightmapGenerator

**Files:**
- Create: `src/worldgen/Generator.ts`, `src/worldgen/HeightmapGenerator.ts`
- Test: `tests/heightmapGenerator.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/heightmapGenerator.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { HeightmapGenerator } from '../src/worldgen/HeightmapGenerator';
import { applyOverlays } from '../src/worldgen/Generator';
import { ChunkData } from '../src/world/ChunkData';
import { CHUNK_SIZE_X, CHUNK_SIZE_Z, WORLD_HEIGHT } from '../src/core/constants';
import { AIR, GRASS, DIRT, STONE } from '../src/blocks/blocks';

const SEED = 1337;

function columnTop(c: ChunkData, x: number, z: number): number {
  for (let y = WORLD_HEIGHT - 1; y >= 0; y--) {
    if (c.get(x, y, z) !== AIR) return y;
  }
  return -1;
}

describe('HeightmapGenerator', () => {
  const gen = new HeightmapGenerator();

  it('is deterministic: same seed/coords -> identical bytes', () => {
    const a = gen.generateBaseChunk(SEED, 0, 0);
    const b = gen.generateBaseChunk(SEED, 0, 0);
    expect(Array.from(a.data)).toEqual(Array.from(b.data));
  });

  it('differs for a different chunk', () => {
    const a = gen.generateBaseChunk(SEED, 0, 0);
    const b = gen.generateBaseChunk(SEED, 1, 0);
    expect(Array.from(a.data)).not.toEqual(Array.from(b.data));
  });

  it('differs for a different seed', () => {
    const a = gen.generateBaseChunk(SEED, 0, 0);
    const b = gen.generateBaseChunk(SEED + 1, 0, 0);
    expect(Array.from(a.data)).not.toEqual(Array.from(b.data));
  });

  it('lays grass on top, dirt band beneath, stone below, air above', () => {
    const c = gen.generateBaseChunk(SEED, 0, 0);
    for (let x = 0; x < CHUNK_SIZE_X; x++) {
      for (let z = 0; z < CHUNK_SIZE_Z; z++) {
        const top = columnTop(c, x, z);
        expect(top).toBeGreaterThan(0);
        expect(top).toBeLessThan(WORLD_HEIGHT);
        expect(c.get(x, top, z)).toBe(GRASS);
        expect(c.get(x, top - 1, z)).toBe(DIRT);
        expect(c.get(x, top - 3, z)).toBe(DIRT);
        expect(c.get(x, top - 4, z)).toBe(STONE);
        expect(c.get(x, 0, z)).toBe(STONE);
        if (top + 1 < WORLD_HEIGHT) expect(c.get(x, top + 1, z)).toBe(AIR);
      }
    }
  });
});

describe('applyOverlays', () => {
  it('with an empty overlay list leaves the chunk unchanged', () => {
    const gen = new HeightmapGenerator();
    const c = gen.generateBaseChunk(SEED, 0, 0);
    const before = Array.from(c.data);
    applyOverlays(c, 0, 0, SEED, []);
    expect(Array.from(c.data)).toEqual(before);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- heightmapGenerator`
Expected: FAIL — cannot resolve `../src/worldgen/HeightmapGenerator`.

- [ ] **Step 3: Write the implementation**

`src/worldgen/Generator.ts`:
```ts
import type { WorldSeed } from '../core/types';
import type { ChunkData } from '../world/ChunkData';

/** Produces base terrain for a chunk. Pure & deterministic in (seed, cx, cz). */
export interface Generator {
  generateBaseChunk(seed: WorldSeed, cx: number, cz: number): ChunkData;
}

/** A deterministic structure stamp applied after base terrain (e.g. the P4 castle). */
export type Overlay = (chunk: ChunkData, cx: number, cz: number, seed: WorldSeed) => void;

/** Applies overlays in order. M1 passes an empty list (the seam exists; no stamps yet). */
export function applyOverlays(
  chunk: ChunkData,
  cx: number,
  cz: number,
  seed: WorldSeed,
  overlays: Overlay[],
): void {
  for (const overlay of overlays) overlay(chunk, cx, cz, seed);
}
```

`src/worldgen/HeightmapGenerator.ts`:
```ts
import { createNoise2D, type NoiseFunction2D } from 'simplex-noise';
import { ChunkData } from '../world/ChunkData';
import { mulberry32 } from '../core/math';
import { CHUNK_SIZE_X, CHUNK_SIZE_Z, WORLD_HEIGHT } from '../core/constants';
import { GRASS, DIRT, STONE } from '../blocks/blocks';
import type { Generator } from './Generator';
import type { WorldSeed } from '../core/types';

const BASE_HEIGHT = 64;
const AMPLITUDE = 24;
const FREQUENCY = 1 / 64;
const DIRT_BAND = 3; // dirt thickness between grass top and stone

/** One seeded 2D heightmap biome: stone fill, dirt band, grass top, air above. */
export class HeightmapGenerator implements Generator {
  private readonly noiseBySeed = new Map<WorldSeed, NoiseFunction2D>();

  private noise(seed: WorldSeed): NoiseFunction2D {
    let n = this.noiseBySeed.get(seed);
    if (!n) {
      n = createNoise2D(mulberry32(seed));
      this.noiseBySeed.set(seed, n);
    }
    return n;
  }

  generateBaseChunk(seed: WorldSeed, cx: number, cz: number): ChunkData {
    const chunk = new ChunkData(cx, cz);
    const noise2D = this.noise(seed);

    for (let x = 0; x < CHUNK_SIZE_X; x++) {
      for (let z = 0; z < CHUNK_SIZE_Z; z++) {
        const worldX = cx * CHUNK_SIZE_X + x;
        const worldZ = cz * CHUNK_SIZE_Z + z;
        const n = noise2D(worldX * FREQUENCY, worldZ * FREQUENCY); // [-1, 1]
        let height = Math.floor(BASE_HEIGHT + n * AMPLITUDE);
        if (height < 1) height = 1;
        if (height > WORLD_HEIGHT - 1) height = WORLD_HEIGHT - 1;

        for (let y = 0; y <= height; y++) {
          let block = STONE;
          if (y === height) block = GRASS;
          else if (y >= height - DIRT_BAND) block = DIRT;
          chunk.set(x, y, z, block);
        }
      }
    }
    return chunk;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- heightmapGenerator`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/worldgen tests/heightmapGenerator.test.ts
git commit -m "feat(worldgen): add Generator seam + seeded HeightmapGenerator"
```

---

## Task 6: MeshData type & naive face-culling mesher

**Files:**
- Create: `src/mesh/MeshTypes.ts`, `src/mesh/BasicMesher.ts`
- Test: `tests/basicMesher.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/basicMesher.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { ChunkData } from '../src/world/ChunkData';
import { BasicMesher } from '../src/mesh/BasicMesher';
import { BlockRegistry } from '../src/blocks/BlockRegistry';
import { GRASS, STONE, TextureLayer } from '../src/blocks/blocks';

const reg = new BlockRegistry();
const mesher = new BasicMesher(reg);

/** Vertices per face = 4; the mesher emits 6 indices (two triangles) per face. */
function faceCount(mesh: { indices: Uint32Array }): number {
  return mesh.indices.length / 6;
}

describe('BasicMesher', () => {
  it('emits 6 faces for a single isolated voxel', () => {
    const c = new ChunkData(0, 0);
    c.set(8, 10, 8, STONE);
    const mesh = mesher.mesh(c);
    expect(faceCount(mesh)).toBe(6);
    expect(mesh.positions.length).toBe(6 * 4 * 3);
    expect(mesh.normals.length).toBe(6 * 4 * 3);
    expect(mesh.uvs.length).toBe(6 * 4 * 2);
    expect(mesh.layers.length).toBe(6 * 4);
  });

  it('culls the shared face between two adjacent voxels (10 faces, not 12)', () => {
    const c = new ChunkData(0, 0);
    c.set(8, 10, 8, STONE);
    c.set(9, 10, 8, STONE);
    const mesh = mesher.mesh(c);
    expect(faceCount(mesh)).toBe(10);
  });

  it('emits nothing for an all-air chunk', () => {
    const c = new ChunkData(0, 0);
    const mesh = mesher.mesh(c);
    expect(faceCount(mesh)).toBe(0);
  });

  it('uses grass-top layer on the +Y face and grass-side on a side face', () => {
    const c = new ChunkData(0, 0);
    c.set(8, 10, 8, GRASS);
    const mesh = mesher.mesh(c);

    // Find the layer assigned where the face normal points +Y.
    const topLayer = layerForNormal(mesh, [0, 1, 0]);
    const sideLayer = layerForNormal(mesh, [1, 0, 0]);
    expect(topLayer).toBe(TextureLayer.GrassTop);
    expect(sideLayer).toBe(TextureLayer.GrassSide);
  });
});

function layerForNormal(
  mesh: { normals: Float32Array; layers: Float32Array },
  n: [number, number, number],
): number {
  for (let v = 0; v < mesh.layers.length; v++) {
    const nx = mesh.normals[v * 3];
    const ny = mesh.normals[v * 3 + 1];
    const nz = mesh.normals[v * 3 + 2];
    if (nx === n[0] && ny === n[1] && nz === n[2]) return mesh.layers[v];
  }
  throw new Error(`no vertex with normal ${n.join(',')}`);
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- basicMesher`
Expected: FAIL — cannot resolve `../src/mesh/BasicMesher`.

- [ ] **Step 3: Write the implementation**

`src/mesh/MeshTypes.ts`:
```ts
/** Renderer-agnostic mesh payload (no three.js). Consumed by render/buildChunkMesh. */
export interface MeshData {
  positions: Float32Array;
  normals: Float32Array;
  uvs: Float32Array;
  /** Texture array layer index per vertex. */
  layers: Float32Array;
  indices: Uint32Array;
}
```

`src/mesh/BasicMesher.ts`:
```ts
import { CHUNK_SIZE_X, CHUNK_SIZE_Z, WORLD_HEIGHT } from '../core/constants';
import { AIR, Face } from '../blocks/blocks';
import type { BlockRegistry } from '../blocks/BlockRegistry';
import type { ChunkData } from '../world/ChunkData';
import type { MeshData } from './MeshTypes';

interface FaceSpec {
  face: Face;
  /** Neighbor offset to test for visibility. */
  dir: [number, number, number];
  normal: [number, number, number];
  /** Four CCW corner offsets (unit cube, min corner at the voxel origin). */
  corners: [number, number, number][];
}

// Corners are wound CCW when viewed from outside so front faces point outward.
const FACES: FaceSpec[] = [
  {
    face: Face.PosX,
    dir: [1, 0, 0],
    normal: [1, 0, 0],
    corners: [
      [1, 0, 1],
      [1, 0, 0],
      [1, 1, 0],
      [1, 1, 1],
    ],
  },
  {
    face: Face.NegX,
    dir: [-1, 0, 0],
    normal: [-1, 0, 0],
    corners: [
      [0, 0, 0],
      [0, 0, 1],
      [0, 1, 1],
      [0, 1, 0],
    ],
  },
  {
    face: Face.PosY,
    dir: [0, 1, 0],
    normal: [0, 1, 0],
    corners: [
      [0, 1, 1],
      [1, 1, 1],
      [1, 1, 0],
      [0, 1, 0],
    ],
  },
  {
    face: Face.NegY,
    dir: [0, -1, 0],
    normal: [0, -1, 0],
    corners: [
      [0, 0, 0],
      [1, 0, 0],
      [1, 0, 1],
      [0, 0, 1],
    ],
  },
  {
    face: Face.PosZ,
    dir: [0, 0, 1],
    normal: [0, 0, 1],
    corners: [
      [0, 0, 1],
      [1, 0, 1],
      [1, 1, 1],
      [0, 1, 1],
    ],
  },
  {
    face: Face.NegZ,
    dir: [0, 0, -1],
    normal: [0, 0, -1],
    corners: [
      [1, 0, 0],
      [0, 0, 0],
      [0, 1, 0],
      [1, 1, 0],
    ],
  },
];

const FACE_UVS: [number, number][] = [
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 1],
];

/**
 * Naive per-voxel mesher: emits a quad for each solid-voxel face whose neighbor is
 * non-opaque. Out-of-chunk neighbors read as AIR (border faces acceptable in M1A).
 * Greedy merging + AO arrive in M1B.
 */
export class BasicMesher {
  constructor(private readonly registry: BlockRegistry) {}

  mesh(chunk: ChunkData): MeshData {
    const positions: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    const layers: number[] = [];
    const indices: number[] = [];
    let vertCount = 0;

    for (let y = 0; y < WORLD_HEIGHT; y++) {
      for (let z = 0; z < CHUNK_SIZE_Z; z++) {
        for (let x = 0; x < CHUNK_SIZE_X; x++) {
          const id = chunk.get(x, y, z);
          if (id === AIR) continue;

          for (const spec of FACES) {
            const nx = x + spec.dir[0];
            const ny = y + spec.dir[1];
            const nz = z + spec.dir[2];
            // Visible if the neighbor is not opaque (air, or out-of-bounds => air).
            if (this.registry.isOpaque(chunk.get(nx, ny, nz))) continue;

            const layer = this.registry.faceLayer(id, spec.face);
            for (let i = 0; i < 4; i++) {
              const c = spec.corners[i];
              positions.push(x + c[0], y + c[1], z + c[2]);
              normals.push(spec.normal[0], spec.normal[1], spec.normal[2]);
              uvs.push(FACE_UVS[i][0], FACE_UVS[i][1]);
              layers.push(layer);
            }
            indices.push(
              vertCount,
              vertCount + 1,
              vertCount + 2,
              vertCount,
              vertCount + 2,
              vertCount + 3,
            );
            vertCount += 4;
          }
        }
      }
    }

    return {
      positions: new Float32Array(positions),
      normals: new Float32Array(normals),
      uvs: new Float32Array(uvs),
      layers: new Float32Array(layers),
      indices: new Uint32Array(indices),
    };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- basicMesher`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/mesh tests/basicMesher.test.ts
git commit -m "feat(mesh): add naive face-culling mesher producing MeshData"
```

---

## Task 7: Procedural DataArrayTexture (render, three.js)

**Files:**
- Create: `src/render/TextureArray.ts`

No unit test (touches three.js / WebGL types); verified visually in Task 10.

- [ ] **Step 1: Write the implementation**

`src/render/TextureArray.ts`:
```ts
import {
  DataArrayTexture,
  RGBAFormat,
  UnsignedByteType,
  NearestFilter,
  type DataArrayTexture as DataArrayTextureType,
} from 'three';
import { TEXTURE_LAYER_COUNT, TextureLayer } from '../blocks/blocks';
import { mulberry32 } from '../core/math';

const TILE = 16; // px per tile

/** Fills one TILE×TILE RGBA layer in `out` at `layerIndex`, with a flat base + speckle. */
function paintLayer(
  out: Uint8Array,
  layerIndex: number,
  base: [number, number, number],
  speckle: number,
): void {
  const rng = mulberry32(0xc0ffee + layerIndex);
  const offset = layerIndex * TILE * TILE * 4;
  for (let i = 0; i < TILE * TILE; i++) {
    const d = Math.floor((rng() - 0.5) * 2 * speckle);
    const p = offset + i * 4;
    out[p] = clamp(base[0] + d);
    out[p + 1] = clamp(base[1] + d);
    out[p + 2] = clamp(base[2] + d);
    out[p + 3] = 255;
  }
}

function clamp(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}

/** Builds the procedural block-face texture array (one layer per TextureLayer). */
export function createTextureArray(): DataArrayTextureType {
  const data = new Uint8Array(TILE * TILE * 4 * TEXTURE_LAYER_COUNT);
  paintLayer(data, TextureLayer.GrassTop, [86, 152, 60], 18);
  paintLayer(data, TextureLayer.GrassSide, [120, 110, 70], 18);
  paintLayer(data, TextureLayer.Dirt, [134, 96, 62], 20);
  paintLayer(data, TextureLayer.Stone, [128, 128, 132], 22);

  const tex = new DataArrayTexture(data, TILE, TILE, TEXTURE_LAYER_COUNT);
  tex.format = RGBAFormat;
  tex.type = UnsignedByteType;
  tex.magFilter = NearestFilter;
  tex.minFilter = NearestFilter;
  tex.needsUpdate = true;
  return tex;
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/render/TextureArray.ts
git commit -m "feat(render): add procedural DataArrayTexture for block faces"
```

---

## Task 8: Chunk material & MeshData→THREE.Mesh

**Files:**
- Create: `src/render/ChunkMaterial.ts`, `src/render/buildChunkMesh.ts`

- [ ] **Step 1: Write the material**

`src/render/ChunkMaterial.ts`:
```ts
import {
  RawShaderMaterial,
  GLSL3,
  Vector3,
  type DataArrayTexture,
} from 'three';

const vertexShader = /* glsl */ `
precision highp float;
precision highp int;

uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
uniform mat3 normalMatrix;

in vec3 position;
in vec3 normal;
in vec2 uv;
in float layer;

out vec2 vUv;
out float vLayer;
out vec3 vNormal;
out vec3 vViewPos;

void main() {
  vUv = uv;
  vLayer = layer;
  vNormal = normalize(normalMatrix * normal);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vViewPos = mv.xyz;
  gl_Position = projectionMatrix * mv;
}
`;

const fragmentShader = /* glsl */ `
precision highp float;
precision highp int;
precision highp sampler2DArray;

uniform sampler2DArray uTex;
uniform vec3 uLightDir;
uniform vec3 uFogColor;
uniform float uFogNear;
uniform float uFogFar;

in vec2 vUv;
in float vLayer;
in vec3 vNormal;
in vec3 vViewPos;

out vec4 fragColor;

void main() {
  vec3 base = texture(uTex, vec3(vUv, vLayer)).rgb;
  float diff = max(dot(normalize(vNormal), normalize(uLightDir)), 0.0);
  float light = 0.45 + 0.55 * diff;
  vec3 color = base * light;
  float dist = length(vViewPos);
  float fog = clamp((dist - uFogNear) / (uFogFar - uFogNear), 0.0, 1.0);
  color = mix(color, uFogColor, fog);
  fragColor = vec4(color, 1.0);
}
`;

export function createChunkMaterial(tex: DataArrayTexture): RawShaderMaterial {
  return new RawShaderMaterial({
    glslVersion: GLSL3,
    uniforms: {
      uTex: { value: tex },
      uLightDir: { value: new Vector3(0.5, 1.0, 0.3).normalize() },
      uFogColor: { value: new Vector3(0.529, 0.725, 0.91) },
      uFogNear: { value: 40 },
      uFogFar: { value: 220 },
    },
    vertexShader,
    fragmentShader,
  });
}
```

- [ ] **Step 2: Write the geometry builder**

`src/render/buildChunkMesh.ts`:
```ts
import {
  BufferGeometry,
  BufferAttribute,
  Mesh,
  type Material,
} from 'three';
import type { MeshData } from '../mesh/MeshTypes';

/** Converts renderer-agnostic MeshData into a THREE.Mesh with the given material. */
export function buildChunkMesh(mesh: MeshData, material: Material): Mesh {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(mesh.positions, 3));
  geometry.setAttribute('normal', new BufferAttribute(mesh.normals, 3));
  geometry.setAttribute('uv', new BufferAttribute(mesh.uvs, 2));
  geometry.setAttribute('layer', new BufferAttribute(mesh.layers, 1));
  geometry.setIndex(new BufferAttribute(mesh.indices, 1));
  return new Mesh(geometry, material);
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/render/ChunkMaterial.ts src/render/buildChunkMesh.ts
git commit -m "feat(render): add array-texture shader material and MeshData->Mesh builder"
```

---

## Task 9: Renderer (scene, camera, orbit, loop)

**Files:**
- Create: `src/render/Renderer.ts`
- Install: `OrbitControls` ships with three; imported from `three/examples/jsm/controls/OrbitControls.js`.

- [ ] **Step 1: Write the renderer**

`src/render/Renderer.ts`:
```ts
import {
  Scene,
  PerspectiveCamera,
  WebGLRenderer,
  Color,
  Object3D,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

/** Owns the three.js scene/camera/renderer and a simple orbit camera + render loop. */
export class Renderer {
  readonly scene = new Scene();
  readonly camera: PerspectiveCamera;
  private readonly renderer: WebGLRenderer;
  private readonly controls: OrbitControls;

  constructor(canvas: HTMLCanvasElement) {
    this.scene.background = new Color(0x87b9e8);

    this.camera = new PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 1000);
    this.camera.position.set(24, 90, 48);

    this.renderer = new WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setSize(window.innerWidth, window.innerHeight);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.target.set(8, 64, 8);
    this.controls.update();

    window.addEventListener('resize', () => this.onResize());
  }

  add(object: Object3D): void {
    this.scene.add(object);
  }

  start(): void {
    const tick = (): void => {
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  private onResize(): void {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors. (If `three/examples/jsm` types are missing, confirm `@types/three` is installed — it ships these.)

- [ ] **Step 3: Commit**

```bash
git add src/render/Renderer.ts
git commit -m "feat(render): add scene/camera/orbit renderer with render loop"
```

---

## Task 10: Compose & render one chunk

**Files:**
- Create: `src/app/Game.ts`
- Modify: `src/app/main.ts`

- [ ] **Step 1: Write the composition root**

`src/app/Game.ts`:
```ts
import { Renderer } from '../render/Renderer';
import { createTextureArray } from '../render/TextureArray';
import { createChunkMaterial } from '../render/ChunkMaterial';
import { buildChunkMesh } from '../render/buildChunkMesh';
import { BlockRegistry } from '../blocks/BlockRegistry';
import { HeightmapGenerator } from '../worldgen/HeightmapGenerator';
import { applyOverlays, type Overlay } from '../worldgen/Generator';
import { BasicMesher } from '../mesh/BasicMesher';
import type { WorldSeed } from '../core/types';

const SEED: WorldSeed = 1337;
const OVERLAYS: Overlay[] = []; // M1: empty (castle is a P4 overlay)

/** Composition root: generate one chunk, mesh it, upload it, render it. */
export class Game {
  static boot(canvas: HTMLCanvasElement): void {
    const registry = new BlockRegistry();
    const generator = new HeightmapGenerator();
    const mesher = new BasicMesher(registry);

    const chunk = generator.generateBaseChunk(SEED, 0, 0);
    applyOverlays(chunk, 0, 0, SEED, OVERLAYS);
    const meshData = mesher.mesh(chunk);

    const renderer = new Renderer(canvas);
    const texture = createTextureArray();
    const material = createChunkMaterial(texture);
    const mesh = buildChunkMesh(meshData, material);
    renderer.add(mesh);
    renderer.start();
  }
}
```

- [ ] **Step 2: Wire the entry point**

Replace `src/app/main.ts` with:
```ts
import { Game } from './Game';

const canvas = document.getElementById('app');
if (!(canvas instanceof HTMLCanvasElement)) {
  throw new Error('Missing #app canvas element');
}
Game.boot(canvas);
```

- [ ] **Step 3: Full gate — lint, test, type-check**

Run: `npm run lint && npm run test && npx tsc --noEmit`
Expected: lint clean, all tests pass, no type errors.

- [ ] **Step 4: Manual visual verification (Edgar)**

Run: `npm run dev`
Open the printed localhost URL. **Ask Edgar to confirm:** a single textured, hilly chunk renders — green grass tops, brown dirt/grass sides, gray stone where exposed — and the orbit controls (drag to rotate, scroll to zoom) work. Edgar judges the render; do not self-assess.

- [ ] **Step 5: Commit**

```bash
git add src/app/Game.ts src/app/main.ts
git commit -m "feat(app): render one generated chunk (M1A done)"
```

---

## Self-Review

**Spec coverage (M1A scope):**
- Vite+TS(strict)+three.js skeleton → Task 0.
- `BlockRegistry` (stable, append-only ids) → Task 2.
- `ChunkData` (flat `Uint8Array`, voxel-index convention) → Tasks 1 + 3.
- Seeded `HeightmapGenerator` (deterministic, one biome) → Tasks 4 + 5.
- Generator base+overlay seam (empty overlay list) → Task 5.
- Basic mesher (greedy/AO deferred to M1B) → Task 6.
- `DataArrayTexture` material → Tasks 7 + 8.
- Render a single generated chunk → Tasks 9 + 10.
- Pure-logic Vitest tests (coords/index, registry, chunk, worldgen determinism, mesher counts/culling/layers) → Tasks 1–6.
- Opaque-only, no transparency/streaming/player/edit/persistence → correctly out of M1A scope (M1B–M1E).

**Placeholder scan:** No TBD/TODO; every code step shows full code; every test step shows full test.

**Type consistency:** `voxelIndex/indexToLocal/inChunkBounds`, `ChunkData.get/set`, `BlockRegistry.faceLayer/isOpaque/layerCount`, `Face` enum (0..5), `TextureLayer`, `Generator.generateBaseChunk(seed,cx,cz)`, `applyOverlays(chunk,cx,cz,seed,overlays)`, `MeshData{positions,normals,uvs,layers,indices}`, `BasicMesher.mesh(chunk)`, `createTextureArray()`, `createChunkMaterial(tex)`, `buildChunkMesh(meshData, material)` — names are consistent across all tasks and the `layer` geometry attribute matches the shader's `in float layer`.
