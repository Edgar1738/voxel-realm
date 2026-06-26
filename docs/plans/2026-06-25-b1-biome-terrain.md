# B1 — Biome Terrain Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce a pure `BiomeMap` that classifies columns into five biomes from climate noise and supplies blended terrain parameters, and rewire `HeightField` to use biome-blended amplitude/base (replacing E2's relief channel) so the world forms distinct regions with smooth borders.

**Architecture:** `BiomeMap` owns three seeded low-frequency noise channels (temperature, humidity, mountainousness), classifies into `Biome`, maps each biome to a `BiomeDef` (amplitude + base offset), and blends those params over a small kernel so biome borders slope smoothly. `HeightField` keeps its fBm *shape* channel but takes amplitude/base from `BiomeMap.blendedTerrain`. All pure and three.js-free.

**Tech Stack:** TypeScript (strict), Vitest, `simplex-noise`. Builds on E1–E6.

---

## File Structure

```txt
src/worldgen/
  BiomeMap.ts        CREATE  Biome enum, BiomeDef, classification + blended terrain
  HeightField.ts     MODIFY  use BiomeMap-blended amplitude/base; drop the relief channel
tests/
  biomeMap.test.ts   CREATE
  heightField.test.ts MODIFY  variety assertion still holds; mountains > desert
```

---

## Task 1: BiomeMap

**Files:**
- Create: `src/worldgen/BiomeMap.ts`
- Test: `tests/biomeMap.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/biomeMap.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { BiomeMap, Biome } from '../src/worldgen/BiomeMap';

const SEED = 1337;

describe('BiomeMap', () => {
  it('is deterministic', () => {
    const a = new BiomeMap(SEED);
    const b = new BiomeMap(SEED);
    expect(a.biomeAt(100, -250)).toBe(b.biomeAt(100, -250));
    expect(a.defAt(100, -250).amplitude).toBe(b.defAt(100, -250).amplitude);
  });

  it('produces all five biomes across a large region', () => {
    const map = new BiomeMap(SEED);
    const seen = new Set<Biome>();
    for (let x = -2048; x <= 2048; x += 64)
      for (let z = -2048; z <= 2048; z += 64) seen.add(map.biomeAt(x, z));
    expect(seen.has(Biome.Plains)).toBe(true);
    expect(seen.has(Biome.Forest)).toBe(true);
    expect(seen.has(Biome.Desert)).toBe(true);
    expect(seen.has(Biome.Mountains)).toBe(true);
    expect(seen.has(Biome.Tundra)).toBe(true);
  });

  it('gives mountains the highest amplitude and desert the lowest', () => {
    const map = new BiomeMap(SEED);
    expect(map.defForBiome(Biome.Mountains).amplitude).toBeGreaterThan(
      map.defForBiome(Biome.Plains).amplitude,
    );
    expect(map.defForBiome(Biome.Desert).amplitude).toBeLessThan(
      map.defForBiome(Biome.Plains).amplitude,
    );
  });

  it('blends terrain params smoothly between adjacent columns (no cliffs)', () => {
    const map = new BiomeMap(SEED);
    let maxJump = 0;
    let prev = map.blendedTerrain(0, 0).amplitude;
    for (let x = 1; x <= 4000; x++) {
      const amp = map.blendedTerrain(x, 0).amplitude;
      maxJump = Math.max(maxJump, Math.abs(amp - prev));
      prev = amp;
    }
    // A blended field changes gradually; a hard biome switch would jump tens of blocks.
    expect(maxJump).toBeLessThan(5);
  });

  it('keeps blended amplitude within the min/max of biome amplitudes', () => {
    const map = new BiomeMap(SEED);
    const amps = [
      Biome.Plains,
      Biome.Forest,
      Biome.Desert,
      Biome.Mountains,
      Biome.Tundra,
    ].map((b) => map.defForBiome(b).amplitude);
    const lo = Math.min(...amps);
    const hi = Math.max(...amps);
    for (let x = 0; x < 1000; x += 10) {
      const amp = map.blendedTerrain(x, x).amplitude;
      expect(amp).toBeGreaterThanOrEqual(lo);
      expect(amp).toBeLessThanOrEqual(hi);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run biomeMap`
