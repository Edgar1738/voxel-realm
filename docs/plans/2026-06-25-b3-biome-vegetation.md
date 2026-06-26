# B3 — Biome Vegetation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make vegetation biome-appropriate — dense oaks in forests, sparse oaks in plains/tundra/low mountains, and cacti (no trees) in deserts — with a new `CACTUS` block.

**Architecture:** `scatterTrees` becomes biome-aware. Because the `Overlay` signature is `(chunk, cx, cz, seed)` (no context), it looks up a `BiomeMap` via a small module-level per-seed cache (deterministic). Per candidate column it reads the biome and the surface block: deserts grow cacti on sand; other biomes grow oaks on grass (or tundra snow), with density varying by biome.

**Tech Stack:** TypeScript (strict), three.js (texture only), Vitest. Builds on B1/B2.

---

## File Structure

```txt
src/blocks/blocks.ts        MODIFY  + CACTUS block
src/render/TextureArray.ts  MODIFY  + cactus tile
src/worldgen/TreeScatterer.ts MODIFY  biome-aware oaks + cacti
tests/
  blocks.test.ts            MODIFY  + CACTUS
  treeScatterer.test.ts     MODIFY  biome-correct vegetation
```

---

## Task 1: CACTUS block

**Files:**
- Modify: `src/blocks/blocks.ts`, `src/render/TextureArray.ts`
- Test: `tests/blocks.test.ts`

- [ ] **Step 1: Update the failing test**

In `tests/blocks.test.ts`, add `CACTUS` to the import, an id assertion, and bump the layer
count. Add to the ids describe:
```ts
  it('has cactus at id 10', () => {
    expect(CACTUS).toBe(10);
  });
```
Add to the registry describe:
```ts
  it('treats cactus as opaque', () => {
    expect(reg.isOpaque(CACTUS)).toBe(true);
  });
```
Change the layer-count assertion to `11`:
```ts
    expect(reg.layerCount).toBe(11);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run blocks`
Expected: FAIL — `CACTUS` / `TextureLayer.Cactus` undefined.

- [ ] **Step 3: Update blocks.ts**

Add the id (append-only, after `SNOW`):
```ts
export const CACTUS: BlockId = 10;
```
Extend `TextureLayer` and count:
```ts
  Snow: 9,
  Cactus: 10,
} as const;

export const TEXTURE_LAYER_COUNT = 11;
```
Append to `BLOCK_DEFS`:
```ts
  {
    id: CACTUS,
    name: 'cactus',
    opaque: true,
    transparent: false,
    faces: uniform(TextureLayer.Cactus),
  },
```

- [ ] **Step 4: Paint the cactus tile**

In `src/render/TextureArray.ts`, after the snow `paintLayer` line:
```ts
  paintLayer(data, TextureLayer.Cactus, [60, 110, 60], 16); // cactus green
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run blocks`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/blocks/blocks.ts src/render/TextureArray.ts tests/blocks.test.ts
git commit -m "feat(blocks): add cactus block (id 10)"
```

---

## Task 2: Biome-aware scatterTrees

**Files:**
- Modify: `src/worldgen/TreeScatterer.ts`
- Test: `tests/treeScatterer.test.ts`

- [ ] **Step 1: Update the failing test**

Replace `tests/treeScatterer.test.ts` with:
```ts
import { describe, it, expect } from 'vitest';
import { scatterTrees } from '../src/worldgen/TreeScatterer';
import { createWorldGenerator } from '../src/worldgen/LayeredGenerator';
import { BiomeMap, Biome } from '../src/worldgen/BiomeMap';
import { CHUNK_SIZE_X, CHUNK_SIZE_Z, WORLD_HEIGHT } from '../src/core/constants';
import { GRASS, SNOW, SAND, WOOD, LEAVES, CACTUS } from '../src/blocks/blocks';
import type { ChunkData } from '../src/world/ChunkData';

const SEED = 1337;
const gen = createWorldGenerator();
const biomes = new BiomeMap(SEED);

function grownChunk(cx: number, cz: number): ChunkData {
  const c = gen.generateBaseChunk(SEED, cx, cz);
  scatterTrees(c, cx, cz, SEED);
  return c;
}

/** Lowest y of a given block in a column, or -1. */
function lowestOf(c: ChunkData, x: number, z: number, id: number): number {
  for (let y = 0; y < WORLD_HEIGHT; y++) if (c.get(x, y, z) === id) return y;
  return -1;
}

