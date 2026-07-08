# Ashen Reach — self-critique (after playtest + 12 screenshots)

Captured via Playwright against the live dev server using `window.__vr` (`capture-shots.mjs`).
Server JPEGs: `.captures/ashen-*.jpg`  
PNG backups: `experimental/ashen-reach/screenshots/`

## Shot list

| # | View | Verdict |
| --- | --- | --- |
| 01 | Spawn opening (vista south) | **Improved** — caldera water visible; distant spire still fog-limited until chunks stream |
| 02 | Wide overview | Mixed — needs long view-distance settle; composition is a bowl |
| 03 | Main approach | Strong path-level read toward lake |
| 04 | Hero Ember Spire | **Strong** — dark drum + gold crown on island; memorable silhouette |
| 05 | Rim observatory | Secondary skyline read |
| 06 | Plaza street | **Strong** — warm flagstones, forge shed, basalt cliff backdrop |
| 07 | House interior | Furniture present (table/hearth); POV was too tight — interiors work |
| 08 | Elevated rim | Spire-in-bowl composition when chunks load |
| 09 | Magma bridge | **Strong** — walkable deck, lanterns, spire on axis |
| 10 | Dock → spire | Waterline journey beat |
| 11 | Mine mouth | Secondary industrial beat |
| 12 | Final overlook | Rim reverse-view of village |
| 13 | Atmospheric detail | **Strong** player-height: causeway lanterns, water edge, spire base |
| 14 | Signature | **Strong** — spire framed by causeway approach on water |

## Composition critique (post stills)

| Question | Answer |
| --- | --- |
| Clear focal point? | Yes — Ember Spire (gold crown + dark drum). |
| Hero memorable? | Yes — silhouette holds in signature + bridge shots. |
| World depth? | Bowl gives FG/MG/BG; outer plains thinner. |
| Terrain frames architecture? | Plaza vs basalt cliff yes; spire framed by water + causeway after polish. |
| Weak/empty areas? | Outer rim slopes, mine simplicity. |
| Scale correct? | Plaza/human scale good; spire tall enough to read from shore. |
| Paths understandable? | Vista lanterns, dock, causeway, magma bridge — yes on foot. |
| Architectural variation? | Palette variety in cottages; one hero tower + observatory secondary. |
| Strongest views intentional? | Plaza, causeway signature, magma bridge — intentional after polish. |

**Polish from this critique:** walkable **spire causeway**, **caldera overlook** frame, vista lanterns, island landing pad.

## What works

- **Landscape first:** bowl composition (terrace → water → island → rim) is legible.
- **Hero landmark:** Ember Spire is distinct, lit, and visible from the bridge and shores.
- **Architecture language:** brick/terracotta + deepslate monuments, hip roofs, forges.
- **Traversal routes:** graded road, fissure bridge, dock stairs, spire spiral, observatory stair.
- **Plaza atmosphere:** best street-level shot; reads as a place, not a prop dump.

## Issues found & fixed in this pass

1. Spawn faced buildings blocking the caldera → **south vista corridor** + spawn moved to z=14.
2. Dock cobble buried under sand → **surface-seated dock** paving.
3. Houses as hollow shells → **interior furniture** (bookshelf, furnace, table, bed nook).
4. Steep rim climb → **road elevation grading** + stair overlays.
5. Weak hero → **island + Ember Spire** as primary landmark (observatory secondary).

## Remaining limitations (honest)

- Adaptive view distance / fog means **wide overview stills need long warm-up**; on-foot play streams more gracefully than teleport-screenshot bursts.
- Magma “lava” is glowstone/crystal aesthetic (no lava block in engine) — reads as ember, not true fluid lava.
- Mine and some rim props are simpler than the plaza/spire; acceptable as secondary beats.
- Not packaged into official `world-manifest.json` (by design — experimental).

## Quality bar vs prior worlds

| vs | Position |
| --- | --- |
| Harbor / citadel | Same technical pattern (authored terrain + site stamp) |
| Stonehaven | Different identity (volcanic caldera vs alpine lake kingdom) — not a copy |
| Shipped saves | Smaller scope than Giza/Wash Park; denser authored than pure noise presets |

## Recommendation to Edgar

Worth a walk in-browser. Strongest beats: plaza street, magma bridge, Ember Spire silhouette.
Decide keep / reuse parts / promote / discard — **Grok does not decide**.
