# World Card — Ashen Reach

- **World ID:** `ashen-reach`
- **Title:** Ashen Reach
- **Classification:** IMPLEMENTED WORLD
- **One-sentence promise:** From a basalt overlook, cross the broken ember bridge into Cinderkeep — a fallen frontier fortress above the lava-cut valley.
- **Builder / owner:** Codex (prototype), reviewed/fixed/merged by Claude
- **Branch:** main (merged; `codex/prototype-world` deleted)
- **Worktree:** none
- **Current commit:** `c4d6654` (PR #62 squash, 2026-07-10)
- **Main status:** Merged and in the menu (`world-manifest.json` + `public/worlds/ashen-reach.json`).
- **Source assets:** Generator preset (`src/worldgen/AshenReachGenerator.ts` + `AshenReachSite.ts`) with curated meta from `src/app/curatedPreset.ts`. The shipped package is a **deliberate 1-chunk stub** — the preset generates everything; do not treat the tiny bundle as broken during `world:bundle` runs.
- **Registry evidence:** PR #62; review + fixes logged in the vault session note `2026-07-10-ashen-reach-review-fixes-merge`.
- **Current risks:** Adds the LAVA block (id 41, static, walkable-solid by design). Name history: this world took the `ashen-reach` id that Grok's approved caldera world previously held — that world is now `ember-spire` (see its card).
- **Next required approval:** none — shipped.
- **Last verified date:** 2026-07-10 (headless route walk: every segment spawn→rooftop-stair-base arrived)

## Known polish items

- Watchtower is a hollow shell (no interior ladder to its roof lantern).
- Cinderkeep resolves from spawn only after the VD governor grows (~30–45 s cold start).
