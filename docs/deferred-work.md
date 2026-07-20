# Deferred work & known next steps

The recent polish/refactor pass (branch `claude/codex-inspection-review-0l07b5`) shipped a
**v1** of each track from the codex inspections. This is the honest list of what was deliberately
scoped **out** of those v1s — recorded here so it survives in the repo rather than in chat.

## Render / graphics

- **Water shoreline + foam.** The water shader has depth tint / fresnel / sun glint, but no shoreline
  treatment or surface foam.

## Structures / worlds

- **Prefab catalog v2:** anchors/sockets, variants, and generated thumbnails. The v1 catalog
  (`src/app/curatedBlueprints.ts`) has id/name/category/tags/description + validation only; the
  `Prefab` type (`src/core/Prefab.ts`) is unchanged.
- **Reusable kits** and **road/path planning** in `src/worldgen/Structures.ts` (only static road
  prefabs exist today). Frostvale's furniture kit ships as blueprint JSONs
  (`docs/worlds/wip/blueprints/`) — engine-side kit support is still missing.
- **Per-chunk streamed world delivery.** Shipped worlds now use the compact VRW1 binary format.
  Loading is still whole-world; add range/per-chunk delivery only when measured world size or
  network latency makes it necessary.

## Builder / UI

- **Full paste preview:** the paste ghost (`src/render/PasteGhost.ts`) is still a translucent
  bounding box, not a per-voxel preview. Also missing: grid/snap controls and a clearer
  block-state (stairs/gates/slabs) placement UI. (Whole-block nudge + selection-size readout landed.)

## Showcase / camera

- **Third-person camera smoothing.** `CameraRig.ts` still uses a fixed trailing offset. Photo mode
  and shareable captures have landed.

## Dev / infra

- **`server/worldDiskStore.ts`** still re-serializes the whole world JSON per debounce cycle. Dirty
  chunks are now batched into that single serialization, removing the former write-per-chunk
  multiplier. A per-chunk-file format would make each cycle O(changed chunks) instead of O(world),
  but requires a compatible migration and is deferred until measurements justify it.
- **Composition contexts:** `CreativeUi` now owns and disposes its DOM, active modal listener, and
  timers, while `Game` owns the remaining runtime teardown. Continue extracting systems only when
  a feature exposes a cohesive state/lifecycle boundary; avoid file splits that merely move closure
  state.
- **Production COOP/COEP hosting:** GitHub Pages remains the measured default; switch only when a
  production benchmark shows its main-thread mesh fallback missing the frame-time target. See the
  README deployment section.
