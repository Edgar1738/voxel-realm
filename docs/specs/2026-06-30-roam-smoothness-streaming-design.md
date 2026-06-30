# Roam Smoothness — Streaming Pipeline (P0–P7) — Design

- **Date:** 2026-06-30
- **Status:** Proposed (planning only — no code written). Addresses observed roam lag: terrain "renders out" (pop-in) and the camera hitches while moving.
- **Branch:** to be created fresh off `main` (one worktree per phase, torn down after merge).
- **Origin:** Deep-dive review of the streaming pipeline. Root cause (verified): terrain generation, lighting, and meshing all run **synchronously on the render thread** inside the rAF tick, and the `MESH_BUDGET = 2` count balloons to ~10 remeshes/frame via an unbudgeted neighbor pass. There are **no Web Workers** anywhere in `src` (grep: 0 matches).

## Context

The render loop is a plain `requestAnimationFrame` tick: each frame it calls `onFrame(dt)` then `renderer.render()` — `src/render/Renderer.ts:39-50`. `onFrame` calls `manager.update(playerChunkX, playerChunkZ)` every frame — `src/app/Game.ts:224-236`. `ChunkManager.update` (`src/world/ChunkManager.ts:105-152`) then, on the main thread, before the frame can paint:

- Rebuilds the desired-set (`desiredSet`, `:491-502`), scans all loaded keys to unload (`:109-117`), and sorts up to `(2·VIEW_DISTANCE+1)² = 81` chunks nearest-first (`:120-125`) — **every frame, even when the player has not crossed a chunk boundary** (no early-out at the top of `update`).
- **Generate pass** (`:128-132`): up to `GEN_BUDGET = 2` chunks. Each `ensureGenerated` (`:505-515`) procedurally fills a 16×192×16 = 49,152-voxel chunk, applies overlays, **clones the full 49,152-byte array** into `baseChunks` (`cloneChunk`, `:596-600`, called `:510`), applies saved deltas, and runs a **full sky+block light recompute** + border seed (`recomputeLight`, `:524-551`).
- **Mesh pass** (`:135-151`): up to `MESH_BUDGET = 2` chunks in the main loop, **but** each meshed chunk also `recomputeLight`s and remeshes up to 4 already-meshed edge neighbors **outside the budget counter** (`:144-150`). So one frame can do **2 generations + up to 10 remeshes + up to 8 full relights**. Each remesh runs `emitShaped` (full 49,152-voxel scan, no early-out — `src/mesh/emitShaped.ts:442-456`), two greedy passes, and **disposes + recreates** `BufferGeometry`/`Mesh` (`src/render/ChunkMeshRegistry.ts:26-58,98-114`; `src/render/buildChunkMesh.ts:5-16`).

Constants: `VIEW_DISTANCE = 4`, `GEN_BUDGET = 2`, `MESH_BUDGET = 2`, chunk = 16×192×16 — `src/core/constants.ts:1-16`. GPU defaults compound it: `antialias: true` + uncapped `setPixelRatio(window.devicePixelRatio)` — `src/render/Renderer.ts:16-17`.

**Why both symptoms appear:** tiny budgets (2/2) make new terrain trickle in over several frames → **pop-in**; the unbudgeted neighbor pass plus heavy synchronous gen/light spike individual frame times → **hitch**. Same root cause: the chunk pipeline is synchronous on the render thread and its real per-frame cost is unbounded and partly redundant.

## Goals

1. **Measure** the hitch repeatably so every fix is validated by numbers, not feel (P0).
2. Eliminate per-frame waste while standing still (P1) and redundant remeshes while roaming (P2).
3. Cut per-remesh cost (P3) and per-frame GPU cost (P4).
4. Bound per-frame chunk work so a single frame can never spike (P5).
5. Move the heavy work off the render thread entirely (P6), then trim allocation/GC and prioritize the view cone (P7).

## Non-goals

