# B2 — Biome Surface Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Paint biome-appropriate surfaces — sand deserts, snowy tundra, snow-capped peaks — by making `SurfacePainter` biome-aware, with a new `SNOW` block.

**Architecture:** Thread the biome source through `GenContext` (a `BiomeSource` interface implemented by `BiomeMap`) so every stage shares one source and tests can inject a stub. `LayeredGenerator` supplies it; `HeightField` reads it from the context (instead of its own copy). `SurfacePainter` then picks the cap/band per column from biome + altitude + sea level. Adds `SNOW` block + texture.

**Tech Stack:** TypeScript (strict), three.js (texture only), Vitest. Builds on B1.

---

## File Structure

```txt
src/worldgen/
  BiomeMap.ts          MODIFY  + BiomeSource interface (implemented by BiomeMap)
  TerrainStage.ts      MODIFY  GenContext gains `biomes: BiomeSource`
  LayeredGenerator.ts  MODIFY  build + share BiomeMap, set ctx.biomes
  HeightField.ts       MODIFY  read biomes from ctx (drop its own BiomeMap)
  SurfacePainter.ts    MODIFY  biome-aware caps (desert sand, tundra/altitude snow)
src/blocks/blocks.ts   MODIFY  + SNOW block
src/render/TextureArray.ts MODIFY + snow tile
tests/
  surfacePainter.test.ts MODIFY  biome-injected cap cases
  heightField.test.ts    MODIFY  ctx helper supplies biomes
  caveCarver.test.ts     MODIFY  ctx helper supplies biomes
  waterFiller.test.ts    MODIFY  ctx helper supplies biomes
  blocks.test.ts         MODIFY  + SNOW
```

---

## Task 1: Thread BiomeSource through GenContext (no behavior change)

**Files:**
- Modify: `src/worldgen/BiomeMap.ts`, `src/worldgen/TerrainStage.ts`, `src/worldgen/LayeredGenerator.ts`, `src/worldgen/HeightField.ts`
- Modify (test ctx helpers): `tests/heightField.test.ts`, `tests/caveCarver.test.ts`, `tests/waterFiller.test.ts`

- [ ] **Step 1: Add the BiomeSource interface**

In `src/worldgen/BiomeMap.ts`, add the interface above the class and declare the class
implements it:
```ts
/** What stages need from the biome system: classification + blended terrain params. */
export interface BiomeSource {
  biomeAt(worldX: number, worldZ: number): Biome;
  blendedTerrain(worldX: number, worldZ: number): { amplitude: number; baseOffset: number };
}
```
Change the class declaration to:
```ts
export class BiomeMap implements BiomeSource {
```

- [ ] **Step 2: Add `biomes` to GenContext**

In `src/worldgen/TerrainStage.ts`:
```ts
import type { BiomeSource } from './BiomeMap';
```
and add to `GenContext`:
```ts
  /** Biome classification + terrain params, shared across stages. */
  biomes: BiomeSource;
```

- [ ] **Step 3: Supply it from LayeredGenerator**

In `src/worldgen/LayeredGenerator.ts`, import `BiomeMap`, memoize one per seed, and set it on
the context:
```ts
import { BiomeMap } from './BiomeMap';
```
Add a field and use it in `generateBaseChunk`:
```ts
export class LayeredGenerator implements Generator {
  private readonly biomesBySeed = new Map<WorldSeed, BiomeMap>();

  constructor(
    private readonly stages: TerrainStage[],
    private readonly seaLevel: number,
  ) {}

  generateBaseChunk(seed: WorldSeed, cx: number, cz: number): ChunkData {
    const chunk = new ChunkData(cx, cz);
    let biomes = this.biomesBySeed.get(seed);
    if (!biomes) {
      biomes = new BiomeMap(seed);
      this.biomesBySeed.set(seed, biomes);
    }
    const ctx: GenContext = {
      seed,
      cx,
      cz,
      heights: new Int16Array(CHUNK_AREA),
      seaLevel: this.seaLevel,
      biomes,
    };
    for (const stage of this.stages) stage.apply(chunk, ctx);
    return chunk;
  }
}
```

- [ ] **Step 4: HeightField reads biomes from ctx**

