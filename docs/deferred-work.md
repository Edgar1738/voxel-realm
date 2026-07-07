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
- **Ship an actual curated collection.** The manifest tooling exists
  (`src/persistence/worldManifest.ts` + `world:package --manifest`) but no `world-manifest.json`
  and no curated worlds are committed. Treat `.saves/` as source material (size/licensing/privacy).
- **Reusable kits** and **road/path planning** in `src/worldgen/Structures.ts` (only static road
  prefabs exist today).
- **Chunk payload compression/streaming** before bundling large (multi-MB) worlds.

## Builder / UI
- **Full paste preview:** the paste ghost (`src/render/PasteGhost.ts`) is still a translucent
  bounding box, not a per-voxel preview. Also missing: grid/snap controls and a clearer
  block-state (stairs/gates/slabs) placement UI. (Whole-block nudge + selection-size readout landed.)

## Showcase / camera
- **Third-person camera smoothing** (`CameraRig.ts` is a fixed trailing offset) and a
  **photo/cinematic mode** (orbit camera, landmark shots, shareable frames). Avatar walk animation
  landed; these did not.

## Dev / infra
- **`server/worldDiskStore.ts`** still re-serializes the whole world JSON per chunk flush by design
  (the cache only removed the redundant per-edit read+parse). A per-chunk-file format would make
  saves O(chunk) instead of O(world).
- **File split:** `CreativeUi.ts` (icons → `creativeIcons.ts`) and `DevControls.ts` (help →
  `devHelp.ts`) were trimmed. `Game.ts` remains a single composition-root boot closure with no
  cheap self-contained seam — splitting it needs a real refactor (extract systems with explicit
  context), not code motion.
- **Production COOP/COEP hosting** decision for worker meshing (plain GitHub Pages can't send the
  headers, so the hosted build falls back to main-thread meshing). See README "Deploying".