- No gameplay/worldgen/save-format/block-id changes. Streaming *output* (which chunks render, and their geometry/light) stays pixel-identical except where a phase explicitly defers work by a frame.
- P0 changes **no** streaming behavior (measurement only).
- The Web Worker rewrite (P6) is sketched here but **must get its own dedicated design doc before implementation** — it is the one large, risky change.

## Invariants preserved (all phases)

- Final rendered geometry + baked light for any settled chunk are **identical** to today's output (golden-comparable). Phases P2/P5 may make a seam correct **one frame later**, never wrong at rest.
- Collision/edit reads (`collisionBoxesAt`, `getBlock`, `applyEdits`) keep reading **main-thread** chunk data (P6 keeps chunk voxel data on the main thread; only gen/light/mesh compute moves to workers).
- Determinism: fixed `SEED = 1337` (`src/app/Game.ts:34`) + preset ⇒ identical terrain and identical total gen/mesh work along a fixed path.
- All phases keep `npm run build` / `npm test` / `npm run lint` green (baseline this branch: 91 files / 596 tests).

---

## P0 — Roam profiling spike (measurement only)

**Effort:** S. **Depends on:** nothing. **Do first** (cheap insurance before the P6 rewrite).

### Problem
We cannot validate any fix without measuring `update()` cost and gens/remeshes per frame during a repeatable roam. The Dev HUD refreshes on a 225 ms `setInterval` (`src/app/DevHud.ts:3,62`), so it cannot itself sample per-frame data — it can only display a rolling summary that something else accumulates per frame.

### Metrics
Per sampled frame: `frameMs` (inter-frame dt×1000), `updateMs` (time inside `manager.update`), `genCount` (chunks generated this frame), `meshCount` (`meshChunk` calls this frame — **includes neighbor-bypass remeshes**). Summary: p50/p95/p99/max of `frameMs` and `updateMs`; `totalGens`, `totalMeshes`; `peakMeshesPerFrame`, `peakGensPerFrame`; `framesSampled`, `meanFps`, long-frame counts (>16.7 ms, >33 ms).

**Determinism model** (state in the summary header):
- **Portable** (machine-independent; function of seed+preset+path): `totalGens`, `totalMeshes`, chunks loaded. Use these for hard before/after proof — esp. P2 (total remeshes must drop).
- **Same-machine** (frame-rate dependent): `frameMs`/`updateMs` percentiles, `meanFps`, long-frame counts. The bench drives movement by `speed·dt`, so the **spatial path is frame-rate-independent**, which is what makes the totals portable.

### Components / files
1. **`ChunkManager` per-update counters** — `src/world/ChunkManager.ts`. Add `interface ChunkFrameStats { genCount; meshCount; updateMs }`, reset at the top of `update()`, finalized at the end (wrap the body in `performance.now()`); increment `genCount` in `ensureGenerated` on a true return, `meshCount` in `meshChunk`. Expose `get lastFrameStats(): Readonly<ChunkFrameStats>`. Cost = a few integer adds/frame; keep always-on so it is unit-testable without dev mode.
2. **`FrameProfiler`** — new `src/app/FrameProfiler.ts` (pure, testable): bounded ring buffer of `FrameSample { frameMs; updateMs; genCount; meshCount }` with `push`, `reset`, `summary(): BenchSummary` (percentile math here).
3. **Per-frame sampling hook** — `src/app/Game.ts` render callback (`:224-236`), dev-only single guard: after `manager.update`, push `{ frameMs: cdt*1000, ...manager.lastFrameStats }`; before `player.update`, call an optional roam-driver step. Express as one injected optional object so prod is untouched.
4. **Live HUD rows** — `src/app/DevHud.ts` + `src/app/DevState.ts`: add `Upd ms` (p50/max), `Mesh/f` (peak), `Gen/f` (peak), `FPS` to `DevState`/`collectDevState`/`formatDevHudRows`; HUD reads the profiler's rolling last-~1s summary.
5. **`window.__vr.bench(...)`** — `src/app/DevControls.ts` (add to the `api` object near `:775-781`; it already closes over `manager`, `player`, `rig`).

