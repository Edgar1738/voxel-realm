# E1 — Worldgen Pipeline Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the monolithic `HeightmapGenerator` with an ordered pipeline of pure `TerrainStage`s (`HeightField` → `SurfacePainter`) assembled by `LayeredGenerator`, producing **byte-identical** terrain — locking in the extensible structure before any new feature lands.

**Architecture:** `LayeredGenerator` builds a per-chunk `GenContext` (seed, coords, a shared heightmap, sea level) and runs each `TerrainStage.apply(chunk, ctx)` in order. `HeightField` computes the heightmap (same noise/formula as today); `SurfacePainter` paints stone/dirt/grass from it (same layering as today). All stages are pure and three.js-free. A temporary equivalence test proves the new generator matches the old byte-for-byte, then the old generator is deleted.

**Tech Stack:** TypeScript (strict), Vitest, `simplex-noise`. Builds on M1A–M1C.

---

## File Structure

```txt
src/
  core/
    constants.ts          MODIFY  + SEA_LEVEL
  worldgen/
    TerrainStage.ts       CREATE  GenContext + TerrainStage interfaces
    HeightField.ts        CREATE  stage: fills ctx.heights (noise)
    SurfacePainter.ts     CREATE  stage: stone/dirt/grass from ctx.heights
    LayeredGenerator.ts   CREATE  LayeredGenerator + createWorldGenerator() factory
    HeightmapGenerator.ts DELETE  (after equivalence proven, in Task 5)
  app/
    Game.ts               MODIFY  use createWorldGenerator()
tests/
  heightField.test.ts        CREATE
  surfacePainter.test.ts     CREATE
  layeredGenerator.test.ts   CREATE  (ports the old determinism/layering tests)
  genEquivalence.test.ts     CREATE  (temporary; deleted in Task 5)
  heightmapGenerator.test.ts DELETE  (in Task 5; coverage moves to layeredGenerator.test.ts)
  chunkManager.test.ts       MODIFY  use createWorldGenerator()
```

Current constants to preserve exactly (from `HeightmapGenerator.ts`): `BASE_HEIGHT = 64`, `AMPLITUDE = 24`, `FREQUENCY = 1 / 64`, `DIRT_BAND = 3`; height clamped to `[1, WORLD_HEIGHT - 1]`; noise = `createNoise2D(mulberry32(seed))`, memoized per seed.

---

## Task 1: Sea-level constant + pipeline interfaces

**Files:**
- Modify: `src/core/constants.ts`
- Create: `src/worldgen/TerrainStage.ts`

- [ ] **Step 1: Add the SEA_LEVEL constant**

Append to `src/core/constants.ts`:
```ts
/** Water surface height (used by later worldgen stages; defined now for the pipeline). */
export const SEA_LEVEL = 62;
```

- [ ] **Step 2: Create the pipeline interfaces**

`src/worldgen/TerrainStage.ts`:
```ts
import type { ChunkData } from '../world/ChunkData';
import type { WorldSeed } from '../core/types';

/** Shared per-chunk state threaded through the worldgen stages. */
export interface GenContext {
  seed: WorldSeed;
  cx: number;
  cz: number;
  /** Surface height per local (x,z); index = x + CHUNK_SIZE_X * z. Filled by HeightField. */
  heights: Int16Array;
  seaLevel: number;
}

/** One pure, ordered step of base terrain generation. */
export interface TerrainStage {
  apply(chunk: ChunkData, ctx: GenContext): void;
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/core/constants.ts src/worldgen/TerrainStage.ts
git commit -m "feat(worldgen): add sea-level constant and TerrainStage pipeline interfaces"
```

---

## Task 2: HeightField stage

