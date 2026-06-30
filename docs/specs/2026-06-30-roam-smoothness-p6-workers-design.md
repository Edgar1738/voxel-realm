# Roam Smoothness P6 — Web Worker Meshing Pool — Design

- **Date:** 2026-06-30
- **Status:** Proposed (planning only — no code written). Dedicated design doc required by the parent plan before implementing P6 (`docs/specs/2026-06-30-roam-smoothness-streaming-design.md`).
- **Depends on:** P0–P5 landed (commits `cef9673`, `a444a84`). P5's unified budget + deferred-remesh queue are the integration point.
- **Branch:** to be created fresh off `main` after review.
- **Origin:** P0–P5 bounded and de-duplicated main-thread streaming work, but generation/lighting/meshing still run **synchronously on the render thread**. P6 moves the per-vertex-heavy meshing off-thread so a heavy frame can't stall the paint.

## Context (verified against the live code)

Meshing a chunk needs more than its own voxels:
- `GreedyMesher.mesh` + `emitShaped` read `VoxelView`, which samples the **8 horizontal neighbors** one voxel outside the chunk for face culling, fence/wall connection, AO corners, and — critically — **baked neighbor light**: `VoxelView.skyLight`/`blockLight` read neighbor `ChunkData` (`src/world/VoxelView.ts:51-76`). So a worker meshing chunk C needs C's full data **and a lit 1-voxel apron from its 8 neighbors** (ids + state + skyLight + blockLight + biome).
- Output is renderer-agnostic typed arrays already: `ChunkMeshes = { opaque, transparent, cutout }`, each a `MeshData` of 7 `Float32Array`s + a `Uint32Array` (`src/mesh/MeshTypes.ts`). These serialize/transfer cleanly back to the main thread.
- `Generator` is pure in `(seed, cx, cz)` (`src/worldgen/Generator.ts:5-7`); `BlockRegistry` is built from static `BLOCK_DEFS` + `buildBlockTextures`. Both are **reconstructable inside a worker** with zero transfer — only the seed, preset/overlay identity, and chunk data need to cross.
- `ChunkState` already declares `Generating` and `Meshing` (unused today) — the async state machine needs no enum change (`src/world/ChunkStore.ts:5-12`).
- Today `ChunkManager.meshChunk` is synchronous: build `VoxelView` → `emitShaped` + two greedy passes → `sink.upload` → set `Meshed` (`src/world/ChunkManager.ts`). Collision and edits read the same main-thread `ChunkData` (`collisionBoxesAt`, `applyEdits`).

## Goal

Move meshing (the greedy passes + `emitShaped`) off the render thread so main-thread `updateMs` for meshing approaches zero, letting us later raise `VIEW_DISTANCE`/budgets to kill pop-in without reintroducing hitches. Settled rendered output must remain identical (golden-comparable).

## Scope decision: **mesh-only pool** (recommended for P6)

Two options:

