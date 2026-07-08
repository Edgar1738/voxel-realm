# Ashen Reach — experimental candidate world

**Status:** experimental (Grok). Not official. Do not merge to `main` unless Edgar decides.

**Branch:** `grok/ashen-reach`  
**Preset:** `?world=ashen-reach`

## Intent

A high-quality authored world for Voxel Realm: a volcanic caldera you can walk, with a clear
journey, landmarks, and architecture that seats on generated terrain. Creative sandbox only —
no survival systems.

## Identity

**Ashen Reach** is a crater-lake kingdom under a rim of basalt:

| Landmark | Role |
| --- | --- |
| Emberhold village | Spawn plaza, warm flagstones, cottages, forge market, arrival gate |
| Crater lake | Dark flooded basin south of town |
| Magma fissure + bridge | Glowstone/crystal trench on the east approach, stone bridge span |
| Ember vents | Gravel cones with glowing hearts around the shore |
| Shore dock | Cobble jetty looking into the lake |
| Rim observatory | West-rim deepslate tower, spiral stair, glass/crystal dome, beacon |
| Ember shrine | East-rim standing stones with crystal heart |
| Outer wilds | Dead trees, obelisk south of the lake |

**Journey (suggested walk):** Arrival Gate → Plaza / Forges → Dock steps → Fissure Bridge →
south shore path → west rim climb → Observatory dome → look back across the lake to Emberhold.

## Technical approach

Same pattern as `harbor` / `citadel`:

1. `AshenReachGenerator.ts` — radial authored height field + volcanic surface paint + water/ore
2. `ashenReachSite.ts` — chunk-clipped architecture stamp (`CitadelStamp`)
3. `Presets.ts` — registers `ashen-reach` (isolated to this branch)

Shared constants (`ASHEN`) keep terrain and site aligned.

## Explicit non-goals

- Not added to `world-manifest.json` / `public/worlds/` (not a shipped curated pack)
- Does not modify Stonehaven, Frostvale, Moonspire, Tidewreck, or other worlds
- No combat, hunger, health, mobs, or scarcity systems

## Review criteria for Edgar

- First load at spawn should feel intentional (plaza underfoot, caldera visible south)
- Path + bridge should be walkable without flying
- Observatory should silhouette on the west rim
- Performance similar to harbor (solid ground, no caves, moderate overlay cost)

## Launch

```bash
cd .claude/worktrees/grok+ashen-reach
npm run dev
# open http://localhost:5173/?world=ashen-reach
```