**Files:**
- Create: `src/worldgen/HeightField.ts`
- Test: `tests/heightField.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/heightField.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { HeightField } from '../src/worldgen/HeightField';
import { ChunkData } from '../src/world/ChunkData';
import { CHUNK_SIZE_X, CHUNK_SIZE_Z, CHUNK_AREA, WORLD_HEIGHT, SEA_LEVEL } from '../src/core/constants';
import type { GenContext } from '../src/worldgen/TerrainStage';

function ctx(seed: number, cx: number, cz: number): GenContext {
  return { seed, cx, cz, heights: new Int16Array(CHUNK_AREA), seaLevel: SEA_LEVEL };
}

describe('HeightField', () => {
  const stage = new HeightField();

  it('fills every column with an in-range height', () => {
    const c = ctx(1337, 0, 0);
    stage.apply(new ChunkData(0, 0), c);
    for (let i = 0; i < CHUNK_AREA; i++) {
      expect(c.heights[i]).toBeGreaterThanOrEqual(1);
      expect(c.heights[i]).toBeLessThanOrEqual(WORLD_HEIGHT - 1);
    }
  });

  it('is deterministic for the same seed/coords', () => {
    const a = ctx(1337, 2, -3);
    const b = ctx(1337, 2, -3);
    stage.apply(new ChunkData(2, -3), a);
    stage.apply(new ChunkData(2, -3), b);
    expect(Array.from(a.heights)).toEqual(Array.from(b.heights));
  });

  it('produces different heights for different chunks', () => {
    const a = ctx(1337, 0, 0);
    const b = ctx(1337, 5, 5);
    stage.apply(new ChunkData(0, 0), a);
    stage.apply(new ChunkData(5, 5), b);
    expect(Array.from(a.heights)).not.toEqual(Array.from(b.heights));
  });

  it('indexes heights as x + CHUNK_SIZE_X * z', () => {
    // Sanity: the last index is the max corner and is written (non-zero).
    const c = ctx(1337, 0, 0);
    stage.apply(new ChunkData(0, 0), c);
    expect(c.heights[CHUNK_SIZE_X - 1 + CHUNK_SIZE_X * (CHUNK_SIZE_Z - 1)]).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run heightField`
Expected: FAIL — cannot resolve `../src/worldgen/HeightField`.

- [ ] **Step 3: Write the implementation**

`src/worldgen/HeightField.ts`:
```ts
import { createNoise2D, type NoiseFunction2D } from 'simplex-noise';
import { mulberry32 } from '../core/math';
import { CHUNK_SIZE_X, CHUNK_SIZE_Z, WORLD_HEIGHT } from '../core/constants';
import type { TerrainStage, GenContext } from './TerrainStage';
import type { ChunkData } from '../world/ChunkData';
import type { WorldSeed } from '../core/types';

const BASE_HEIGHT = 64;
const AMPLITUDE = 24;
const FREQUENCY = 1 / 64;

/** Fills ctx.heights with a seeded 2D heightmap (one biome, same as the original gen). */
export class HeightField implements TerrainStage {
  private readonly noiseBySeed = new Map<WorldSeed, NoiseFunction2D>();

  private noise(seed: WorldSeed): NoiseFunction2D {
    let n = this.noiseBySeed.get(seed);
    if (!n) {
      n = createNoise2D(mulberry32(seed));
      this.noiseBySeed.set(seed, n);
    }
    return n;
  }

  apply(_chunk: ChunkData, ctx: GenContext): void {
    const noise2D = this.noise(ctx.seed);
    for (let x = 0; x < CHUNK_SIZE_X; x++) {
      for (let z = 0; z < CHUNK_SIZE_Z; z++) {
        const worldX = ctx.cx * CHUNK_SIZE_X + x;
        const worldZ = ctx.cz * CHUNK_SIZE_Z + z;
        const n = noise2D(worldX * FREQUENCY, worldZ * FREQUENCY); // [-1, 1]
        let height = Math.floor(BASE_HEIGHT + n * AMPLITUDE);
        if (height < 1) height = 1;
        if (height > WORLD_HEIGHT - 1) height = WORLD_HEIGHT - 1;
        ctx.heights[x + CHUNK_SIZE_X * z] = height;
      }
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run heightField`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/worldgen/HeightField.ts tests/heightField.test.ts
git commit -m "feat(worldgen): add HeightField stage (seeded heightmap)"
```

---

## Task 3: SurfacePainter stage

**Files:**
- Create: `src/worldgen/SurfacePainter.ts`
- Test: `tests/surfacePainter.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/surfacePainter.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { SurfacePainter } from '../src/worldgen/SurfacePainter';
import { ChunkData } from '../src/world/ChunkData';
import { CHUNK_SIZE_X, CHUNK_SIZE_Z, CHUNK_AREA, SEA_LEVEL } from '../src/core/constants';
import { AIR, GRASS, DIRT, STONE } from '../src/blocks/blocks';
import type { GenContext } from '../src/worldgen/TerrainStage';

