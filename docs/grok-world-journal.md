# Grok World Journal — Ashen Reach

Factual record for Edgar. Experimental candidate only. Branch is isolated from `main`.

---

## Identity

| Field | Value |
| --- | --- |
| **World name** | Ashen Reach |
| **World ID / preset** | `ashen-reach` |
| **Save name** | `ashen-reach` (meta bootstrap: `experimental/ashen-reach/save-meta.json`) |
| **Branch** | `grok/ashen-reach` |
| **Worktree** | `.claude/worktrees/grok+ashen-reach` |
| **Agent** | Grok (xAI) |
| **Status** | Experimental candidate — not official, not merged |

---

## Design concept

A volcanic caldera kingdom. Emberhold village sits on the north ash terrace of a dark crater lake. The **Ember Spire** (hero landmark) rises from a basalt island in the lake, connected by a walkable causeway. An ash road half-circles the basin past a magma fissure bridge to a west-rim observatory. Architecture language: brick/terracotta cottages, deepslate monuments, warm forge industry, glowstone/crystal “ember” lighting (engine has no lava block).

**Not** Stonehaven (alpine lake kingdom), Frostvale, or a castle-on-flat-plane remake.

---

## Major decisions

1. **Generator preset + site overlay** (same pattern as harbor/citadel) rather than a multi-MB hand-placed save — reviewable as code, deterministic, no overwrite of shipped worlds.
2. **Landscape first:** radial caldera height field (island, beach, terrace, rim, outer plains) before architecture.
3. **Hero = Ember Spire on island**, not the observatory (observatory is secondary skyline).
4. **Shared `ASHEN` / `ASHEN_ROAD` constants** so terrain grading and paving stay aligned.
5. **No caves** under the site (solid ground for foundations).
6. **Not added to `world-manifest.json`** — isolation from official collection until Edgar decides.
7. **Causeway to the island** after composition critique: hero must be reachable on foot, not swim-only.

---

## Areas built

| Area | Contents |
| --- | --- |
| Emberhold plaza | Warm flagstone mix, well, market stalls, forge shed, lamp posts |
| Arrival gate | North deepslate pillars + brick lintel + crystal crown |
| Caldera overlook | South plaza parapet with framed vista gap + glow pillars |
| Village houses | Varied wall/roof palettes, furnished interiors |
| Vista corridor | Stairs + lantern posts toward dock |
| Shore dock | Surface-seated cobble jetty |
| Spire causeway | 3-wide stone deck dock→island, rails, under-deck glow |
| Ember Spire | Deepslate drum, spiral, mid study, balcony, crystal/glow crown |
| Magma bridge | Glowstone/crystal fissure + stone deck + lanterns |
| Ember vents | Gravel cones with glow hearts around shore |
| Rim observatory | Deepslate tower, glass/crystal dome, spiral |
| Ash mine | Timber portal + lit tunnel + ore flecks (east rim) |
| Outer wilds | Dead trees, south obelisk, east ember shrine |

---

## Tools used

| Tool | Use |
| --- | --- |
| `AshenReachGenerator` / `LayeredGenerator` / `WaterFiller` / `OreScatterer` | Terrain |
| `CitadelStamp` | Chunk-clipped architecture |
| Prefabs (`well`, `marketStall`, `lampPost`, `deadTree`, `obelisk`) | Dressing |
| `scatterOaks` + `scatterDecorations` | Sparse vegetation |
| `window.__vr` (teleport, pov, surface, capture, world.setMeta) | Playtest + stills |
| Playwright + `experimental/ashen-reach/capture-shots.mjs` | Automated 14-view capture |
| Vitest `tests/ashenReach.test.ts` | Determinism + structure contracts |

**Not used:** full in-game shape tools for the primary build (generator path was more reliable for a deterministic candidate). Engine path/blueprint APIs exist and were inspected; primary deliverable is the world, not new authoring tools.

---

## Engine limitations discovered

1. **No lava block** — “magma” is glowstone/crystal/deepslate aesthetic.
2. **Adaptive view distance + fog** — wide aerial stills often empty until long chunk warm-up; foot play is more honest.
3. **Default spawn settles only for default SPAWN** — curated worlds need meta or URL spawn.
4. **Empty-chunk saves with preset** work for meta-only curation; full packaging not done (experimental).
5. **Swim is possible** but poor as the only route to a hero landmark — fixed with causeway.

---

## Important fixes

| Issue | Fix |
| --- | --- |
| Spawn blocked by south houses | Vista corridor + spawn at z=14 looking south |
| Dock cobble buried under sand | Surface-seated dock paving |
| Hollow houses | Furniture (bookshelf, furnace, table, bed nook) |
| Steep rim | `ASHEN_ROAD` elevation grading + stair overlays |
| Weak / swim-only hero | Island + Ember Spire + walkable causeway |
| Accidental first view | Caldera overlook frame + vista lanterns |

---

## Screenshots captured

Locations:

- `.captures/ashen-01-…` through `ashen-14-…` (JPEG via `__vr.save` / overview)
- `experimental/ashen-reach/screenshots/01-…png` … `14-…png` (Playwright viewport)

| # | View | Height |
| --- | --- | --- |
| 01 | Spawn opening | Player |
| 02 | Wide overview | Aerial |
| 03 | Main approach | Player |
| 04 | Hero Ember Spire | Mixed |
| 05 | Secondary observatory | Mixed |
| 06 | Street plaza | Player |
| 07 | House interior | Player |
| 08 | Elevated rim | Elevated |
| 09 | Magma bridge | Player |
| 10 | Dock to spire | Player |
| 11 | Mine mouth | Player |
| 12 | Final overlook | Elevated |
| 13 | Atmospheric detail | Player |
| 14 | Signature (causeway → spire) | Player |

---

## Known weaknesses

1. Outer ash plains beyond the rim are thinner than the bowl interior.
2. Mine and shrine are secondary and simpler than plaza/spire.
3. Wide overview captures remain sensitive to stream timing/fog.
4. Architectural cottage variety is palette-level, not unique landmark houses.
5. Daytime sky is clear blue — volcanic haze would need engine atmosphere work (out of scope).

---

## Possible future improvements

- Night lighting pass (more crown/vent intensity; day/night pinned for stills).
- Small boats or wreck dressing on the lake.
- One unique “mayor’s house” / guild hall for architectural hierarchy.
- Package optional tour meta into a reviewable save under `experimental/` only if Edgar wants menu entry.
- Performance budget check at full rim view distance after long roam.

---

## Commits (isolated branch)

Verify with `git log` on `grok/ashen-reach`:

- `f950548` — initial experimental Ashen Reach caldera preset  
- `7c54268` — polish: spire hero, vista, playtest stills  
- later commit(s) — causeway, overlook, journal, atmospheric + signature stills

---

## Recommendation (non-binding)

Worth keeping for another milestone (causeway + plaza + spire are solid). Not ready to promote as official without Edgar’s walk and a night/atmosphere pass. Do **not** merge to `main` without explicit instruction.
