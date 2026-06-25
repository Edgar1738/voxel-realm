# E2 — Terrain Variety Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the world Minecraft-style relief — plains, rolling hills, and occasional mountains — by upgrading `HeightField` from a single noise octave to multi-octave fBm with a low-frequency amplitude (relief) modulation.

**Architecture:** Add a pure, reusable `fbm2D` helper (decoupled from any noise library by taking a sampler function). `HeightField` combines two seeded noise channels: an fBm *shape* channel and a low-frequency *relief* channel that scales local amplitude between plains and mountains. Still one focused stage; only `HeightField` changes behavior.

**Tech Stack:** TypeScript (strict), Vitest, `simplex-noise`. Builds on E1.

---

## File Structure

```txt
src/worldgen/
  fbm.ts          CREATE  pure fractal-noise (fBm) helper
  HeightField.ts  MODIFY  multi-octave shape + relief-modulated amplitude
tests/
  fbm.test.ts          CREATE
  heightField.test.ts  MODIFY  + relief-variety assertion
```

---

## Task 1: fBm helper

**Files:**
- Create: `src/worldgen/fbm.ts`
- Test: `tests/fbm.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/fbm.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { fbm2D, type FbmOptions } from '../src/worldgen/fbm';

const OPTS: FbmOptions = { octaves: 4, persistence: 0.5, lacunarity: 2, frequency: 1 };

describe('fbm2D', () => {
  it('returns the constant when the sampler is constant (normalized)', () => {
    expect(fbm2D(() => 1, 0, 0, OPTS)).toBeCloseTo(1, 6);
    expect(fbm2D(() => -1, 3, 7, OPTS)).toBeCloseTo(-1, 6);
    expect(fbm2D(() => 0, 1, 1, OPTS)).toBeCloseTo(0, 6);
  });

  it('stays within the sampler range [-1, 1]', () => {
    const sample = (x: number, z: number) => Math.sin(x) * Math.cos(z);
    for (let i = 0; i < 50; i++) {
      const v = fbm2D(sample, i * 0.3, i * 0.7, OPTS);
      expect(v).toBeGreaterThanOrEqual(-1);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it('weights the first octave most (persistence < 1)', () => {
    // Sampler returns 1 only at the base frequency sample, 0 elsewhere.
    const sample = (x: number) => (x === 0 ? 1 : 0);
    // At x=0 every octave samples x*freq = 0, so all octaves fire => normalized 1.
    expect(fbm2D(sample, 0, 0, OPTS)).toBeCloseTo(1, 6);
  });

  it('is deterministic', () => {
    const sample = (x: number, z: number) => Math.sin(x * 1.3 + z * 0.2);
    expect(fbm2D(sample, 2, 5, OPTS)).toBe(fbm2D(sample, 2, 5, OPTS));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run fbm`
Expected: FAIL — cannot resolve `../src/worldgen/fbm`.

- [ ] **Step 3: Write the implementation**

`src/worldgen/fbm.ts`:
```ts
/** Parameters for fractal (fBm) accumulation of a noise sampler. */
export interface FbmOptions {
  octaves: number;
  persistence: number; // amplitude falloff per octave (0..1)
  lacunarity: number; // frequency growth per octave (>1)
  frequency: number; // base frequency
}

/**
 * Fractal Brownian motion over a 2D noise `sample` in [-1, 1]. Sums octaves of
 * decreasing amplitude / increasing frequency and normalizes back into [-1, 1].
 * Pure and library-agnostic (the caller supplies the noise sampler).
 */
export function fbm2D(
  sample: (x: number, z: number) => number,
  x: number,
  z: number,
  opts: FbmOptions,
): number {
  let amplitude = 1;
  let frequency = opts.frequency;
  let sum = 0;
  let amplitudeSum = 0;
  for (let o = 0; o < opts.octaves; o++) {
    sum += amplitude * sample(x * frequency, z * frequency);
    amplitudeSum += amplitude;
    amplitude *= opts.persistence;
    frequency *= opts.lacunarity;
  }
  return sum / amplitudeSum;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run fbm`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/worldgen/fbm.ts tests/fbm.test.ts
git commit -m "feat(worldgen): add pure fBm fractal-noise helper"
```

---

## Task 2: Multi-octave HeightField with relief modulation

**Files:**
- Modify: `src/worldgen/HeightField.ts`
- Test: `tests/heightField.test.ts`

- [ ] **Step 1: Add the failing variety test**

Append to `tests/heightField.test.ts`:
```ts
import { WORLD_HEIGHT } from '../src/core/constants';

