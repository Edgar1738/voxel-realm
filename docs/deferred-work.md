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
- **Binary/streamed world format.** The shipped collection (PR #55) bundles plain compact JSON in
  `public/worlds/` and leans on the CDN's gzip (~12:1 on voxel entries, e.g. giza 7.5 MB → ~600 KB
  transfer). Fine at this scale; a packed binary or per-chunk streamed format only matters if
  worlds get much larger or the repo weight (~18.5 MB for 5 worlds) starts to hurt.

## Builder / UI
- **Full paste preview:** the paste ghost (`src/render/PasteGhost.ts`) is still a translucent
  bounding box, not a per-voxel preview. Also missing: grid/snap controls and a clearer
  block-state (stairs/gates/slabs) placement UI. (Whole-block nudge + selection-size readout landed.)

## Showcase / camera
- **Third-person camera smoothing** (`CameraRig.ts` is a fixed trailing offset) and a
  **photo/cinematic mode** (orbit camera, landmark shots, shareable frames). Avatar walk animation
  landed; these did not.

## Showcase beta (post-front-door)
The curated collection now ships behind the world-select menu (PRs #52/#55). What the beta
roadmap deferred:
- **Onboarding pass (M3):** a player-grade controls/help panel (devHelp is dev-only), a hint when
  play mode gates an input, an Escape pause menu (resume / controls / volume / back to worlds),
  and a graceful desktop-only message on touch devices.
- **Share loop (M4):** client-side world export/import (download/upload a `WorldSnapshot` JSON
  into a named save slot).
- **Manifest previews:** `world-manifest.json` supports a `preview` image per world; the menu
  cards fall back to gradients today. Capture + commit thumbnails.

## Dev / infra
- **`reportBench` hangs in headless Chromium** (`src/app/DevControls.ts`): it ends with
  `await navigator.clipboard.writeText(...)`, which never settles without clipboard permission —
  the `try/catch` only covers rejection. Racing it against a short timeout would fix headless
  `__vr.bench*` runs; until then, stub `navigator.clipboard.writeText` from Playwright.
- **`server/worldDiskStore.ts`** still re-serializes the whole world JSON per chunk flush by design
  (the cache only removed the redundant per-edit read+parse). A per-chunk-file format would make
  saves O(chunk) instead of O(world).
- **File split:** `CreativeUi.ts` (icons → `creativeIcons.ts`) and `DevControls.ts` (help →
  `devHelp.ts`) were trimmed. `Game.ts` remains a single composition-root boot closure with no
  cheap self-contained seam — splitting it needs a real refactor (extract systems with explicit
  context), not code motion.
- **Production COOP/COEP hosting** decision for worker meshing (plain GitHub Pages can't send the
  headers, so the hosted build falls back to main-thread meshing). See README "Deploying".