describe('scatterTrees (biome-aware)', () => {
  it('is deterministic for the same chunk/seed', () => {
    const a = grownChunk(2, -1);
    const b = grownChunk(2, -1);
    expect(Array.from(a.data)).toEqual(Array.from(b.data));
  });

  it('grows oaks (on grass/tundra-snow) and cacti (on desert sand) across a region', () => {
    let woodSeen = false;
    let cactusSeen = false;
    let cactusInDesert = true;
    let oakSupportOk = true;

    for (let cx = -6; cx < 6; cx++) {
      for (let cz = -6; cz < 6; cz++) {
        const c = grownChunk(cx, cz);
        for (let x = 0; x < CHUNK_SIZE_X; x++) {
          for (let z = 0; z < CHUNK_SIZE_Z; z++) {
            const wood = lowestOf(c, x, z, WOOD);
            if (wood > 0) {
              woodSeen = true;
              const support = c.get(x, wood - 1, z);
              if (support !== GRASS && support !== SNOW) oakSupportOk = false;
            }
            const cactus = lowestOf(c, x, z, CACTUS);
            if (cactus > 0) {
              cactusSeen = true;
              if (c.get(x, cactus - 1, z) !== SAND) cactusInDesert = false;
              if (biomes.biomeAt(cx * CHUNK_SIZE_X + x, cz * CHUNK_SIZE_Z + z) !== Biome.Desert)
                cactusInDesert = false;
            }
          }
        }
      }
    }

    expect(woodSeen).toBe(true);
    expect(cactusSeen).toBe(true);
    expect(oakSupportOk).toBe(true); // oaks only root on grass or tundra snow
    expect(cactusInDesert).toBe(true); // cacti only on desert sand
  });

  it('never grows oaks in the desert (cacti only there)', () => {
    let oakInDesert = false;
    for (let cx = -6; cx < 6; cx++) {
      for (let cz = -6; cz < 6; cz++) {
        const c = grownChunk(cx, cz);
        for (let x = 0; x < CHUNK_SIZE_X; x++) {
          for (let z = 0; z < CHUNK_SIZE_Z; z++) {
            if (
              lowestOf(c, x, z, LEAVES) > 0 &&
              biomes.biomeAt(cx * CHUNK_SIZE_X + x, cz * CHUNK_SIZE_Z + z) === Biome.Desert
            )
              oakInDesert = true;
          }
        }
      }
    }
    expect(oakInDesert).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run treeScatterer`
Expected: FAIL — current `scatterTrees` places oaks on grass regardless of biome and never
grows cacti.

- [ ] **Step 3: Update the implementation**

Replace `src/worldgen/TreeScatterer.ts` with:
```ts
import { mulberry32 } from '../core/math';
import { CHUNK_SIZE_X, CHUNK_SIZE_Z, WORLD_HEIGHT } from '../core/constants';
import { AIR, GRASS, SNOW, SAND, WOOD, LEAVES, CACTUS } from '../blocks/blocks';
import { BiomeMap, Biome } from './BiomeMap';
import type { Overlay } from './Generator';
import type { ChunkData } from '../world/ChunkData';
import type { WorldSeed } from '../core/types';

const CANOPY_RADIUS = 2; // keeps the whole tree inside one chunk
const ATTEMPTS = 6; // candidate spots per chunk
const FOREST_CHANCE = 0.85; // dense
const SPARSE_CHANCE = 0.3; // plains / tundra / low mountains
const CACTUS_CHANCE = 0.5;

/** Per-seed BiomeMap cache (the Overlay signature has no context to share one). */
const biomeCache = new Map<WorldSeed, BiomeMap>();
function biomesFor(seed: WorldSeed): BiomeMap {
  let m = biomeCache.get(seed);
  if (!m) {
    m = new BiomeMap(seed);
    biomeCache.set(seed, m);
  }
  return m;
}

/** Per-chunk deterministic RNG, mixing the world seed with chunk coords. */
function chunkRng(seed: WorldSeed, cx: number, cz: number): () => number {
  const h = (Math.imul(seed, 73856093) ^ Math.imul(cx, 19349663) ^ Math.imul(cz, 83492791)) >>> 0;
  return mulberry32(h);
}

/** Finds the surface (topmost non-air) y in a column, or -1 if empty. */
function surfaceY(chunk: ChunkData, x: number, z: number): number {
  for (let y = WORLD_HEIGHT - 1; y >= 0; y--) if (chunk.get(x, y, z) !== AIR) return y;
  return -1;
}

/** Stamps a small oak: a wood trunk capped by a leaf canopy (radius 2 then radius 1). */
function growOak(chunk: ChunkData, x: number, z: number, base: number, trunkHeight: number): void {
  const top = base + trunkHeight - 1;
  const placeLeaves = (cy: number, radius: number): void => {
    if (cy >= WORLD_HEIGHT) return;
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dz = -radius; dz <= radius; dz++) {
        if (chunk.get(x + dx, cy, z + dz) === AIR) chunk.set(x + dx, cy, z + dz, LEAVES);
      }
    }
  };
  placeLeaves(top - 1, 2);
  placeLeaves(top, 2);
  placeLeaves(top + 1, 1);
  placeLeaves(top + 2, 1);
  for (let y = base; y <= top && y < WORLD_HEIGHT; y++) chunk.set(x, y, z, WOOD);
}

/** Stamps a 1-wide cactus column. */
function growCactus(chunk: ChunkData, x: number, z: number, base: number, height: number): void {
  for (let y = base; y < base + height && y < WORLD_HEIGHT; y++) chunk.set(x, y, z, CACTUS);
}

/**
 * Deterministic biome-aware vegetation overlay: cacti on desert sand, oaks on grass (or
 * tundra snow). Density varies by biome (dense forests, sparse elsewhere). Only places where
 * the canopy fits inside the chunk and within the world height.
 */
export const scatterTrees: Overlay = (chunk, cx, cz, seed) => {
  const rng = chunkRng(seed, cx, cz);
  const biomes = biomesFor(seed);

  for (let t = 0; t < ATTEMPTS; t++) {
    const x = CANOPY_RADIUS + Math.floor(rng() * (CHUNK_SIZE_X - 2 * CANOPY_RADIUS));
    const z = CANOPY_RADIUS + Math.floor(rng() * (CHUNK_SIZE_Z - 2 * CANOPY_RADIUS));
    const roll = rng();

    const surface = surfaceY(chunk, x, z);
    if (surface < 0) continue;
    const surfaceBlock = chunk.get(x, surface, z);
    const base = surface + 1;
    const biome = biomes.biomeAt(cx * CHUNK_SIZE_X + x, cz * CHUNK_SIZE_Z + z);

    if (biome === Biome.Desert) {
      if (surfaceBlock !== SAND || roll >= CACTUS_CHANCE) continue;
      const height = 1 + Math.floor(rng() * 3); // 1..3
      if (base + height >= WORLD_HEIGHT) continue;
      growCactus(chunk, x, z, base, height);
    } else {
      const onSoil = surfaceBlock === GRASS || (biome === Biome.Tundra && surfaceBlock === SNOW);
      const chance = biome === Biome.Forest ? FOREST_CHANCE : SPARSE_CHANCE;
      if (!onSoil || roll >= chance) continue;
      const trunkHeight = 4 + Math.floor(rng() * 3); // 4..6
      if (base + trunkHeight + 2 >= WORLD_HEIGHT) continue;
      growOak(chunk, x, z, base, trunkHeight);
    }
  }
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run treeScatterer`
Expected: PASS (3 tests). If "grows ... cacti" fails because the sampled region happens to
lack a desert, widen the loop range (e.g. `-8..8`); deserts are common at this scale.

- [ ] **Step 5: Full gate**

Run: `npm run lint && npx vitest run && npx tsc --noEmit && npm run build`
Expected: lint clean, all tests pass, no type errors, build succeeds.

- [ ] **Step 6: Browser verification (Edgar)**

Run: `npm run dev`
**Ask Edgar to confirm:** forests are densely treed, plains have scattered oaks, deserts have
cacti and no trees, tundra has sparse (snowy-ground) oaks, and snow-capped peaks stay bare.

- [ ] **Step 7: Commit**

```bash
git add src/worldgen/TreeScatterer.ts tests/treeScatterer.test.ts
git commit -m "feat(worldgen): biome-aware vegetation — forest/plains/tundra oaks, desert cacti (B3 done)"
```

---

## Self-Review

**Spec coverage (B3 scope):**
- `CACTUS` block (append-only id 10) + texture → Task 1.
- Biome-aware density (forest dense, plains/tundra/mountains sparse) → Task 2 (`FOREST_CHANCE`
  vs `SPARSE_CHANCE`).
- Desert cacti, no trees → Task 2 (desert branch grows cacti on sand; oak branch skipped).
- Oaks on grass or tundra snow → Task 2 (`onSoil` check); snow-capped peaks (non-tundra snow)
  stay bare.
- Deterministic + intra-chunk (canopy fits) → `chunkRng` + `CANOPY_RADIUS` margin; determinism
  test.
- Out of scope: spruce trees, flowers, biome grass tint — correctly absent (deferred).

**Placeholder scan:** No TBD/TODO. Every code step shows full code or an exact, located edit.

**Type consistency:** `CACTUS`/`TextureLayer.Cactus`/`TEXTURE_LAYER_COUNT = 11` (Task 1) feed
`BlockRegistry.layerCount` and the texture buffer. `scatterTrees` keeps the `Overlay` type
`(chunk, cx, cz, seed) => void` (so `Game`'s `OVERLAYS` and `applyOverlays` are unchanged) and
reads biomes via the module-level `biomesFor(seed)` cache returning a `BiomeMap` (which
implements `BiomeSource`). Block ids `GRASS`/`SNOW`/`SAND`/`WOOD`/`LEAVES`/`CACTUS` and `Biome`
are imported in both the stage and the test. `chunkRng` uses `Math.imul`/`>>> 0` for a valid
uint32 to `mulberry32`, matching E4/E2/E3.