### `bench` API & algorithm
```ts
__vr.bench({ axis?='x', distance?=256, speed?=FLY_SPEED(30), warmupMs?=1500, start?=currentPose }): Promise<BenchSummary>
```
1. Save prior pose/fly state; set `player.flying = true`; teleport to `start`; face `axis`.
2. **Warm-up** for `warmupMs` (no sampling) so we measure steady-state roam, not cold spawn-load. (Optionally keep the warm-up samples as a separate `coldLoad` report for Phase-1 spawn-framing work.)
3. **Measured roam:** each frame advance `player.position[axis] += speed*dt` (frame-rate-independent path), let the normal loop run `manager.update`, then push one `FrameSample`; stop when `distance` covered.
4. Restore prior pose; `console.table` the summary with a header line (seed/preset/start/axis/distance/speed/budgets + the determinism caveat); return it; best-effort copy JSON to clipboard (try/catch).

### Tests
- `FrameProfiler` percentiles from known arrays (p50/p95/p99/max + long-frame counts).
- `ChunkManager` counters: drive a known boundary crossing; assert `lastFrameStats.genCount`/`meshCount`; assert `meshCount` reflects neighbor-bypass remeshes (the baseline P2 will improve).
- Bench path stepping extracted to a pure helper; same spatial waypoints for different `dt` sequences over the same `distance`.
- Dev-only artifacts excluded from the prod bundle (consistent with `src/app/Game.ts:242-268`).

### Acceptance
- `await window.__vr.bench()` prints + returns a full `BenchSummary` and a clipboard JSON; reruns give identical portable metrics.
- HUD shows live `Upd ms`/`Mesh/f`/`Gen/f`/`FPS` while roaming.
- `meshCount` visibly exceeds `MESH_BUDGET` on boundary frames (demonstrates the bypass — the baseline P2/P5 improve).
- Zero production behavior/bundle change.

---

## P1 — `update()` early-out when the center chunk is unchanged

**Effort:** S. **Depends on:** P0 (to measure `updateMs` drop). **Metric:** lowers `updateMs` p50; totals unchanged.

### Problem
`update()` recomputes the desired-set, unload scan, and an 81-entry nearest-first **sort every frame**, including while the player stands still or moves within one chunk — `src/world/ChunkManager.ts:105-125,491-502`. Pure per-frame waste.

### Change
Cache `lastCenterCx/lastCenterCz` and the sorted `ordered` list plus a `hasPendingWork` flag.
- **Center changed:** recompute desired-set, run the unload scan, rebuild + cache `ordered`, set `hasPendingWork = true`.
- **Center unchanged:** skip desired-set/unload/sort entirely; if `hasPendingWork`, drain the gen/mesh budget over the cached `ordered` (so a post-spawn/post-teleport backlog still streams in); when a drain completes with nothing left to gen/mesh, clear `hasPendingWork`.
- **Center unchanged AND no pending work:** return immediately.

Unloading only changes when the center moves, so gating it on center-change is correct. The backlog still drains because `hasPendingWork` keeps the budget loops running over the cached `ordered`.

### Risk
Low. Must not (a) skip unloading after a move — handled (unload runs on center change), or (b) stall a backlog while standing still — handled (`hasPendingWork`). Extract `recomputeDesired()` so it is spy-able in tests.

### Tests
- Standing still after load → `recomputeDesired` not called; zero `meshChunk`/`ensureGenerated`.
- Moving to a new chunk → `recomputeDesired` called once; unload runs.
- Teleport then stand still → backlog drains across frames under budget until empty, then quiesces to zero work.

### Acceptance
Per the bench: with the player stationary on a settled world, `updateMs` p50 ≈ 0 and `genCount`/`meshCount` are 0; roam totals unchanged vs P0 baseline.

---

## P2 — Remove redundant remeshes while roaming (per-frame dedup + relight guard)

**Effort:** S–M. **Depends on:** P0. **Metric:** lowers `totalMeshes` (portable proof) and `updateMs`.