Expected: FAIL — cannot resolve `../src/worldgen/BiomeMap`.

- [ ] **Step 3: Write the implementation**

`src/worldgen/BiomeMap.ts`:
```ts
import { createNoise2D, type NoiseFunction2D } from 'simplex-noise';
import { mulberry32 } from '../core/math';
import type { WorldSeed } from '../core/types';

export enum Biome {
  Plains,
  Forest,
  Desert,
  Mountains,
  Tundra,
}

/** Terrain parameters a biome contributes to the heightmap. */
export interface BiomeDef {
  biome: Biome;
  amplitude: number;
  baseOffset: number;
}

const DEFS: Record<Biome, BiomeDef> = {
  [Biome.Plains]: { biome: Biome.Plains, amplitude: 8, baseOffset: 0 },
  [Biome.Forest]: { biome: Biome.Forest, amplitude: 12, baseOffset: 0 },
  [Biome.Desert]: { biome: Biome.Desert, amplitude: 4, baseOffset: -1 },
  [Biome.Mountains]: { biome: Biome.Mountains, amplitude: 55, baseOffset: 8 },
  [Biome.Tundra]: { biome: Biome.Tundra, amplitude: 12, baseOffset: 0 },
};

const CLIMATE_FREQ = 1 / 512; // large, contiguous regions
const MOUNTAIN_THRESHOLD = 0.35;
const HOT = 0.3;
const DRY = -0.1;
const COLD = -0.35;
const WET = 0.25;

// Salts to derive independent channels from one seed.
const SALT_T = 0x7e3a1b;
const SALT_H = 0x2c9f55;
const SALT_M = 0x51d0e7;

// Blend kernel: 3x3 samples spaced this many blocks apart.
const BLEND_SPACING = 8;

interface Channels {
  temperature: NoiseFunction2D;
  humidity: NoiseFunction2D;
  mountain: NoiseFunction2D;
}

/** Classifies columns into biomes and supplies (blended) terrain parameters. */
export class BiomeMap {
  private readonly ch: Channels;

  constructor(seed: WorldSeed) {
    this.ch = {
      temperature: createNoise2D(mulberry32((seed ^ SALT_T) >>> 0)),
      humidity: createNoise2D(mulberry32((seed ^ SALT_H) >>> 0)),
      mountain: createNoise2D(mulberry32((seed ^ SALT_M) >>> 0)),
    };
  }

  biomeAt(worldX: number, worldZ: number): Biome {
    const t = this.ch.temperature(worldX * CLIMATE_FREQ, worldZ * CLIMATE_FREQ);
    const h = this.ch.humidity(worldX * CLIMATE_FREQ, worldZ * CLIMATE_FREQ);
    const m = this.ch.mountain(worldX * CLIMATE_FREQ, worldZ * CLIMATE_FREQ);

    if (m > MOUNTAIN_THRESHOLD) return Biome.Mountains;
    if (t > HOT && h < DRY) return Biome.Desert;
    if (t < COLD) return Biome.Tundra;
    if (h > WET) return Biome.Forest;
    return Biome.Plains;
  }

  defForBiome(biome: Biome): BiomeDef {
    return DEFS[biome];
  }

  defAt(worldX: number, worldZ: number): BiomeDef {
    return DEFS[this.biomeAt(worldX, worldZ)];
  }

  /** Amplitude/base averaged over a small kernel so biome borders slope smoothly. */
  blendedTerrain(worldX: number, worldZ: number): { amplitude: number; baseOffset: number } {
    let amplitude = 0;
    let baseOffset = 0;
    let n = 0;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const def = this.defAt(worldX + dx * BLEND_SPACING, worldZ + dz * BLEND_SPACING);
        amplitude += def.amplitude;
        baseOffset += def.baseOffset;
        n++;
      }
    }
    return { amplitude: amplitude / n, baseOffset: baseOffset / n };
  }
}
```