Replace `src/worldgen/HeightField.ts` with (shape stays memoized; biomes come from ctx):
```ts
import { createNoise2D, type NoiseFunction2D } from 'simplex-noise';
import { mulberry32 } from '../core/math';
import { CHUNK_SIZE_X, CHUNK_SIZE_Z, WORLD_HEIGHT } from '../core/constants';
import { fbm2D, type FbmOptions } from './fbm';
import type { TerrainStage, GenContext } from './TerrainStage';
import type { ChunkData } from '../world/ChunkData';
import type { WorldSeed } from '../core/types';

const BASE_HEIGHT = 64;
const SHAPE: FbmOptions = { octaves: 4, persistence: 0.5, lacunarity: 2, frequency: 1 / 192 };

/**
 * Seeded heightmap: an fBm "shape" channel scaled by biome-blended amplitude/base (from the
 * shared BiomeSource in the context), so each biome has its own relief with smooth borders.
 */
export class HeightField implements TerrainStage {
  private readonly shapeBySeed = new Map<WorldSeed, NoiseFunction2D>();

  private shape(seed: WorldSeed): NoiseFunction2D {
    let n = this.shapeBySeed.get(seed);
    if (!n) {
      n = createNoise2D(mulberry32(seed));
      this.shapeBySeed.set(seed, n);
    }
    return n;
  }

  apply(_chunk: ChunkData, ctx: GenContext): void {
    const shape = this.shape(ctx.seed);
    for (let x = 0; x < CHUNK_SIZE_X; x++) {
      for (let z = 0; z < CHUNK_SIZE_Z; z++) {
        const worldX = ctx.cx * CHUNK_SIZE_X + x;
        const worldZ = ctx.cz * CHUNK_SIZE_Z + z;

        const s = fbm2D(shape, worldX, worldZ, SHAPE); // [-1, 1]
        const { amplitude, baseOffset } = ctx.biomes.blendedTerrain(worldX, worldZ);

        let height = Math.floor(BASE_HEIGHT + baseOffset + s * amplitude);
        if (height < 1) height = 1;
        if (height > WORLD_HEIGHT - 1) height = WORLD_HEIGHT - 1;
        ctx.heights[x + CHUNK_SIZE_X * z] = height;
      }
    }
  }
}
```

- [ ] **Step 5: Update test ctx helpers to supply `biomes`**

`tests/heightField.test.ts` — the `ctx` helper needs a real BiomeMap (the biome-relief test
depends on it). `BiomeMap` is already imported; change the helper:
```ts
function ctx(seed: number, cx: number, cz: number): GenContext {
  return {
    seed,
    cx,
    cz,
    heights: new Int16Array(CHUNK_AREA),
    seaLevel: SEA_LEVEL,
    biomes: new BiomeMap(seed),
  };
}
```

`tests/caveCarver.test.ts` and `tests/waterFiller.test.ts` — biome is irrelevant to these, so
inject a trivial Plains stub. Add this import to each:
```ts
import { Biome, type BiomeSource } from '../src/worldgen/BiomeMap';

const PLAINS: BiomeSource = {
  biomeAt: () => Biome.Plains,
  blendedTerrain: () => ({ amplitude: 8, baseOffset: 0 }),
};
```
and add `biomes: PLAINS,` to the `GenContext` object built in each file's `ctx`/`paintedChunk`
helper.

- [ ] **Step 6: Run the worldgen suites**

Run: `npx vitest run heightField caveCarver waterFiller layeredGenerator chunkManager biomeMap surfacePainter`
Expected: PASS — this task is a pure refactor (terrain unchanged; ctx now carries the biome
source). `surfacePainter` still passes because its current code ignores biomes (changed in
Task 3).

- [ ] **Step 7: Commit**

```bash
git add src/worldgen tests/heightField.test.ts tests/caveCarver.test.ts tests/waterFiller.test.ts
git commit -m "refactor(worldgen): share BiomeSource through GenContext"
```

---

## Task 2: SNOW block

**Files:**
- Modify: `src/blocks/blocks.ts`, `src/render/TextureArray.ts`
- Test: `tests/blocks.test.ts`

- [ ] **Step 1: Update the failing test**

In `tests/blocks.test.ts`, add `SNOW` to the import, then add an id assertion and bump the
layer count. Add to the ids describe:
```ts
  it('has snow at id 9', () => {
    expect(SNOW).toBe(9);
  });
```
Add to the registry describe:
```ts
  it('treats snow as opaque', () => {
    expect(reg.isOpaque(SNOW)).toBe(true);
  });
```
Change the layer-count assertion to `10`:
```ts
    expect(reg.layerCount).toBe(10);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run blocks`