### Problem
When a chunk meshes in the main loop, it unconditionally `recomputeLight`s **and** remeshes each already-meshed edge neighbor — `src/world/ChunkManager.ts:144-150`. Two redundancies:
1. **Redundant remesh.** The generate pass (`:128-132`) runs fully **before** the mesh pass (`:135-151`), so by mesh time every chunk that will generate this frame already has its voxel data present. `meshChunk` reads neighbor *voxel data* via `VoxelView`/`neighborData` (`:580,591-593`), not neighbor *mesh state*. Therefore a chunk meshed **this frame** was already culled correctly against its (already-generated) neighbors; remeshing it again because an adjacent chunk meshed later **this frame** produces byte-identical geometry — pure waste. (A neighbor meshed in a **previous** frame, before this chunk's data existed, genuinely needs the remesh — that one is legitimate and must be kept.)
2. **Redundant relight.** The full `recomputeLight(nb.data)` (`:147`) only matters if the newly-meshed chunk changes the light crossing into the neighbor. For ordinary terrain with no emitter at the seam, the incoming border light is unchanged (0), so the relight is wasted.

> ⚠️ **Do NOT simply drop the neighbor remesh, or guard it on light-export change alone.** A chunk appearing next to a neighbor that was meshed in a *previous* frame legitimately changes that neighbor's **boundary geometry** (faces toward the now-present chunk must re-cull). Dropping it causes stale seam faces (double walls / z-fighting). The fix is to remove only the **provably redundant** repeats, not the legitimate first remesh.

### Change
- **P2a (primary): per-frame remesh dedup.** Add a private `meshedThisFrame: Set<string>` cleared at the top of `update()`. In the main mesh loop and the neighbor loop, skip a chunk already in the set; `meshChunk` records its key. This drops exactly the redundant same-frame remeshes (case 1) and keeps the legitimate previous-frame neighbor remeshes. Provably output-identical.
- **P2b (secondary): relight guard.** In the neighbor loop, only call `recomputeLight(nb)` when the newly-meshed chunk contributes non-zero border light toward that neighbor (reuse the stored `borderExports` for the new chunk; for pure terrain the relevant edge export is 0 → skip). Always still remesh the neighbor for the seam (subject to P2a dedup).

The edit path (`applyEdits`, `:330-344`) already guards neighbor work on `exportChanged`; P2 brings the **load** path to parity.

### Risk
P2a: none (identical output). P2b: must keep lighting correct when an emitter sits at a chunk seam — pin with a parity test.

### Tests
- Two new chunks sharing a neighbor mesh in one frame → that neighbor is meshed **once** (not twice); output identical to today.
- A neighbor meshed in a previous frame is still remeshed when a new chunk appears beside it (seam stays correct — golden compare).
- P2b: an emitter placed at a chunk border still lights the adjacent chunk (relight not skipped when export is non-zero); pure-terrain seam skips the relight.

### Acceptance
Per the bench: `totalMeshes` over a fixed roam drops measurably vs P0 baseline with **zero** change to settled rendered output (golden frame compare).

---

## P3 — `emitShaped` early-out for chunks with no shaped blocks

**Effort:** S–M. **Depends on:** P0. **Metric:** lowers per-remesh time (`updateMs`), biggest on plain terrain (the majority of chunks).

### Problem
`emitShaped` scans all 49,152 voxels and calls `registry.shape(id)` for each, **every remesh**, with no early-out even when the chunk has zero shaped blocks — `src/mesh/emitShaped.ts:442-456`.

### Change
Track a per-chunk `hasShaped` boolean on `ChunkData`. Set it during `ensureGenerated` (one scan after generate+overlays+deltas) and set it `true` whenever an edit writes a block whose shape is slab/stair/fence/wall/gate/cross (`applyEdits`). `emitShaped` returns empty buffers immediately when `!hasShaped`. The flag is **monotonic** (never cleared): a stale `true` only costs one extra scan (safe); a missed `true` would drop geometry (bug) — so only ever set it, never clear it, and always set it on shaped writes.

### Risk
Low, given the monotonic rule. The one-time scan at generation replaces N scans across the chunk's remesh lifetime — net win.

### Tests
- `emitShaped` returns empty without scanning when `hasShaped` is false; identical output when true.
- Editing a shaped block into a previously-plain chunk sets the flag and the next mesh includes the shaped geometry.

### Acceptance
Per the bench on the default (mostly-plain) world: `updateMs` mesh cost drops; rendered output identical (golden compare).

---

## P4 — Cap device pixel ratio

**Effort:** S. **Depends on:** nothing (independent). **Metric:** lowers `frameMs` on high-DPI displays → fewer long frames.

### Problem
`setPixelRatio(window.devicePixelRatio)` is uncapped — `src/render/Renderer.ts:16-17`. On a 2× display this quadruples fragment work; with `antialias: true` on top, every hitchy frame also pays full-resolution MSAA.

### Change
`this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_DPR))` with `MAX_DPR = 2` (new constant). Re-apply in `onResize` (`:67-71`) in case the window moves to a different-DPI monitor. Keep `antialias: true` for now; a render-scale / MSAA toggle can come later with the Phase-2 accessibility settings work.

### Risk
Minimal — slight sharpness reduction on >2× displays.

### Tests
Unit a `clampDpr(dpr, max)` helper; manual FPS via the bench on a high-DPI machine.

### Acceptance
On a >2× display, bench `frameMs` p95 improves with no visible quality regression at default.

---

## P5 — Budget unification + millisecond ceiling

**Effort:** M. **Depends on:** P0 (to tune the ceiling), complements P2. **Metric:** caps `frameMs`/`updateMs` p99 (no spikes); `totalMeshes` unchanged (work deferred, not dropped).

### Problem
Budgets are **counts**, not time, and neighbor remeshes bypass the count entirely — `src/world/ChunkManager.ts:135-151` + `src/core/constants.ts:13-16`. A frame that generates two dense chunks and remeshes ten neighbors has no millisecond ceiling.

### Change
- Count **all** `meshChunk` calls during `update()` (including legitimate neighbor remeshes) against a unified mesh budget.
- Add a wall-clock ceiling: stop **starting** new gen/mesh work once `performance.now() - frameStart > FRAME_WORK_MS` (start ~6 ms; tune from P0). Always finish the unit in progress; never split a single chunk mid-mesh.
- Defer overflow legitimate neighbor remeshes to a `pendingRemesh` queue drained next frame under the same budget. A one-frame-late seam is invisible; a hitch is not. Keep nearest-first ordering for the queue.

### Risk
M. Must guarantee deferred remeshes eventually run (bounded latency) so seams aren't left stale for long; cap queue starvation by always draining oldest-first. Pin with tests.

### Tests
- Per-frame `meshChunk` count ≤ budget even across a boundary crossing (vs the P0 baseline where it exceeds `MESH_BUDGET`).
- Deferred remeshes complete within a bounded number of frames; settled seams match a synchronous full-mesh reference (golden compare).
- Time ceiling halts new work but never leaves a half-built chunk.

### Acceptance
Per the bench: `frameMs`/`updateMs` p99 drop sharply; `totalMeshes` unchanged vs P2 baseline (distribution flattens, work not dropped).

---

## P6 — Web Worker pool for generation, lighting, and meshing (the durable fix)

**Effort:** L. **Depends on:** P0–P5 landed and measured. **Requires its own dedicated design doc before implementation.** **Metric:** main-thread `updateMs` for gen/mesh → ≈0 (only GPU upload remains); enables raising `VIEW_DISTANCE`/budgets to kill pop-in without reintroducing hitches.

### Problem
All gen/light/mesh runs on the render thread (grep: 0 `Worker` in `src`). Even perfectly budgeted, heavy chunks still steal time from the frame.

### Design sketch (not a full spec)
A worker pool (size ≈ `min(navigator.hardwareConcurrency-1, N)`). The mesher and light functions are already pure over typed arrays (`Generator.generateBaseChunk`, `computeChunkLight`, `GreedyMesher.mesh`, `emitShaped`), so they serialize cleanly:
- Main posts a job `{ seed, cx, cz, presetParams, chunkSavedDeltas, neighborBorderData }`; the worker generates base + overlays + deltas, computes light, meshes opaque/transparent/cutout, and posts back **transferable** `ArrayBuffer`s (positions/normals/uv/light/indices per pass) **plus** the chunk's voxel `Uint8Array` (needed on main for collision/edits).
- Main thread only stores chunk data and uploads geometry to the GPU under a small per-frame budget.

### Risks / open questions to resolve in the dedicated doc
- **Neighbor data for seam culling:** a worker meshing chunk C needs C's 4 neighbors' border voxels. Options: pass the 4 neighbor border planes with the job; or mesh with a 1-voxel apron; or generate in workers but border-seed light / final-mesh on main. Pick one in the dedicated doc.
- **Light border-seed** reads neighbors — decide whether to seed in-worker (pass neighbor exports) or on main.
- **Edits:** re-mesh edited chunks via the pool (post updated voxels); keep `applyEdits` mutation + `baseChunks` revert-detection on main.
- **Determinism:** worker RNG is seed-based (already deterministic) — pin with a golden equality test.
- **Fallback:** if `Worker` is unavailable, fall back to the synchronous path (P1–P5).

### Tests
- Golden equality: worker vs main mesh+light for a fixed seed+chunk (serialization boundary).
- Pool lifecycle: dispose terminates all workers; in-flight jobs cancel cleanly.
- Synchronous fallback path covered.

### Acceptance
Per the bench: main-thread `updateMs` for gen/mesh ≈ 0; `frameMs` stays flat during roam at a raised `VIEW_DISTANCE`; settled output identical to the synchronous pipeline.

---

## P7 — Supporting cleanups (each its own small PR/spec later)

**Depends on:** P6 (validate against the worker baseline). Briefly:

- **P7a — Geometry reuse.** Update `BufferAttribute`s in place when vertex capacity allows instead of dispose+recreate per remesh — `src/render/ChunkMeshRegistry.ts:26-58,98-114`; reallocate only when capacity grows. Cuts GC stutter during roam. **M.**
- **P7b — Sparse base / drop the full clone.** Replace the per-chunk full `cloneChunk` into `baseChunks` (`src/world/ChunkManager.ts:510,596-600`) with a sparse override/diff or regenerate-for-compare, so revert-detection (`:464-469`) and save deltas stay byte-identical while per-generation allocation drops. **M–L.**
- **P7c — Forward-biased / frustum ordering.** Bias the nearest-first sort (`:120-125`) toward the camera's view cone so work isn't spent on chunks behind the player. **M.**

Each carries a golden-output test (settled render identical) plus a bench delta.

## Data flow (target, after P5; P6 moves the compute box to a worker)

```
player moves ─► Game.onFrame(dt) ─► manager.update(centerCx, centerCz)
  center unchanged & idle ........................ return (P1)
  else: [recompute desired/unload/sort only on center change (P1)]
        generate pass (budget) ─► ensureGenerated (P7b: sparse base)
        mesh pass (unified budget + ms ceiling, P5):
          meshChunk (dedup per frame, P2a) ─► emitShaped (early-out, P3)
                                            ─► greedy passes ─► upload (P7a reuse)
          legitimate neighbor remesh ─► relight only if border light changed (P2b)
                                     ─► overflow ─► pendingRemesh queue (next frame, P5)
  renderer.render() at clamped DPR (P4)
        └─ [P6: gen/light/mesh run in worker pool; main only uploads buffers]
profiler.push({ frameMs, updateMs, genCount, meshCount })  ─► HUD / __vr.bench (P0)
```

## Rollout

Land in order **P0 → P1 → P2 → P3 → P4 → P5**, each its own worktree/PR off `main`, each validated by a `__vr.bench()` before/after delta recorded in the PR description. P0 is the gate: do not commit to or skip P6 without P0 numbers showing how much main-thread stall remains after P1–P5. P6 gets its own design doc; P7a–c follow as small PRs. After P5 and again after P6, update the `voxel-realm-codebase-improvements` memory with the new streaming model and measured gains.