> Note: a 3×3 kernel at 8-block spacing only smooths over ~16 blocks, so a single hard biome
> switch still steps by ~1/9 of the amplitude difference per sample. With `BLEND_SPACING=8`
> the per-column jump for the largest amplitude gap (Mountains 55 vs Desert 4 ≈ 51) stays
> well under 5 because adjacent columns share 6 of 9 kernel samples. If the smoothness test
> fails, increase `BLEND_SPACING` (wider kernel) — do not change the amplitudes.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run biomeMap`
Expected: PASS (5 tests). If "all five biomes" fails, the thresholds need loosening so each
biome appears in the sampled region (e.g. lower `MOUNTAIN_THRESHOLD`, widen `HOT`/`COLD`);
if "smoothly" fails, raise `BLEND_SPACING`.

- [ ] **Step 5: Commit**

```bash
git add src/worldgen/BiomeMap.ts tests/biomeMap.test.ts
git commit -m "feat(worldgen): add BiomeMap (climate classification + blended terrain)"
```

---

## Task 2: Biome-driven HeightField

**Files:**
- Modify: `src/worldgen/HeightField.ts`
- Test: `tests/heightField.test.ts`

- [ ] **Step 1: Add a failing biome-relief test**

Append to `tests/heightField.test.ts`:
```ts
import { BiomeMap, Biome } from '../src/worldgen/BiomeMap';

