# World Card — Frostvale Valley

- **World ID:** `frostvale-valley`
- **Title:** Frostvale Valley
- **Classification:** IMPLEMENTED WORLD
- **One-sentence promise:** An alpine valley beneath a great waterfall — a timbered lodge and snowbound village on the meadows, six walkable routes up to a summit shrine and watchtower, and more than one secret behind the water.
- **Builder / owner:** Claude
- **Branch:** `claude/frostvale-valley-world-qznjnv` (PR #60)
- **Worktree:** none (built in the primary checkout)
- **Current commit:** see PR #60 head
- **Main status:** merged — manifest entry + bundle + preview shipped
- **Source assets:** `public/worlds/frostvale-valley.json` (961 chunks, 294,873 entries, 2.9 MB bundle); WIP save snapshot + furniture blueprint kit under `docs/worlds/wip/`; build brief `docs/worlds/frostvale-valley-brief.md`; captures `docs/media/frostvale-*.jpg`.
- **Registry evidence:** `world-manifest.json`, `public/worlds/frostvale-valley.json`, `public/worlds/previews/frostvale-valley.jpg`, `tests/frostvaleSiteProbe.test.ts`
- **Current risks:** None known. The pre-merge stale-branch risk (TourMarker/fog/label-alias) was resolved by merging `main` into the branch before ship — the tour already used `name` keys and the branch carried no engine changes. Save meta migrated v1→v2 for the `WORLD_HEIGHT` 512 bump (voxel indices are y-major, so chunk entries were untouched); terrain identity at seed 1337 is pinned by `tests/frostvaleSiteProbe.test.ts`.
- **Next required approval:** None — shipped.
- **Last verified date:** 2026-07-11

## Load

```
?save=frostvale-valley
```

## Scale

| Measure | Value |
|---------|--------|
| Footprint | ~600×600 (x200–800, z3040–3640), `default` preset, seed 1337 |
| Hero falls | 55-block curtain into a carved plunge pool |
| Lodge | 15 rooms over cellar + 2 storeys + attic, all porch-reachable |
| Village | 11 enterable buildings + market square |
| Routes | 6 graded routes, 78 walker-verified legs |
| Tour | 10 waypoints, 590 blocks; peak 2 gens / 6 meshes per frame |
| Secrets | 4 unmarked (grotto, treasure vault, poacher's camp, ruin) |

## Unknowns

- None
