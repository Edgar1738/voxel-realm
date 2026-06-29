# Stability & Agent-API Hardening Sweep — Design

- **Date:** 2026-06-28
- **Status:** Approved (design); implementation plan pending
- **Branch:** `claude/stability-hardening` (off `main` @ `a95b255`)
- **Origin:** Triage of an independent Codex code review (Cluster 1: agent-API hardening) merged with the Track A stability backlog from the 2026-06-28 multi-agent review. Every item was verified against the code before inclusion.

## Context

PR #24 made the block registry data-driven and gave the dev `__vr` studio reliable, expressive builds. A follow-up Codex review plus our own prior review converged on one theme: the **agent-facing APIs are powerful but under-validated and unbounded**, and a set of **stability/security/correctness** issues remain. This plan closes both: it hardens the `__vr`/edit boundary (including two real bugs introduced in PR #24's group-undo) and clears the Track A backlog.

## Goals

1. An agent (or untrusted blueprint) cannot crash the renderer, corrupt a save, or OOM the tab through the `__vr`/edit APIs.
2. Undo/redo semantics are correct under grouping (no lost redo, no premature group commit).
3. Read/introspection APIs are honest about unloaded/capped regions.
4. The dev disk endpoints validate untrusted input; saves survive tab close.
5. Known render/worldgen/player correctness + perf debt is cleared.

## Non-goals

- "Custom texture spec stable keys" — YAGNI; there are zero `custom` specs in `BLOCK_DEFS`. Revisit when one is added (then require a caller-provided key).
- New content or non-cube block shapes (Tracks C/E — separate plans).
- Type-aware ESLint ruleset adoption (separate large cleanup).

## Invariants preserved

- Block ids in `src/blocks/blocks.ts` are append-only; the on-disk/IndexedDB save schema and `SAVE_VERSION` are unchanged.
- The mesher contract `BlockRegistry.faceLayer(id, face): number` is unchanged.
- `DevControls.ts`/`__vr` stays dev-only (`import.meta.env.DEV`).
- Strict TS / no `any`; CI runs `tsc` + lint + vitest + build.

## Design decisions (the resolved forks)

1. **Invalid block ids → dropped and reported, not thrown**, and validated only at the `__vr`/dev edit boundary (and untrusted-blueprint load). The engine `ChunkManager.applyEdits` stays trusting because worldgen feeds it known ids on the hot path.
2. **Caps reuse existing limits** — `MAX_BUILD` (50 000) as a total preflight cap; 200 000 as the box-read/scan cap. No new tunables.
3. **Honest reads both preload (best-effort) and report** unloaded chunks in the result.
4. **Transparent ordering = per-chunk distance `renderOrder`**, not weighted-blended OIT.
5. **Border block-light removal = a real de-propagation BFS**, not a workaround.

---

## Phase 1 — Edit-path validation & undo correctness

### 1a. Block-id validation at the `__vr`/edit boundary
**Problem:** `ChunkManager.applyEdits` (`src/world/ChunkManager.ts:215`) writes `edit.id` straight into a `Uint8Array` (`ChunkData.set:41`), which wraps values mod 256; `updateDelta:216` persists the **raw** id. A bad id (agent typo, or untrusted `loadBlueprint`/`paste` JSON) is stored wrapped, persisted raw, and then crashes meshing when the registry is queried on the wrapped value.
**Fix:** In `DevControls.applyAny` (the single funnel for every `__vr` build), filter voxels through `registry.has(id)` before applying. Dropped voxels are counted as a new `EditResult.invalid` field (added alongside `unloadedChunks`). No throw. The block-id range check below makes the storage invariant explicit.

### 1b. Registry self-check additions
**Problem:** `BlockRegistry.selfCheck` (`src/blocks/BlockRegistry.ts:24`) validates face-layer resolution but not the `Uint8Array` storage invariant or light range.
**Fix:** Add to `selfCheck`: every `BLOCK_DEFS` id is an integer in `[0, 255]`; every `light` (when present) is an integer in `[0, 15]`. Fail loudly at boot.

### 1c. Prefab-load validation
**Problem:** `loadBlueprint`/`stamp`/`paste` (`src/app/DevControls.ts`) accept arbitrary JSON `Prefab`s.
**Fix:** A pure `validatePrefab(p)` in `src/core/Prefab.ts`: `dims` are positive integers; `blocks` length within a cap; each `[dx,dy,dz,id]` has non-negative integer offsets within `dims` and `registry.has(id)` (id check done where the registry is available — `validatePrefab` checks structure, the caller checks ids). `loadBlueprint`/`stamp` reject (throw) invalid prefabs with a clear message.

