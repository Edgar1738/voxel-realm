# Voxel Realm — Engine Change Queue

World branches frequently carry **reusable engine changes** (rendering, physics, camera, tour/HUD,
fog) tangled together with **world-specific content**. This queue tracks those engine changes so
they can be reviewed and merged independently of the worlds that spawned them — and so we don't
re-merge something that's already in `main` or drag a stale branch across it.

> Merge risk legend: **low** = clean, isolated, well understood · **medium** = needs reconciliation
> or careful review · **high** = stale/conflicting or entangled with world content.

---

## 1. Stonehaven — route/road spline work

- **Originating world:** `stonehaven` (`experiment/project-stonehaven`)
- **Files / areas touched:** Route/road spline generation; site layout. Exact files UNKNOWN — confirm in the worktree before touching.
- **Reusable vs world-specific:** Mixed. Spline/road tooling is potentially reusable; the specific Stonehaven road/site layout is world-specific.
- **Main status:** Not merged. Lives in the dirty `experiment+project-stonehaven` worktree.
- **Recommended action:** Do not touch the dirty worktree. If the spline tooling is wanted, extract it as a standalone engine change on a fresh branch, separate from Stonehaven content, and review independently.
- **Merge risk:** medium (entangled with dirty world content).

## 2. Stonehaven — render/fog duplication (already resolved in main)

- **Originating world:** `stonehaven`
- **Files / areas touched:** Render / fog path (distant-landscape visibility).
- **Reusable vs world-specific:** Reusable engine change.
- **Main status:** **Already resolved in `main` via PR #57** (`4ee5208 fix(render): extend distant landscape visibility`). The Stonehaven worktree still carries a duplicate of this change.
- **Recommended action:** Do NOT re-merge from Stonehaven. Treat the worktree's render/fog edits as duplicate of what already landed in main; drop them when reconciling that branch.
- **Merge risk:** high if merged wholesale (would duplicate/conflict with main).

## 3. Frostvale Valley — stale branch vs main (RESOLVED)

- **Originating world:** `frostvale-valley` (`claude/frostvale-valley-world-qznjnv`, PR #60)
- **Files / areas touched:** None — the branch carried world content, docs, and one worldgen-pinning test; no engine code.
- **Reusable vs world-specific:** World-specific throughout. The stale-branch concern (TourMarker/fog/label-alias) did not materialize: the tour was authored with `name` keys and the branch touched none of those systems.
- **Main status:** **Resolved 2026-07-11.** `main` was merged into the branch before ship (only conflict: `world-manifest.json`, both sides appending entries); save meta bumped v1→v2 for the `WORLD_HEIGHT` 512 change (voxel indices are y-major, so chunk entries were untouched). Full suite green post-merge, including `frostvaleSiteProbe` (terrain identity) and `shippedWorlds`.
- **Recommended action:** None. Shipped via PR #60.
- **Merge risk:** none (merged).

## 4. Hogwarts — camera step-up smoothing

- **Originating world:** `hogwarts` (`world/hogwarts-save`)
- **Files / areas touched:** Camera step-up / eye-smoothing (camera movement code). Exact files UNKNOWN — confirm on branch.
- **Reusable vs world-specific:** Reusable engine change (camera smoothing benefits all worlds). Note: related eye-smoothing work already landed in main via PR #48 per project memory — confirm overlap before extracting.
- **Main status:** Not merged from this branch (world archived/stale).
- **Recommended action:** If wanted, extract camera step-up smoothing as an isolated engine change on a fresh branch; verify it isn't already covered by main's PR #48 eye-smoothing before merging.
- **Merge risk:** medium (possible overlap with existing main smoothing; branch otherwise stale).

## 5. Ashen Reach — no broad engine change found

- **Originating world:** `ashen-reach` (`grok/ashen-reach`, commit `5b300c9`)
- **Files / areas touched:** None identified as a broad engine change. It is a generator/source world; save metadata is not a full chunk bundle.
- **Reusable vs world-specific:** World-specific (generator/source content).
- **Main status:** Not merged (approved M2 world, awaiting merge decision).
- **Recommended action:** Review as a world, not as an engine change. No engine extraction appears necessary.
- **Merge risk:** low (from an engine-change standpoint).

## 6. Harbor preset — already merged into main

- **Originating world:** `harbor` (preset)
- **Files / areas touched:** Harbor generator preset (world-generation presets).
- **Reusable vs world-specific:** Reusable preset — already part of the engine's preset set.
- **Main status:** **Already merged into `main`.** The preset exists in main.
- **Recommended action:** None. Treat as done. Do not confuse the preset with the shipped Tidewreck Cove world.
- **Merge risk:** low (already in main).