Expected: FAIL — `SNOW` / `TextureLayer.Snow` undefined.

- [ ] **Step 3: Update blocks.ts**

Add the id (after `WATER`, append-only):
```ts
export const SNOW: BlockId = 9;
```
Extend `TextureLayer` and count:
```ts
  Sand: 7,
  Water: 8,
  Snow: 9,
} as const;

export const TEXTURE_LAYER_COUNT = 10;
```
Append to `BLOCK_DEFS`:
```ts
  { id: SNOW, name: 'snow', opaque: true, transparent: false, faces: uniform(TextureLayer.Snow) },
```

- [ ] **Step 4: Paint the snow tile**

In `src/render/TextureArray.ts`, after the water `paintLayer` line:
```ts
  paintLayer(data, TextureLayer.Snow, [236, 240, 245], 6); // near-white snow
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run blocks`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/blocks/blocks.ts src/render/TextureArray.ts tests/blocks.test.ts
git commit -m "feat(blocks): add snow block (id 9)"
```

---

## Task 3: Biome-aware SurfacePainter

**Files:**
- Modify: `src/worldgen/SurfacePainter.ts`
- Test: `tests/surfacePainter.test.ts`

- [ ] **Step 1: Update the failing test**

Replace `tests/surfacePainter.test.ts` with biome-injected cases:
```ts
import { describe, it, expect } from 'vitest';
import { SurfacePainter } from '../src/worldgen/SurfacePainter';
import { ChunkData } from '../src/world/ChunkData';
import { CHUNK_SIZE_X, CHUNK_SIZE_Z, CHUNK_AREA, SEA_LEVEL } from '../src/core/constants';
import { AIR, GRASS, DIRT, STONE, SAND, SNOW } from '../src/blocks/blocks';
import { Biome, type BiomeSource } from '../src/worldgen/BiomeMap';
import type { GenContext } from '../src/worldgen/TerrainStage';

function source(biome: Biome): BiomeSource {
  return { biomeAt: () => biome, blendedTerrain: () => ({ amplitude: 8, baseOffset: 0 }) };
}

/** Context with constant height and a forced biome. */
function ctx(height: number, biome: Biome): GenContext {
  return {
    seed: 1,
    cx: 0,
    cz: 0,
    heights: new Int16Array(CHUNK_AREA).fill(height),
    seaLevel: SEA_LEVEL,
    biomes: source(biome),
  };
}

const stage = new SurfacePainter();

