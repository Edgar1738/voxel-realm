# World Card — The Grand Keep

- **World ID:** `grand-keep`
- **Title:** The Grand Keep
- **Classification:** **AWAITING EDGAR REVIEW — MILESTONE 2**
- **One-sentence promise:** An enormous multi-storey castle you can walk from gate to dungeon to battlements and Crown Tower summit entirely on foot.
- **Builder / owner:** Grok
- **Branch:** `grok/grand-keep`
- **Worktree:** `.claude/worktrees/grok+grand-keep`
- **Current commit:** `d6e8522`
- **Main status:** **Not merged.** Prototype only. Do not ship. Do not edit `world-manifest.json`.
- **Source assets:** Generator/source world — `?world=grand-keep` (and optional `?save=grand-keep` with `experimental/grand-keep/save-meta.json`). Not a full chunk bundle.
- **Registry evidence:** Branch `grok/grand-keep`; this card; `docs/worlds/WORLD_REGISTRY.md` entry.
- **Current risks:** Milestone 1 is composition/circulation only — interiors are volume anchors, not furnished. Stair well and tower joins should be playtested in-browser before M2 polish.
- **Next required approval:** Edgar review of Milestone 1 (scale, silhouette, on-foot vertical route).
- **Last verified date:** 2026-07-09

## Unknowns

- Whether Edgar wants the permanent title kept as “The Grand Keep” or renamed.
- Whether any engine change will be needed after live playtest (none required for M1 stamp).

## Scale (Milestone 1)

| Measure | Value |
|---------|--------|
| Outer curtain footprint | 124 × 124 |
| Main keep footprint | 97 × 61 |
| Above-ground storeys | 4 (Great Hall, Throne, Residential, High Castle) |
| Underground levels | 1 (Deep Dungeon) |
| Roof | Walkable battlements |
| Major towers | Crown (+28 above roof), Watch (+22), 4 corner, 2 gatehouse flank |

## Build method

Authored generator + site overlay (same architecture as citadel / Ashen Reach):

- `GrandKeepGenerator.ts` — mesa terrain
- `grandKeepSite.ts` — overlay orchestrator
- `grandKeepWalls.ts` / `grandKeepKeep.ts` / `grandKeepDungeon.ts` / `grandKeepPrimitives.ts` / `grandKeepFrame.ts`

## Load

```
http://localhost:5173/?world=grand-keep
# curated spawn/tour (dev): copy experimental/grand-keep/save-meta.json → .saves/grand-keep.json
http://localhost:5173/?world=grand-keep&save=grand-keep
```
