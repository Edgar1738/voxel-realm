# Voxel Realm — Engine Change Queue

World branches frequently carry **reusable engine changes** (rendering, physics, camera, tour/HUD,
fog) tangled together with **world-specific content**. This queue tracks those engine changes so
they can be reviewed and merged independently of the worlds that spawned them — and so we don't
re-merge something that's already in `main` or drag a stale branch across it.

> Merge risk legend: **low** = clean, isolated, well understood · **medium** = needs reconciliation
> or careful review · **high** = stale/conflicting or entangled with world content.

---

## 1. Stonehaven — route/road spline work (RESOLVED)

- **Originating world:** `stonehaven` (`experiment/project-stonehaven`)
- **Files / areas:** Reusable `RouteSpline` lives in `src/worldgen/fields.ts`; Stonehaven consumes it
  from `src/worldgen/StonehavenGenerator.ts` and `src/worldgen/stonehavenSite.ts`.
- **Main status:** **Resolved in `main`.** Terrain grading and paving share the same route projection;
  tests cover road grade, dryness, bridge approaches, and paving.
- **Recommended action:** Do not extract the older worktree copy. Future road features should build
  on the mainline `RouteSpline` API.
- **Merge risk:** none (mainline implementation exists).

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

## 4. Hogwarts — camera step-up smoothing (RESOLVED)

- **Originating world:** `hogwarts` (`world/hogwarts-save`)
- **Main status:** **Resolved in `main`.** Grounded step ascent/descent eye smoothing is active in
  `Game.ts`; `CameraRig.ts` also provides obstruction-safe third-person recovery.
- **Recommended action:** Do not extract camera code from the archived Hogwarts branch.
- **Merge risk:** none (current behavior and tests supersede the stale branch).

## 5. Ember Spire (formerly Grok Ashen Reach) — no broad engine change found

- **Originating world:** `ember-spire` (`grok/ember-spire`, commit `6034734`)
- **Files / areas touched:** None identified as a broad engine change. It is a generator/source world; save metadata is not a full chunk bundle.
- **Reusable vs world-specific:** World-specific (generator/source content).
- **Main status:** Integrated in the current shipping branch with its preset conflict reconciled,
  production VRW1 package created, and a dedicated generation worker.
- **Recommended action:** Review as a world, not as a broad engine extraction. Keep its dedicated
  worker isolated unless future measurements justify sharing more generation code.
- **Merge risk:** low (from an engine-change standpoint).

## 6. Harbor preset — already merged into main

- **Originating world:** `harbor` (preset)
- **Files / areas touched:** Harbor generator preset (world-generation presets).
- **Reusable vs world-specific:** Reusable preset — already part of the engine's preset set.
- **Main status:** **Already merged into `main`.** The preset exists in main.
- **Recommended action:** None. Treat as done. Do not confuse the preset with the shipped Tidewreck Cove world.
- **Merge risk:** low (already in main).