### 1d. Fix redo-clear regression (#5) + nested-group guard (#6)
**Problem:** `EditService.beginGroup` (`src/edit/EditService.ts:51`) clears the redo stack unconditionally; every `__vr` build runs through `group()`, so a zero-change build (e.g. `replace` with no matches) destroys redo. Nested `group()` calls: the inner `endGroup` (`:61`) commits the outer group's accumulated changes early.
**Fix (single chosen approach):**
- Move `redoStack.length = 0` out of `beginGroup` and into `apply()` so redo is cleared **only when a real change is recorded** (the existing non-grouped `apply` already does this; the grouped path must too). An empty group leaves redo intact.
- Replace the boolean-ish `pending` with a **depth counter** plus one accumulating buffer: `beginGroup` increments depth (allocating the buffer on 0→1); `apply` appends to the buffer while depth > 0; `endGroup` decrements and commits the single batch **only when depth returns to 0**. Nested `group()` calls are therefore safe and commit exactly once.

### 1e. `paste`/`stamp` return types
`paste` and `stamp` (`src/app/DevControls.ts`) are annotated `EditResult` but return `BatchedEditResult` (we fixed the other five methods in PR #24). Correct the annotations.

---

## Phase 2 — Bounding agent ops & honest reads

### 2a. Preflight caps before allocation (#3)
**Problem:** `__vr.array`→`repeat` (`src/core/Prefab.ts`) and `__vr.replace`→`replaceVoxels` (`src/app/RegionOps.ts`) build arrays with no total cap; the `MAX_BUILD` check in `applyBatch` is per-batch and the array is pre-sliced ≤ cap, so it never bounds the total. A large `array`/`replace` can OOM/freeze the tab.
**Fix:** `applyAny` computes the requested voxel count and throws a clear error if it exceeds `MAX_BUILD` **before** allocation where possible. For `repeat`, validate `nx*ny*nz*blocks.length ≤ MAX_BUILD` before building. For `replace`/`scan`-style box reads, enforce the existing 200 000-voxel box cap before scanning.

### 2b. Honest read APIs (#7)
**Problem:** `scan`/`slice`/`surface` (`src/app/DevControls.ts`) read via `manager.getBlock`, which returns AIR for unloaded chunks, with no signal. `copy` now best-effort preloads but silently no-ops the preload on a >256-chunk box.
**Fix:** `scan`/`slice`/`copy` best-effort `preloadBox` their region, then include an `unloaded: string[]` (chunk keys touched that were not loaded at read time) in their return value. `surface` returns an `unloaded: boolean` when the column's chunk is missing.

---

## Phase 3 — Persistence & dev-server hardening

### 3a. Server-side payload validation (#8)
**Problem:** `/__world` chunk writes (`vite.config.ts`, `server/worldDiskStore.ts`) only check that `entries` are integer pairs.
**Fix:** Reject a chunk write whose `entries.length > CHUNK_VOLUME`, or any entry whose voxel index is out of `[0, CHUNK_VOLUME)` or whose block id is out of `[0, 255]`. Return a 4xx with a clear message.

### 3b. `/__world` GET origin guard + port/host-aware guard
**Problem:** `/__world` GET/list lacks the `isAllowedDevOrigin` guard that POST/DELETE have (`vite.config.ts:132`); `devRequestGuard.isAllowedDevOrigin` (`server/devRequestGuard.ts:18`) allows any `localhost` origin regardless of the server's host/port.
**Fix:** Apply the guard to GET/list for consistency. Tighten the guard to compare the request `Origin` against the server `Host` (same host:port) or an explicit allowlist.

### 3c. Save-on-close durability (#9)
**Problem:** `persistence.ts` `pagehide` (`src/app/persistence.ts:56`) starts async `fetch` saves (`ServerSaveStore.post`) that browsers may not complete on unload.
**Fix:** `ServerSaveStore` server writes use `fetch(url, { keepalive: true, ... })` so in-flight unload writes are honored.

### 3d. `ServerWorldCatalog` error checking
`copyWorld`/`deleteWorld` (`src/persistence/ServerWorldCatalog.ts:15`) ignore `res.ok`. Throw on non-2xx, mirroring `ServerSaveStore.post`.

---

## Phase 4 — Render / worldgen correctness & perf

### 4a. Transparent depth sort (#10)
Transparent chunk meshes (`src/render/ChunkMeshRegistry.ts:41`) are added unsorted with `depthWrite:false`. Assign a per-chunk `renderOrder` from camera distance (updated in the render loop) so glass/water blends back-to-front. No OIT.

### 4b. Border block-light de-propagation
`world/Lighting.ts` border export only **raises** neighbor light; removing an emitter near a seam leaves the neighbor too bright until an incidental recompute. Add a light-removal (de-propagation) BFS so deletions lower cross-chunk light correctly.

### 4c. Biome cache key (#2)
`BiomeMap.biomeAt` (`src/worldgen/BiomeMap.ts:87`) packs coords with `& 0xffff`, aliasing coordinates 65 536 apart. Replace with a collision-free key (e.g. a string `"x,z"` key, or widen the pack) so far-roaming biomes are stable.

### 4d. Mesher allocation pooling
`GreedyMesher` (`src/mesh/GreedyMesher.ts:68,169,221,273`) reallocates output arrays, `mask`, `visited`, and quad-corner arrays per rebuild. Pool the mask/visited buffers (sized to the max slice) and reuse output scratch on the instance. **Guard with before/after timing** in the report — only land if it doesn't regress.

### 4e. `preloadBox` two-pass (#4)
`preloadBox` (`src/world/ChunkManager.ts:378`) calls `preload(cx,cz,0)` per chunk, meshing early chunks before neighbors exist → stale seam light/AO until a relight. Split into: generate all chunks in the box first, then mesh/light in a second pass. Cosmetic today (self-heals on edit) but removes the artifact for captures.

---

## Phase 5 — Player & test hygiene

### 5a. Swim + step-up correctness
`PlayerController.submerged` (`src/player/PlayerController.ts:55`) samples only the body-center voxel → wrong physics in shallow/partial water. Sample feet and head (center ± half-height). `Collision` diagonal step-up (`src/player/Collision.ts:93`) can over-pop vertically into a corner — cap net vertical gain per substep.

### 5b. `worldToChunkCoord` axis safety
`worldToChunkCoord`/`worldToLocal` (`src/core/coords.ts:26`) hardcode `CHUNK_SIZE_X` for both axes. Add a startup/compile assertion that `CHUNK_SIZE_X === CHUNK_SIZE_Z`, or parameterize, so a future divergence fails loudly.

### 5c. Registry constructor injection + throw-path tests
`BlockRegistry` reads global `BLOCK_DEFS` (`src/blocks/BlockRegistry.ts:15`), making failure paths untestable. Add an optional constructor parameter for `defs` (defaulting to `BLOCK_DEFS`) and matching `BLOCK_TEXTURES`, then add tests for the `selfCheck` duplicate-id / out-of-range / faceless / id-range / light-range throw paths.

### 5d. `structures.test.ts` perf
`tests/structures.test.ts` uses per-voxel `expect` in nested loops (a 20 s timeout once in a full run). Replace with aggregate-count assertions or a single scan assertion.

---

## Data flow / interfaces (new or changed)

- `EditResult` gains `invalid: number` (id-rejected voxels); `BatchedEditResult` aggregates it. Read results (`scan`/`slice`/`copy`) gain `unloaded: string[]`; `surface` gains `unloaded: boolean`.
- `BlockRegistry` constructor: `new BlockRegistry(defs?, textures?)`.
- `validatePrefab(p: Prefab): string | null` (null = valid; string = reason) in `src/core/Prefab.ts`.
- No change to `faceLayer`, the save schema, or the mesher's read path.

## Error handling

- Edit-path id rejection is non-fatal (drop + count); oversized builds/reads throw a clear, caught-friendly error before allocation; registry/self-check and prefab-load validation throw at their boundary.
- Server payload rejection returns a 4xx, never writes.

## Testing strategy

New/extended vitest coverage: id-rejection in the edit funnel (incl. `EditResult.invalid`); registry self-check throw paths (via injected defs); `validatePrefab`; group redo-clear + nested-group depth semantics; region-op preflight caps; honest-read `unloaded` reporting; server payload validation (index/id/count bounds); origin-guard host/port; `ServerWorldCatalog` non-2xx throw; biome-cache far-coordinate stability; border-light de-propagation on deletion; swim feet/head + step-up cap; `worldToChunkCoord` axis assertion; faster `structures.test`. Transparent sort + mesher pooling + `preloadBox` two-pass verified by build + targeted/perf checks (hard to unit-test rendering).

## Rollout

One branch, phases landed in order (each a coherent commit set). CI green per phase. After merge, update the `voxel-realm-codebase-improvements` and `voxel-realm-agent-playground` memories.