describe('SurfacePainter biome caps', () => {
  it('caps plains with grass on a dirt band over stone, air above', () => {
    const top = 70;
    const chunk = new ChunkData(0, 0);
    stage.apply(chunk, ctx(top, Biome.Plains));
    expect(chunk.get(0, top, 0)).toBe(GRASS);
    expect(chunk.get(0, top - 1, 0)).toBe(DIRT);
    expect(chunk.get(0, top - 3, 0)).toBe(DIRT);
    expect(chunk.get(0, top - 4, 0)).toBe(STONE);
    expect(chunk.get(0, 0, 0)).toBe(STONE);
    expect(chunk.get(0, top + 1, 0)).toBe(AIR);
  });

  it('caps desert columns with sand', () => {
    const top = 70;
    const chunk = new ChunkData(0, 0);
    stage.apply(chunk, ctx(top, Biome.Desert));
    expect(chunk.get(0, top, 0)).toBe(SAND);
    expect(chunk.get(0, top - 1, 0)).toBe(SAND);
  });

  it('caps tundra columns with snow over a dirt band', () => {
    const top = 70;
    const chunk = new ChunkData(0, 0);
    stage.apply(chunk, ctx(top, Biome.Tundra));
    expect(chunk.get(0, top, 0)).toBe(SNOW);
    expect(chunk.get(0, top - 1, 0)).toBe(DIRT);
  });

  it('caps any high-altitude column with snow regardless of biome', () => {
    const top = 120; // above the snow line
    const chunk = new ChunkData(0, 0);
    stage.apply(chunk, ctx(top, Biome.Plains));
    expect(chunk.get(0, top, 0)).toBe(SNOW);
  });

  it('caps columns at/below sea level with sand (beaches win over biome)', () => {
    const top = SEA_LEVEL;
    const chunk = new ChunkData(0, 0);
    stage.apply(chunk, ctx(top, Biome.Tundra)); // even in tundra, the shoreline is sand
    expect(chunk.get(0, top, 0)).toBe(SAND);
    expect(chunk.get(0, 0, 0)).toBe(STONE);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run surfacePainter`
Expected: FAIL — desert/tundra/snow-line cases don't paint sand/snow yet.

- [ ] **Step 3: Update the implementation**

Replace `src/worldgen/SurfacePainter.ts` with:
```ts
import { CHUNK_SIZE_X, CHUNK_SIZE_Z } from '../core/constants';
import { GRASS, DIRT, STONE, SAND, SNOW } from '../blocks/blocks';
import { Biome } from './BiomeMap';
import type { TerrainStage, GenContext } from './TerrainStage';
import type { ChunkData } from '../world/ChunkData';

const DIRT_BAND = 3; // thickness of the sub-surface band
const SNOW_LINE = 95; // any surface at/above this altitude is snow-capped

/** Paints the surface cap + band per column from biome, altitude, and sea level. */
export class SurfacePainter implements TerrainStage {
  apply(chunk: ChunkData, ctx: GenContext): void {
    for (let x = 0; x < CHUNK_SIZE_X; x++) {
      for (let z = 0; z < CHUNK_SIZE_Z; z++) {
        const height = ctx.heights[x + CHUNK_SIZE_X * z];
        const worldX = ctx.cx * CHUNK_SIZE_X + x;
        const worldZ = ctx.cz * CHUNK_SIZE_Z + z;
        const biome = ctx.biomes.biomeAt(worldX, worldZ);

        let cap = GRASS;
        let band = DIRT;
        if (height <= ctx.seaLevel + 1) {
          cap = SAND; // beaches / lake & sea floors win over biome
          band = SAND;
        } else if (height >= SNOW_LINE || biome === Biome.Tundra) {
          cap = SNOW; // altitude or tundra snow, over a dirt band
          band = DIRT;
        } else if (biome === Biome.Desert) {
          cap = SAND;
          band = SAND;
        }

        for (let y = 0; y <= height; y++) {
          let block = STONE;
          if (y === height) block = cap;
          else if (y >= height - DIRT_BAND) block = band;
          chunk.set(x, y, z, block);
        }
      }
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run surfacePainter`
Expected: PASS (5 cases).

- [ ] **Step 5: Full gate**

Run: `npm run lint && npx vitest run && npx tsc --noEmit && npm run build`
Expected: lint clean, all tests pass, no type errors, build succeeds.

- [ ] **Step 6: Browser verification (Edgar)**

Run: `npm run dev`
**Ask Edgar to confirm:** deserts are sandy, tundra regions are snowy white, and the tops of
tall mountains are snow-capped while their lower slopes stay grass — with shorelines sandy as
before. Plains/forest stay grassy.

- [ ] **Step 7: Commit**

```bash
git add src/worldgen/SurfacePainter.ts tests/surfacePainter.test.ts
git commit -m "feat(worldgen): biome-aware surface (desert sand, snow biomes/peaks) (B2 done)"
```

---

## Self-Review

**Spec coverage (B2 scope):**
- `SNOW` block (append-only id 9) + texture → Task 2.
- Desert sand surface → Task 3 (`Biome.Desert` → sand cap+band).
- Tundra snow surface → Task 3 (`Biome.Tundra` → snow cap).
- Altitude snow-caps on any tall terrain → Task 3 (`height >= SNOW_LINE`).
- Beaches still win near sea level → Task 3 (sea-level branch first).
- Shared `BiomeSource` so surface + height read one source → Task 1.
- Determinism preserved (pure; biome source deterministic) → unchanged seeding.
- Out of scope: vegetation/cacti (B3) — correctly absent.

**Placeholder scan:** No TBD/TODO. Every code step shows full code or an exact, located edit.

**Type consistency:** `BiomeSource { biomeAt, blendedTerrain }` (Task 1) is implemented by
`BiomeMap`, carried on `GenContext.biomes`, read by `HeightField` (`blendedTerrain`) and
`SurfacePainter` (`biomeAt`), and stubbed in tests. `SNOW`/`TextureLayer.Snow`/
`TEXTURE_LAYER_COUNT = 10` (Task 2) feed `BlockRegistry.layerCount` and the texture buffer.
`SurfacePainter` keeps `TerrainStage.apply(chunk, ctx)` and `ctx.heights` indexing, so
`CaveCarver`/`WaterFiller`/`LayeredGenerator` are unaffected. The cap/band precedence
(sea level → snow → desert → grass) is total and unambiguous.