- **A — Mesh-only worker pool (recommended).** Generation + lighting stay on the main thread (already bounded by P5's `GEN_BUDGET` + time ceiling, and gen runs **once** per chunk). Workers run only the per-vertex-heavy, frequently-repeated meshing (every neighbor-appearance and edit triggers a remesh). No cross-worker coordination: each mesh job is independent given its inputs.
- **B — Gen+light+mesh in workers (deferred to a future P6b).** Bigger offload, but light's border-seed and mesh's apron create cross-chunk dependencies **between workers**, plus ordering/determinism coordination. High complexity for a second-order win (gen is one-time). Not recommended until mesh-only is proven by the P0 bench.

**Recommendation: implement A.** It removes the largest repeated main-thread cost with the least architectural risk.

## The decisive trade-off: zero-copy (SharedArrayBuffer) vs per-job copy

A worker mesh job needs C's arrays + 8 neighbor aprons. Two ways to get them across:

| Approach | Cost | Constraints |
|---|---|---|
| **Copy + transfer** | The main thread must KEEP `ChunkData` (collision/edits), so its arrays **cannot be transferred (moved)** — they must be **copied** per job (~250 KB center + ~50 KB apron). That per-job memcpy competes with the very meshing cost we're offloading, and can erase the benefit. | Works anywhere; no headers. Simple. |
| **SharedArrayBuffer (recommended)** | Back `ChunkData`'s `Uint8Array`s with `SharedArrayBuffer`. Workers read center + neighbors **directly from shared memory — zero copy, zero transfer**. The win is real and large. | Requires **cross-origin isolation**: the page must be served with `Cross-Origin-Opener-Policy: same-origin` + `Cross-Origin-Embedder-Policy: require-corp`. Must be set in the Vite dev server (`server.headers` in `vite.config.ts`) **and** in production hosting. `globalThis.crossOriginIsolated` gates availability. |

**Recommendation: SharedArrayBuffer**, with a **synchronous fallback** (current path) when `crossOriginIsolated` is false or `Worker`/`SharedArrayBuffer` is unavailable. This is the only approach where the worker reliably pays off; the headers are a one-time deployment cost. Concurrency note: meshing only **reads** voxel/light memory; edits mutate on the main thread and then trigger a remesh, so a job started before an edit is simply superseded (handled by the staleness guard below) — no torn-read correctness issue beyond a discardable stale mesh.

> **This header requirement is the main thing to confirm before building** — it affects the dev server and every deployment target. If COOP/COEP can't be guaranteed in production, fall back to option B-of-the-trade-off (copy) and re-evaluate whether P6 is worth it, or keep P5 as the shipping state.

## Components (option A + SharedArrayBuffer)

1. **SAB-backed `ChunkData`** — allocate `data`/`state`/`skyLight`/`blockLight`/`biomeData` over `SharedArrayBuffer` when `crossOriginIsolated`, else `ArrayBuffer` (fallback). No API change to `ChunkData` callers.
2. **Worker module (`src/world/meshWorker.ts`, new)** — on init, builds its own `BlockRegistry` from `BLOCK_DEFS` + `buildBlockTextures` and the `MeshPass`es. Per job, reconstructs a `VoxelView` over shared center + neighbor buffers and a `NeighborLookup`, runs `emitShaped(view, registry, hasShaped)` + the opaque/transparent greedy passes, and posts back `ChunkMeshes` (the result `MeshData` buffers are **transferable**, moved back to main — they're freshly allocated in the worker).
3. **Worker pool (`src/world/MeshWorkerPool.ts`, new)** — `size = min(navigator.hardwareConcurrency - 1, 4)`; round-robin or idle-worker dispatch; `submit(job): Promise<ChunkMeshes>`; `dispose()` terminates all. Falls back to synchronous in-process meshing when workers/SAB are unavailable (same code path the tests use).
4. **`ChunkManager` async mesh integration** — `meshChunk` becomes `dispatchMesh`: set state `Meshing`, submit a job keyed by `(key, generation)`; on resolve, if the chunk is still loaded and the generation matches, `sink.upload` + set `Meshed`. A per-chunk **generation counter** (bumped on edit/unload) discards stale results. The P5 unified budget now counts **jobs dispatched + results uploaded** per frame; the deferred-remesh queue feeds dispatch.
5. **Vite + hosting headers** — add COOP/COEP to `vite.config.ts` `server.headers` and document the production requirement.

## Data flow (target)

```
update() (main): gen pass (sync, P5-budgeted) ─► recomputeLight (sync)
  mesh pass (P5 budget governs dispatch + upload):
    dispatchMesh(C): state=Meshing; pool.submit({key, gen, centerSAB, neighborSABs, hasShaped})
        └─ worker: VoxelView over shared memory ─► emitShaped + greedy passes ─► ChunkMeshes
    onResult(C): if loaded && gen matches ─► sink.upload(meshes) ; state=Meshed
  collision/edits keep reading main-thread ChunkData (unchanged)
fallback (no SAB/Worker): dispatchMesh runs synchronously (today's path)
```

## Determinism & correctness

- Worker registry/mesher/passes are rebuilt from the same static defs ⇒ byte-identical output. **Golden test:** mesh a fixed chunk on-thread and in-worker (or via the synchronous fallback that shares the exact code) and assert identical `ChunkMeshes`.
- Staleness: an edit or unload bumps the chunk's generation; results tagged with an old generation are dropped (no stale mesh uploaded).
- Apron correctness: the worker must see the neighbor **baked light** as of dispatch time (SAB gives the latest; acceptable — a relight that changes a neighbor triggers that neighbor's own remesh via the existing P2/P5 paths).
- Fallback path is the default in unit tests (node has no `Worker`) ⇒ existing mesh/lighting tests continue to guard output.

## Testing

- `MeshWorkerPool` fallback: with `Worker` undefined, `submit` resolves via synchronous meshing equal to today's output.
- Golden equality: synchronous-path `ChunkMeshes` for a fixed seed+chunk match the pre-P6 `meshChunk` output (regression pin).
- Staleness: a result tagged with a superseded generation is not uploaded.
- SAB gating: with `crossOriginIsolated` false, `ChunkData` uses `ArrayBuffer` and the sync path runs (no throw).
- Integration: existing `chunkManager*` suites pass unchanged on the fallback path; a focused test drives the async path with a stub pool that resolves synchronously.
- Bench (P0): on a focused tab, `__vr.bench()` shows main-thread `updateMs` for meshing dropping toward zero vs the P5 baseline.

## Risks

- **COOP/COEP headers** in production (the gating risk — confirm first).
- Async state machine bugs (double-dispatch, stale uploads) — mitigated by the `Meshing` state + generation counter + tests.
- SAB + edits: meshing reads while edits write; acceptable because edits supersede in-flight jobs, but pin with the staleness test.
- Worker bundle: the worker imports the registry/mesher/light code; ensure Vite bundles the worker (`new Worker(new URL('./meshWorker.ts', import.meta.url), { type: 'module' })`) and that it stays out of the main chunk.

## Rollout

One worktree/PR off `main` after review. Land behind the synchronous fallback so the app is correct even where SAB is unavailable. Validate with `__vr.bench()` before/after on a focused tab. After merge, update `voxel-realm-codebase-improvements` memory with the worker architecture and measured gains. Defer option B (gen/light in workers) to a future P6b only if the bench shows gen is still a material main-thread cost after mesh-only.
```