/** Build a context whose heights are a constant value. */
function flatCtx(height: number): GenContext {
  const heights = new Int16Array(CHUNK_AREA).fill(height);
  return { seed: 1, cx: 0, cz: 0, heights, seaLevel: SEA_LEVEL };
}

describe('SurfacePainter', () => {
  const stage = new SurfacePainter();

  it('paints grass on top, a 3-deep dirt band, stone below, air above', () => {
    const top = 70;
    const chunk = new ChunkData(0, 0);
    stage.apply(chunk, flatCtx(top));
    for (let x = 0; x < CHUNK_SIZE_X; x++) {
      for (let z = 0; z < CHUNK_SIZE_Z; z++) {
        expect(chunk.get(x, top, z)).toBe(GRASS);
        expect(chunk.get(x, top - 1, z)).toBe(DIRT);
        expect(chunk.get(x, top - 3, z)).toBe(DIRT);
        expect(chunk.get(x, top - 4, z)).toBe(STONE);
        expect(chunk.get(x, 0, z)).toBe(STONE);
        expect(chunk.get(x, top + 1, z)).toBe(AIR);
      }
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run surfacePainter`
Expected: FAIL — cannot resolve `../src/worldgen/SurfacePainter`.

- [ ] **Step 3: Write the implementation**

`src/worldgen/SurfacePainter.ts`:
```ts
import { CHUNK_SIZE_X, CHUNK_SIZE_Z } from '../core/constants';
import { GRASS, DIRT, STONE } from '../blocks/blocks';
import type { TerrainStage, GenContext } from './TerrainStage';
import type { ChunkData } from '../world/ChunkData';

const DIRT_BAND = 3; // dirt thickness between the grass top and stone

/** Paints stone fill, a dirt band, and a grass cap from ctx.heights (same as original gen). */
export class SurfacePainter implements TerrainStage {
  apply(chunk: ChunkData, ctx: GenContext): void {
    for (let x = 0; x < CHUNK_SIZE_X; x++) {
      for (let z = 0; z < CHUNK_SIZE_Z; z++) {
        const height = ctx.heights[x + CHUNK_SIZE_X * z];
        for (let y = 0; y <= height; y++) {
          let block = STONE;
          if (y === height) block = GRASS;
          else if (y >= height - DIRT_BAND) block = DIRT;
          chunk.set(x, y, z, block);
        }
      }
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run surfacePainter`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/worldgen/SurfacePainter.ts tests/surfacePainter.test.ts
git commit -m "feat(worldgen): add SurfacePainter stage (stone/dirt/grass layering)"
```

---

## Task 4: LayeredGenerator + equivalence proof

**Files:**
- Create: `src/worldgen/LayeredGenerator.ts`
- Test: `tests/layeredGenerator.test.ts`, `tests/genEquivalence.test.ts`

- [ ] **Step 1: Write the failing tests**

`tests/layeredGenerator.test.ts` (ports the old determinism/layering coverage onto the new generator):
```ts
import { describe, it, expect } from 'vitest';
import { createWorldGenerator } from '../src/worldgen/LayeredGenerator';
import { applyOverlays } from '../src/worldgen/Generator';
import { ChunkData } from '../src/world/ChunkData';
import { CHUNK_SIZE_X, CHUNK_SIZE_Z, WORLD_HEIGHT } from '../src/core/constants';
import { AIR, GRASS, DIRT, STONE } from '../src/blocks/blocks';

const SEED = 1337;

function columnTop(c: ChunkData, x: number, z: number): number {
  for (let y = WORLD_HEIGHT - 1; y >= 0; y--) if (c.get(x, y, z) !== AIR) return y;
  return -1;
}

describe('LayeredGenerator', () => {
  const gen = createWorldGenerator();

  it('is deterministic: same seed/coords -> identical bytes', () => {
    const a = gen.generateBaseChunk(SEED, 0, 0);
    const b = gen.generateBaseChunk(SEED, 0, 0);
    expect(Array.from(a.data)).toEqual(Array.from(b.data));
  });

  it('differs for a different chunk and a different seed', () => {
    const base = gen.generateBaseChunk(SEED, 0, 0);
    expect(Array.from(gen.generateBaseChunk(SEED, 1, 0).data)).not.toEqual(Array.from(base.data));
    expect(Array.from(gen.generateBaseChunk(SEED + 1, 0, 0).data)).not.toEqual(
      Array.from(base.data),
    );
  });

  it('lays grass on top, dirt band beneath, stone below, air above', () => {
    const c = gen.generateBaseChunk(SEED, 0, 0);
    for (let x = 0; x < CHUNK_SIZE_X; x++) {
      for (let z = 0; z < CHUNK_SIZE_Z; z++) {
        const top = columnTop(c, x, z);
        expect(top).toBeGreaterThan(0);
        expect(c.get(x, top, z)).toBe(GRASS);
        expect(c.get(x, top - 1, z)).toBe(DIRT);
        expect(c.get(x, top - 4, z)).toBe(STONE);
        expect(c.get(x, 0, z)).toBe(STONE);
        if (top + 1 < WORLD_HEIGHT) expect(c.get(x, top + 1, z)).toBe(AIR);
      }
    }
  });

  it('with an empty overlay list leaves the chunk unchanged', () => {
    const c = gen.generateBaseChunk(SEED, 0, 0);
    const before = Array.from(c.data);
    applyOverlays(c, 0, 0, SEED, []);
    expect(Array.from(c.data)).toEqual(before);
  });
});
```

`tests/genEquivalence.test.ts` (TEMPORARY — deleted in Task 5; proves the refactor is byte-identical):
```ts
import { describe, it, expect } from 'vitest';
import { HeightmapGenerator } from '../src/worldgen/HeightmapGenerator';
import { createWorldGenerator } from '../src/worldgen/LayeredGenerator';

describe('worldgen refactor equivalence', () => {
  const original = new HeightmapGenerator();
  const pipeline = createWorldGenerator();

  it('produces byte-identical chunks to the original HeightmapGenerator', () => {
    const samples: Array<[number, number, number]> = [
      [1337, 0, 0],
      [1337, 1, 0],
      [1337, -3, 5],
      [42, 7, -7],
      [9001, -10, -10],
    ];
    for (const [seed, cx, cz] of samples) {
      const a = original.generateBaseChunk(seed, cx, cz);
      const b = pipeline.generateBaseChunk(seed, cx, cz);
      expect(Array.from(b.data)).toEqual(Array.from(a.data));
    }
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run layeredGenerator genEquivalence`
Expected: FAIL — cannot resolve `../src/worldgen/LayeredGenerator`.

- [ ] **Step 3: Write the implementation**

`src/worldgen/LayeredGenerator.ts`:
```ts
import { CHUNK_AREA, SEA_LEVEL } from '../core/constants';
import { ChunkData } from '../world/ChunkData';
import { HeightField } from './HeightField';
import { SurfacePainter } from './SurfacePainter';
import type { Generator } from './Generator';
import type { GenContext, TerrainStage } from './TerrainStage';
import type { WorldSeed } from '../core/types';

/** Runs an ordered list of pure TerrainStages over a shared per-chunk GenContext. */
export class LayeredGenerator implements Generator {
  constructor(
    private readonly stages: TerrainStage[],
    private readonly seaLevel: number,
  ) {}

  generateBaseChunk(seed: WorldSeed, cx: number, cz: number): ChunkData {
    const chunk = new ChunkData(cx, cz);
    const ctx: GenContext = {
      seed,
      cx,
      cz,
      heights: new Int16Array(CHUNK_AREA),
      seaLevel: this.seaLevel,
    };
    for (const stage of this.stages) stage.apply(chunk, ctx);
    return chunk;
  }
}

/** The default world generator: heightmap then surface painting. */
export function createWorldGenerator(): LayeredGenerator {
  return new LayeredGenerator([new HeightField(), new SurfacePainter()], SEA_LEVEL);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run layeredGenerator genEquivalence`
Expected: PASS (the equivalence test confirms byte-identical output).

- [ ] **Step 5: Commit**

```bash
git add src/worldgen/LayeredGenerator.ts tests/layeredGenerator.test.ts tests/genEquivalence.test.ts
git commit -m "feat(worldgen): add LayeredGenerator pipeline with equivalence proof"
```

---

## Task 5: Switch over and remove the old generator

**Files:**
- Modify: `src/app/Game.ts`
- Modify: `tests/chunkManager.test.ts`
- Delete: `src/worldgen/HeightmapGenerator.ts`, `tests/heightmapGenerator.test.ts`, `tests/genEquivalence.test.ts`

- [ ] **Step 1: Point Game at the new generator**

In `src/app/Game.ts`, change the import:
```ts
import { createWorldGenerator } from '../worldgen/LayeredGenerator';
```
(remove `import { HeightmapGenerator } from '../worldgen/HeightmapGenerator';`)

and change the `ChunkManager` construction from `new HeightmapGenerator()` to `createWorldGenerator()`:
```ts
    const manager = new ChunkManager(
      createWorldGenerator(),
      new GreedyMesher(registry),
      registry,
      sink,
      SEED,
      OVERLAYS,
    );
```

- [ ] **Step 2: Point the ChunkManager test at the new generator**

In `tests/chunkManager.test.ts`, replace the import:
```ts
import { createWorldGenerator } from '../src/worldgen/LayeredGenerator';
```
(remove `import { HeightmapGenerator } from '../src/worldgen/HeightmapGenerator';`)

and in `makeManager` replace `new HeightmapGenerator()` with `createWorldGenerator()`:
```ts
  return new ChunkManager(
    createWorldGenerator(),
    new GreedyMesher(registry),
    registry,
    sink,
    SEED,
    [],
    { viewDistance, genBudget, meshBudget },
  );
```

- [ ] **Step 3: Confirm nothing else imports the old generator**

Run: `grep -rn "HeightmapGenerator" src tests`
Expected: no remaining references (only the file about to be deleted, if it still matches).

- [ ] **Step 4: Delete the old generator, its test, and the temporary equivalence test**

```bash
git rm src/worldgen/HeightmapGenerator.ts tests/heightmapGenerator.test.ts tests/genEquivalence.test.ts
```

- [ ] **Step 5: Full gate**

Run: `npm run lint && npx vitest run && npx tsc --noEmit && npm run build`
Expected: lint clean, all tests pass, no type errors, build succeeds. (Terrain is unchanged — E1 is a pure refactor.)

- [ ] **Step 6: Optional browser sanity check**

Run: `npm run dev`
The world should look exactly as before (same seed `1337`, same terrain). No visual change is expected — E1 only restructures code.

- [ ] **Step 7: Commit**

```bash
git add src/app/Game.ts tests/chunkManager.test.ts
git commit -m "refactor(worldgen): switch to LayeredGenerator, remove HeightmapGenerator (E1 done)"
```

---

## Self-Review

**Spec coverage (E1 scope):**
- `GenContext` (seed, coords, shared heights, sea level) → Task 1.
- `TerrainStage` interface → Task 1.
- `HeightField` stage (heightmap, owns terrain shape) → Task 2.
- `SurfacePainter` stage (stone/dirt/grass) → Task 3.
- `LayeredGenerator` + `createWorldGenerator()` factory, ordered stages → Task 4.
- **Byte-identical** output guarantee → Task 4 (`genEquivalence.test.ts`).
- Pure & three.js-free, deterministic in (seed, cx, cz) → all stages; covered by determinism tests in Tasks 2 + 4.
- Switch consumers, delete the old generator (no dead code) → Task 5.
- `SEA_LEVEL` defined now (used by later slices E5/E6) → Task 1.
- Out of scope (deferred to E2–E6): terrain variety, caves, water, trees, swim — correctly absent.

**Placeholder scan:** No TBD/TODO. Every code step shows full code or an exact, located edit. The one temporary artifact (`genEquivalence.test.ts`) is explicitly created in Task 4 and removed in Task 5 Step 4.

**Type consistency:** `GenContext { seed, cx, cz, heights: Int16Array, seaLevel }` and `TerrainStage.apply(chunk, ctx)` are used identically across `HeightField`, `SurfacePainter`, and `LayeredGenerator`. `heights` indexing is `x + CHUNK_SIZE_X * z` in HeightField (write), SurfacePainter (read), and the test helpers. `createWorldGenerator()` returns a `LayeredGenerator` (implements `Generator`), matching what `ChunkManager` expects (`Generator`) in Game and the manager test. Constants `BASE_HEIGHT/AMPLITUDE/FREQUENCY/DIRT_BAND` match the original generator exactly, which is what makes the equivalence test pass.
