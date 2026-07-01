# Render Distance & Load Speed — Tier 1 (cheap wins)

**Date:** 2026-06-30
**Branch:** `feat/render-distance-load`
**Status:** Design approved

## Goal

Make the world **load faster on spawn** and **render further** so more of the
environment is visible, without a worker/LOD rewrite. Push view distance to
whatever the machine sustains at 60 FPS. Also fix the night-time white star dots
that bleed over foreground terrain.

## Current limits (from code review)

- **Close horizon:** `VIEW_DISTANCE = 4` chunks (`src/core/constants.ts`) →
  9×9 = 81 chunks → ~64-block visible radius. The camera far plane (1000) is not
  the bottleneck. Geometry simply stops at the boundary — the hard edge.
- **Wasted fog:** the chunk shader already has distance fog
  (`uFogNear=40`, `uFogFar=220` in `ChunkMaterial.ts`), fed the sky color by
  `DayNight`. But geometry ends at 64 while fog doesn't saturate until 220, so
  there is no fade — just a cut-off.
- **Throttled, main-thread streaming:** `GEN_BUDGET=2`, `MESH_BUDGET=2`
  chunks/frame + a 6 ms/frame ceiling. Generation, greedy meshing, and lighting
  all run synchronously in the RAF loop.
- **Meshing scans dead air:** `GreedyMesher` sweeps the full `WORLD_HEIGHT=192`
  column in all directions even though terrain tops out ~y100 — roughly half the
  sweep is empty air.
- **Night stars overpaint terrain:** the star `Points` use `depthTest:false` +
  `transparent:true` (`CelestialSky.ts`). Three renders opaque terrain first, then
  transparent stars; with depth test off the stars paint over the already-drawn
  terrain (the dots on the grass). `renderOrder:-10` only sorts among transparent
  objects, not against the opaque pass.

These interact: cheaper per-chunk work is what makes a bigger view distance
affordable, so "load faster" and "render further" are one problem.

## Design

### 1. Height-capped meshing (the enabler — do first)

Skip meshing work above a chunk's tallest voxel.

- Track `maxSolidY` on `ChunkData`: raised O(1) in `set()` whenever a non-AIR
  voxel is placed. Generation and delta-application both go through `set()`, so it
  stays correct with no extra scan. (Monotonic: an edit that removes the top block
  may leave the cap one slice too high — harmless, still correct output.)
- At mesh time compute
  `capY = max(thisChunk.maxSolidY, 4 edge-neighbors' maxSolidY) + 1`
  (clamped to `WORLD_HEIGHT-1`) and pass it into `GreedyMesher.mesh()`. Cap only
  the **Y dimension** of each directional sweep to `capY+1`.
- **Provably identical output:** everything above the neighbor-inclusive max solid
  height is air, so it emits no faces and contributes no AO. This is pure speedup.

**Why neighbor-inclusive:** border faces and AO sample ±1 into neighbors, so the
cap must cover the tallest of the chunk and its 4 edge neighbors.

**Expected impact:** ~2× faster meshing on typical terrain (the dominant per-chunk
cost), which funds the bigger view distance.

### 2. Adaptive view-distance governor + fog retune

Make view distance a runtime value driven by measured frame time.

- `VIEW_DISTANCE` becomes the *initial* value; add `MIN_VIEW_DISTANCE` (4) and
  `MAX_VIEW_DISTANCE` (~12–16) bounds.
- New `ChunkManager.setViewDistance(vd)` setter: updates `opts.viewDistance` and
  forces a desired-set rebuild on the next `update()` (reset `lastCenterCx/Cz`).
- New always-on governor (own rolling frame-time window — independent of the
  DEV-only `FrameProfiler`, so it works in production):
  - **Grow** by one ring when window p95 frame time is comfortably under budget
    (~15 ms) AND `manager.streaming === false`, up to `MAX_VIEW_DISTANCE`.
  - **Shrink** by one ring when p95 sustains above ~19 ms (< ~52 FPS).
  - **Cooldown** after every change so the new ring streams in and stabilizes
    before the next decision — prevents oscillation.
- On any view-distance change, retune fog so the horizon fades into the sky right
  at the boundary: `uFogFar ≈ vd*16`, `uFogNear ≈ 0.55*uFogFar`, written to all
  three chunk materials. (Fog color stays owned by `DayNight`; only near/far
  change here.)

The governor's FPS ceiling is also what bounds the growth in draw calls, so no
separate batching is needed at this tier.

### 3. Cold-start budget burst

Fill the spawn area fast instead of visibly streaming at 2 chunks/frame.

- Raise gen/mesh budgets + the frame-work ceiling until the first full ring
  finishes (i.e. until `manager.streaming` first flips to `false`), then settle
  back to the smooth-roam throttle.
- Small, no UI, no synchronous stall. (Cheaper still now that meshing is ~2×
  faster.)

### 4. Night-star depth fix

Set `depthTest: true` on the star `PointsMaterial` (and the sun/moon sprites,
which share the identical latent bug). Stars sit at radius 480, well inside the
1000 far plane, so the depth buffer occludes them behind terrain while leaving
them visible through open sky — realizing the original "behind the terrain" intent.

## Testing & measurement

- **Unit:** capped mesh output byte-identical to uncapped for flat, tall-pillar,
  water-to-sea-level, and taller-neighbor chunks.
- **Unit:** `maxSolidY` tracking is correct across generation + edits.
- **Unit:** governor grows/shrinks/holds correctly against scripted frame-time
  sequences; respects cap, floor, and cooldown.
- **Manual:** `__vr.bench` scripted roam before/after (p95 frameMs, longFrames16,
  meanFps); eyeball the fogged horizon and the night sky in the preview.

## Non-goals / risks

- No web workers, no LOD (Tier 2/3 — revisit only if benchmarks demand it).
- `WORLD_HEIGHT` and the persistence save version are untouched.
- More chunks ⇒ more draw calls; bounded by the governor's FPS ceiling.