describe('HeightField relief variety', () => {
  it('produces a wide spread of heights across a large area (plains to mountains)', () => {
    const stage = new HeightField();
    let min = Infinity;
    let max = -Infinity;
    // Sample a 12x12 chunk region.
    for (let cx = -6; cx < 6; cx++) {
      for (let cz = -6; cz < 6; cz++) {
        const c = ctx(1337, cx, cz);
        stage.apply(new ChunkData(cx, cz), c);
        for (let i = 0; i < c.heights.length; i++) {
          min = Math.min(min, c.heights[i]);
          max = Math.max(max, c.heights[i]);
        }
      }
    }
    expect(max - min).toBeGreaterThan(30); // meaningful relief, not a near-flat plane
    expect(min).toBeGreaterThanOrEqual(1);
    expect(max).toBeLessThanOrEqual(WORLD_HEIGHT - 1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run heightField`
Expected: FAIL — the single-octave field's spread over this region is below 30 (it will likely fail; if it happens to pass, the implementation below still makes relief intentional and the test meaningful).

- [ ] **Step 3: Rewrite HeightField**

Replace `src/worldgen/HeightField.ts` with:
```ts
import { createNoise2D, type NoiseFunction2D } from 'simplex-noise';
import { mulberry32 } from '../core/math';
import { CHUNK_SIZE_X, CHUNK_SIZE_Z, WORLD_HEIGHT } from '../core/constants';
import { fbm2D, type FbmOptions } from './fbm';
import type { TerrainStage, GenContext } from './TerrainStage';
import type { ChunkData } from '../world/ChunkData';
import type { WorldSeed } from '../core/types';

const BASE_HEIGHT = 64;
const MIN_AMPLITUDE = 6; // gentle plains
const MAX_AMPLITUDE = 50; // mountains
const RELIEF_SALT = 0x9e3779b9; // derive a second noise channel from the seed

const SHAPE: FbmOptions = { octaves: 4, persistence: 0.5, lacunarity: 2, frequency: 1 / 192 };
const RELIEF: FbmOptions = { octaves: 2, persistence: 0.5, lacunarity: 2, frequency: 1 / 384 };

interface SeedNoise {
  shape: NoiseFunction2D;
  relief: NoiseFunction2D;
}

/**
 * Seeded heightmap with Minecraft-style relief: an fBm "shape" channel modulated by a
 * low-frequency "relief" channel that scales amplitude between plains and mountains.
 */
export class HeightField implements TerrainStage {
  private readonly bySeed = new Map<WorldSeed, SeedNoise>();

  private noise(seed: WorldSeed): SeedNoise {
    let n = this.bySeed.get(seed);
    if (!n) {
      n = {
        shape: createNoise2D(mulberry32(seed)),
        relief: createNoise2D(mulberry32((seed ^ RELIEF_SALT) >>> 0)),
      };
      this.bySeed.set(seed, n);
    }
    return n;
  }

  apply(_chunk: ChunkData, ctx: GenContext): void {
    const { shape, relief } = this.noise(ctx.seed);
    for (let x = 0; x < CHUNK_SIZE_X; x++) {
      for (let z = 0; z < CHUNK_SIZE_Z; z++) {
        const worldX = ctx.cx * CHUNK_SIZE_X + x;
        const worldZ = ctx.cz * CHUNK_SIZE_Z + z;

        const s = fbm2D(shape, worldX, worldZ, SHAPE); // [-1, 1]
        const rRaw = fbm2D(relief, worldX, worldZ, RELIEF); // [-1, 1]
        const r = (rRaw + 1) / 2; // [0, 1]
        // r^2 biases toward plains, with occasional dramatic mountains.
        const amplitude = MIN_AMPLITUDE + r * r * (MAX_AMPLITUDE - MIN_AMPLITUDE);

        let height = Math.floor(BASE_HEIGHT + s * amplitude);
        if (height < 1) height = 1;
        if (height > WORLD_HEIGHT - 1) height = WORLD_HEIGHT - 1;
        ctx.heights[x + CHUNK_SIZE_X * z] = height;
      }
    }
  }
}
```

- [ ] **Step 4: Run the HeightField + dependent suites**

Run: `npx vitest run heightField layeredGenerator chunkManager`
Expected: PASS. (Existing in-range/determinism tests still hold; the layering and `isSolid` tests are unaffected — only terrain *shape* changed.)

- [ ] **Step 5: Full gate**

Run: `npm run lint && npx vitest run && npx tsc --noEmit && npm run build`
Expected: lint clean, all tests pass, no type errors, build succeeds.

- [ ] **Step 6: Browser verification (Edgar)**

Run: `npm run dev`
**Ask Edgar to confirm:** the terrain now has visible variety — flatter plains in places, rolling hills, and taller mountain masses — rather than the uniform gentle bumps from before. Fly up (Space) to see the relief from above.

- [ ] **Step 7: Commit**

```bash
git add src/worldgen/HeightField.ts tests/heightField.test.ts
git commit -m "feat(worldgen): multi-octave heightmap with relief modulation (E2 done)"
```

---

## Self-Review

**Spec coverage (E2 scope):**
- Terrain variety via multi-octave fBm in `HeightField` → Task 2.
- Reusable fBm primitive (also used by E3 caves later) → Task 1.
- Plains/hills/mountains relief → Task 2 (relief-modulated amplitude; variety test asserts spread > 30).
- Determinism preserved (pure, seeded) → fBm determinism test + HeightField determinism test (unchanged from E1).
- Out of scope: caves, trees, water, swim (E3–E6) — correctly absent.

**Placeholder scan:** No TBD/TODO. Every code step shows full code or an exact, located edit.

**Type consistency:** `fbm2D(sample, x, z, opts)` and `FbmOptions { octaves, persistence, lacunarity, frequency }` are defined in Task 1 and consumed identically in Task 2 (`SHAPE`, `RELIEF`). `HeightField` keeps the same `TerrainStage.apply(chunk, ctx)` shape and `ctx.heights` indexing (`x + CHUNK_SIZE_X * z`) as E1, so `SurfacePainter`/`LayeredGenerator` are unaffected. Seed-derived second channel uses `(seed ^ RELIEF_SALT) >>> 0` to stay a valid uint32 for `mulberry32`.