describe('HeightField biome relief', () => {
  it('makes mountain columns taller than desert columns on average', () => {
    const stage = new HeightField();
    const map = new BiomeMap(1337);

    const avgFor = (target: Biome): number => {
      let sum = 0;
      let count = 0;
      for (let cx = -40; cx < 40 && count < 400; cx++) {
        const c = ctx(1337, cx, 0);
        stage.apply(new ChunkData(cx, 0), c);
        for (let x = 0; x < CHUNK_SIZE_X && count < 400; x++) {
          const worldX = cx * CHUNK_SIZE_X + x;
          if (map.biomeAt(worldX, 0) === target) {
            sum += c.heights[x]; // z=0 row, index x + 16*0
            count++;
          }
        }
      }
      return count > 0 ? sum / count : 0;
    };

    expect(avgFor(Biome.Mountains)).toBeGreaterThan(avgFor(Biome.Desert));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run heightField`
Expected: FAIL — current `HeightField` uses the E2 relief channel, not the biome, so mountain
vs desert isn't guaranteed (and `BiomeMap` isn't wired in).

- [ ] **Step 3: Rewrite HeightField to use BiomeMap**

Replace `src/worldgen/HeightField.ts` with:
```ts
import { createNoise2D, type NoiseFunction2D } from 'simplex-noise';
import { mulberry32 } from '../core/math';
import { CHUNK_SIZE_X, CHUNK_SIZE_Z, WORLD_HEIGHT } from '../core/constants';
import { fbm2D, type FbmOptions } from './fbm';
import { BiomeMap } from './BiomeMap';
import type { TerrainStage, GenContext } from './TerrainStage';
import type { ChunkData } from '../world/ChunkData';
import type { WorldSeed } from '../core/types';

const BASE_HEIGHT = 64;
const SHAPE: FbmOptions = { octaves: 4, persistence: 0.5, lacunarity: 2, frequency: 1 / 192 };

interface SeedState {
  shape: NoiseFunction2D;
  biomes: BiomeMap;
}

/**
 * Seeded heightmap: an fBm "shape" channel scaled by biome-blended amplitude/base, so each
 * biome has its own relief (flat deserts, dramatic mountains) with smooth borders.
 */
export class HeightField implements TerrainStage {
  private readonly bySeed = new Map<WorldSeed, SeedState>();

  private state(seed: WorldSeed): SeedState {
    let s = this.bySeed.get(seed);
    if (!s) {
      s = { shape: createNoise2D(mulberry32(seed)), biomes: new BiomeMap(seed) };
      this.bySeed.set(seed, s);
    }
    return s;
  }

  apply(_chunk: ChunkData, ctx: GenContext): void {
    const { shape, biomes } = this.state(ctx.seed);
    for (let x = 0; x < CHUNK_SIZE_X; x++) {
      for (let z = 0; z < CHUNK_SIZE_Z; z++) {
        const worldX = ctx.cx * CHUNK_SIZE_X + x;
        const worldZ = ctx.cz * CHUNK_SIZE_Z + z;

        const s = fbm2D(shape, worldX, worldZ, SHAPE); // [-1, 1]
        const { amplitude, baseOffset } = biomes.blendedTerrain(worldX, worldZ);

        let height = Math.floor(BASE_HEIGHT + baseOffset + s * amplitude);
        if (height < 1) height = 1;
        if (height > WORLD_HEIGHT - 1) height = WORLD_HEIGHT - 1;
        ctx.heights[x + CHUNK_SIZE_X * z] = height;
      }
    }
  }
}
```

- [ ] **Step 4: Run the HeightField + dependent suites**

Run: `npx vitest run heightField biomeMap layeredGenerator chunkManager`
Expected: PASS. The E2 relief-variety test still holds (mountains amplitude 55 gives a wide
spread); the new biome-relief test passes; layering/isSolid/isWater unaffected.

- [ ] **Step 5: Full gate**

Run: `npm run lint && npx vitest run && npx tsc --noEmit && npm run build`
Expected: lint clean, all tests pass, no type errors, build succeeds.

- [ ] **Step 6: Browser verification (Edgar)**

Run: `npm run dev`
**Ask Edgar to confirm:** flying around reveals distinct regions — flat stretches (deserts/plains),
gently rolling areas (forests), and tall dramatic mountain masses — with terrain sloping
smoothly between them rather than abrupt walls at region borders. (Surfaces are still all
grass/sand-by-sea-level until B2; this slice is about the *shape* of the land.)

- [ ] **Step 7: Commit**

```bash
git add src/worldgen/HeightField.ts tests/heightField.test.ts
git commit -m "feat(worldgen): drive heightmap amplitude from biomes (B1 done)"
```

---

## Self-Review

**Spec coverage (B1 scope):**
- `BiomeMap` classification from three climate channels → Task 1.
- Five biomes (Plains/Forest/Desert/Mountains/Tundra) → Task 1 (`Biome` enum + "all five" test).
- Per-biome terrain params (`BiomeDef` amplitude/baseOffset) → Task 1 (`DEFS`).
- Border blending (terrain height) → Task 1 (`blendedTerrain` kernel + smoothness test).
- `HeightField` uses biome-blended amplitude, replacing E2's relief channel → Task 2.
- Determinism preserved → BiomeMap determinism test + HeightField (unchanged seeding).
- Out of scope: surface blocks (B2), vegetation (B3) — correctly absent.

**Placeholder scan:** No TBD/TODO. Every code step shows full code or an exact, located edit.
The tuning notes (raise `BLEND_SPACING` / loosen thresholds if a test fails) are concrete
fallbacks, not placeholders.

**Type consistency:** `BiomeMap` exposes `biomeAt`, `defAt`, `defForBiome`, `blendedTerrain`;
the `blendedTerrain` shape `{ amplitude, baseOffset }` is consumed by `HeightField` in Task 2.
`Biome` enum + `BiomeDef { biome, amplitude, baseOffset }` are used in both tasks and tests.
`HeightField` keeps `TerrainStage.apply(chunk, ctx)` and `ctx.heights` indexing
(`x + CHUNK_SIZE_X * z`), so `SurfacePainter`/`CaveCarver`/`WaterFiller`/`LayeredGenerator`
are unaffected. Seed channels use `(seed ^ SALT) >>> 0` for a valid uint32 to `mulberry32`,
matching E2/E3.
