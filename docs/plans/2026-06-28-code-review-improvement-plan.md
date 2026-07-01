# Voxel Realm — Code Review & Improvement Plan

_2026-06-28. Synthesis of four focused subsystem reviews (rendering/meshing/lighting, worldgen, streaming/persistence, player/edit/app/dev) plus a tooling/config/security pass. ~6,000 LOC, 46 test files / 285 tests._

## Status: SHIPPED (2026-06-28)

All phases merged to `main`, CI green, ~411 tests.

| Phase | PRs |
|---|---|
| CI gate | #12 |
| 0 — data durability | #11 (preset wipe), #13 (CSRF), #14 (atomic+backup+meta), #15 (client flush) |
| 1 — correctness | #17 (raycast + step-up), #19 (Math.imul determinism, oak bounds) |
| 2 — resource leaks | #18 (render dispose), #21 (app listener teardown) |
| 3 — performance | #16 (greedy mesher), #19 (BiomeMap/ore) |
| 4 — chunk-border block light | #22 |
| 5 — maintainability | #21 (Game.boot decomposition), #20 (DevShapes), #16/#19 (nits) |
| 6 — tooling + tests | #23 (prettier-error, engines pin, caverns + neg-coord tests) |

Deliberately deferred: write-serialization (non-issue — synchronous `fs`); type-aware ESLint `recommendedTypeChecked` (separate large cleanup); `Game`/`DevControls` could decompose further if they grow again.

## Executive summary

The codebase is in good shape: strict TypeScript (`exactOptionalPropertyTypes`, `noUnused*`), clean layering, lean deps (`three` + `simplex-noise`), and solid unit coverage of the pure modules (collision, edit, raycast, brushes, worldgen stages). The problems cluster into a few clear themes:

1. **Data durability / silent world loss** — the biggest theme. The recently-fixed preset-wipe (PR #11) was *one* instance of a broader class: several independent code paths can silently lose or corrupt a saved world. This is the top priority.
2. **Resource leaks** — GPU objects (materials/textures/geometries) and DOM event listeners are created but never disposed; a problem under HMR / world-switch / SPA teardown.
3. **One determinism landmine** — ore/torch hashing uses float `*` instead of `Math.imul` (breaks "same seed → same world" for large seeds / non-V8 engines).
4. **Two real gameplay bugs** — raycast zero-direction fallback; no step-up in walk collision.
5. **Hot-path allocations** — the greedy mesher and `BiomeMap` allocate heavily per chunk.
6. **Maintainability** — two god-objects (`Game.boot` 366 LOC, `DevControls` 617 LOC).
7. **Process** — no CI; the app layer (`Game.ts`, `DevControls.ts`) has zero tests.

Recommended sequencing: **Phase 0 (durability) + the Phase 1 one-liners first** (low effort, high value), then **add CI** to lock the gate, then leaks/perf/lighting as feature work.

---

## Phase 0 — Data durability (highest risk; do first)

The save layer has multiple independent silent-loss paths. Together these are the most important fixes in this document.

- **Atomic writes.** `writeWorld` is `writeFileSync(file, json)` — truncate-then-write. A crash/HMR-restart mid-write leaves a partial/empty file; `readWorld` then silently returns `{chunks:{}}` and the *next* write finalizes the loss. **Fix:** write to a temp file then `renameSync` (atomic on same FS); `console.error` the filename on parse failure instead of swallowing it. `server/worldDiskStore.ts:37,31`
- **Serialize writes (multi-tab / debounce race).** `writeChunk`/`writeMeta`/`clearWorld`/`copyWorld` all do read-modify-write on one shared file with no lock; two saves in the same debounce window → last-writer-wins drops a chunk. **Fix:** a per-world promise queue in the dev middleware. `server/worldDiskStore.ts:46-63`
- **Flush durability.** `flush()` fires `saveChunkDelta` fire-and-forget and `dirty.clear()`s before any POST resolves; `ServerSaveStore.post` never checks `res.ok`. A failed save is silently dropped. **Fix:** check `res.ok`; only remove a key from `dirty` on confirmed save; retry/re-enqueue on failure. `src/app/Game.ts:111-119`, `src/persistence/ServerSaveStore.ts`
- **`pagehide` flush is unreliable.** Fire-and-forget `fetch` on unload is routinely dropped by browsers. **Fix:** `navigator.sendBeacon` for the unload path. `src/app/Game.ts:126`
- **Reset race.** `savesSuppressed` only guards future timers, not in-flight POSTs; a stale `saveChunkDelta` can land after `clearDeltas()` and re-write cleared data. **Fix:** await in-flight saves (or `AbortController`) before `clearDeltas`. `src/app/Game.ts:199-208`
- **Corrupt-meta wipe.** `parseMeta` accepts `NaN`/`Infinity` seed; `resolveSaveAction` then sees `NaN !== seed` → `incompatible` → reset. A merely-malformed file is treated as incompatible and wiped. **Fix:** `Number.isInteger` guards. `src/persistence/WorldSnapshot.ts:83`
- **Backups.** `.saves/` is gitignored with no backup-on-overwrite and no history — the literal root of the castle loss. **Fix:** write a rolling backup (e.g. `.saves/.backups/<name>.<ts>.json`, keep last N) before overwriting a non-empty world. This alone would have saved the castle.
- **Dev-endpoint CSRF / LAN exposure.** `/__world` write/clear/delete have no `Origin`/`Host` check; any site you visit while `npm run dev` runs can CSRF-wipe a world, and `vite --host` exposes it to the LAN. **Fix:** allowlist `localhost`/`127.0.0.1` Origin (and reject cross-origin) on the mutating dev endpoints. `vite.config.ts`
- _(Done)_ preset-mismatch wipe — `resolveBootPreset`, PR #11.

---

## Phase 1 — Correctness bugs (small, high value)

- **Raycast zero-direction.** `const dz = len === 0 ? -1 : …` fires a spurious `-Z` ray (dx/dy correctly use `0`). **Fix:** return `undefined` (or `0`) when `len === 0`; add a test. `src/edit/VoxelRaycast.ts:24`
- **Determinism (`Math.imul`).** `seed * 2654435761` / `worldX * 73856093` overflow `2^53` and lose precision before `>>> 0`. **Fix:** use `Math.imul` (as `TreeScatterer.chunkRng` already does). `src/worldgen/OreScatterer.ts:54-61`, `src/worldgen/CaveTorcher.ts:47` _(latent at the current seed 1337, but a cross-engine landmine)_
- **`growOak` OOB crash.** Canopy loop calls `chunk.set(x+dx, …)` where `chunk.get` returned AIR out-of-bounds → `RangeError` near chunk edges. **Fix:** bounds-check inside `placeLeaves`. `src/worldgen/TreeScatterer.ts:43-46`
- **Step-up collision (gameplay feel).** Walk mode can't climb 1-block ledges; every surface edge is a wall. **Fix:** after an X/Z hit, retest the move shifted up 1 voxel. Larger, but the biggest "feels right" win. `src/player/Collision.ts:43-44`

---

## Phase 2 — Resource leaks (SPA / HMR hygiene)

- **GPU disposal.** `ChunkMeshRegistry` (shared materials/texture), `CelestialSky` (canvas textures, sprite/point materials, geometry), and `Renderer` (RAF loop + resize listener) own GPU resources with no `dispose()`/`stop()`. **Fix:** add `dispose()` to each; cancel the RAF; use `AbortController` for listeners. `src/render/*`
- **Event-listener leaks.** `Game.boot` adds `keydown`×2, `pagehide`, `contextmenu`, `mousedown`; `CameraRig` adds 5 document/window listeners; `DevHud` runs an uncleared `setInterval`. None are removed → duplicates on re-boot/HMR. **Fix:** consolidate the two `keydown`s, return a `cleanup()`, use `{once:true}` for `pagehide`, scope `contextmenu` to the canvas. `src/app/Game.ts`, `src/render/CameraRig.ts`, `src/app/DevHud.ts:61`

---

## Phase 3 — Performance (hot paths)

- **GreedyMesher allocations.** `[...air]` / `[...solid]` (per mask cell) and `` `${layer}|${ao.join(',')}|${light}` `` (per face) allocate millions of short-lived objects per chunk rebuild. **Fix:** pre-allocated `[0,0,0]` scratch arrays + a packed integer merge key (`layer<<16 | aoKey<<8 | light`). `src/mesh/GreedyMesher.ts:87,143,154`
- **BiomeMap cache.** String key (`` `${x},${z}` ``, 6,400/chunk) + wholesale `cache.clear()` at the cap causes GC churn and boundary thrash. **Fix:** integer key + LRU/ring buffer. `src/worldgen/BiomeMap.ts:66,82`
- **OreScatterer closure churn.** A `mulberry32` closure is allocated per stone voxel × band. **Fix:** inline one-shot hash. `src/worldgen/OreScatterer.ts:54`
- _(minor)_ empty opaque chunk still issues a draw call (`ChunkMeshRegistry`); `DayNight.apply` rewrites uniforms every frame; `skyState` computed twice/frame; `layer` stored as `Float32Array` (could be `Uint8`).

---

## Phase 4 — Player-visible feature: chunk-border block light

Block light is chunk-local — a lantern near a seam cuts off hard at the border (seen in the castle dungeon). **Approach (medium):** two-pass border-propagation BFS — compute per-chunk light, export non-zero border values, seed neighbors' second pass with `border-1`; trigger remesh when a neighbor's light-export changes. The data model already reads neighbor light (`VoxelView.blockLight`); the real work is remesh-on-neighbor-light-change in `ChunkManager`. `src/world/Lighting.ts`, `src/world/ChunkManager.ts`

---

## Phase 5 — Maintainability

- **Decompose `Game.boot` (366 LOC)** into `setupPersistence`, `setupInputHandlers`, `setupEditTools` — also fixes the listener leaks (each returns a teardown) and makes the `MAX_EDIT_VOXELS` guard testable. `src/app/Game.ts`
- **Decompose `DevControls` (617 LOC)** into namespaced sub-APIs (`build.*`, `camera.*`, `inspect.*`; `world`/`capture` already are) and extract shape geometry to a `DevShapes.ts`. `src/app/DevControls.ts`
- Smaller: parenthesize the `grounded` ternary (`PlayerController.ts:99`); rename/clarify `worldToChunkCoord` for Z (`coords.ts:27`); de-dup `clamp` into `core/math`; derive `MIN_Y`/`TEXTURE_LAYER_COUNT` from source-of-truth; guard `BlockRegistry.faceLayer` against AIR; align the copy cap (200k) with `MAX_EDIT_VOXELS` (50k); fix stale comments (`blocks.ts` `transparent`, GreedyMesher "0fps").

---

## Phase 6 — Process & tests

- **Add CI** (GitHub Actions): `tsc --noEmit`, `vitest run`, `eslint`, `vite build` on PR. The gate exists but isn't enforced — this is what would have caught a regression like the wipe. _(no `.github/workflows` today)_
- **Highest-value missing tests:** `Game.boot` edit-cap + two-click selection flow; persistence atomic-write + concurrent-write + flush-durability; raycast zero-direction; `saveGuard` with `NaN`/`Infinity` meta; `caverns` preset; cross-chunk meshing in `z`; negative-coordinate `scatterStructures`.
- ESLint: consider `recommendedTypeChecked`; make `prettier/prettier` an `error`; add an `engines` pin (currently Node 25 / Vite 8).

---

## Appendix — finding counts by severity

| Subsystem | P0 | P1 | P2 | P3 |
|---|---|---|---|---|
| Rendering / meshing / lighting | 6 | 8 | 6 | 5 |
| Streaming / persistence | 4 | 7 | 5 | 4 |
| Worldgen | 3 | 6 | 6 | 4 |
| Player / edit / app / dev | 3 | 5 | 6 | 4 |
| Tooling / config / security | — | 3 | 2 | — |

Verified directly during synthesis: raycast `dz` fallback, non-atomic `writeWorld`, and the `Math.imul` omission.
