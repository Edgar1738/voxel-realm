# Hollowmere — World Journal

**Status:** Milestone 1 complete — frozen for Edgar's visual review.  
**Not merged. Not permanent-world approved.**

---

## Workspace isolation

| Field | Value |
| --- | --- |
| **Base branch** | `main` |
| **Base commit** | `0764881` (`docs(worlds): reconcile registry with Obsidian vault`) |
| **Branch** | `grok/hollowmere` |
| **Worktree** | `.claude/worktrees/grok+hollowmere` |
| **World ID / preset** | `hollowmere` |
| **Display name** | Hollowmere |

---

## Concept

A thriving countryside village has grown around the flooded remains of an older, abandoned village. Beyond the valley, a massive stratovolcano dominates the horizon.

**Emotional arc:** comfort → curiosity → discovery → unease → wonder

**Core contrast:** living green Hollowmere vs quiet flooded lost village vs dark distant volcano.

**Not Ashen Reach:** human scale, dense streets, layered history, discovery — not a caldera civilization or central monumental tower-climb world.

---

## Geography

```
                           VOLCANO (22, -200)
                              ▲
                    volcanic foothills / hot springs
                              │
             hillside homes + orchard overlook (west)
                              │
FOREST → BRIDGE → HAMLET → LIVING VILLAGE → WATERMILL (east)
                              │
                       INNER OLD WALL / GATE
                              │
                     FLOODED LOST VILLAGE
                              │
                    DROWNED BELL TOWER (0, -6)
```

Axes: **+z south** (arrival), **−z north** (volcano). Origin near drowned basin.

### Elevation language

| Zone | Approx Y |
| --- | --- |
| Flooded basin floor | 56–59 |
| Sea / flood surface | 62 |
| Living village streets | 66 |
| Hillside terraces | 70–81 |
| Volcano peak | ~160 |

---

## Architectural language

**Living Hollowmere**

- Timber framing, pale plank walls, fieldstone, brick roofs
- Steep gables / hip roofs, chimneys, flower boxes, lanterns
- Dense streets, human door/window scale

**Lost village**

- Exposed stone, darkened deepslate timber
- Broken roofs, moss, mud floors, trees through ruins
- Older cousin of the same vernacular

---

## Districts (M1)

1. Forest arrival + roadside shrine  
2. Covered bridge / river crossing  
3. Arrival hamlet (inn, stables, cottages, gate)  
4. Market square (well, stalls, bakery, smith, tavern, civic)  
5. Living streets + alleys  
6. West hillside terraces + overlook  
7. East farm belt + barn  
8. Watermill landmark  
9. Inner old wall + descending gate  
10. Flooded lost village  
11. Drowned Bell Tower  
12. Foothill pilgrimage path + watch post + hot springs  

---

## Primary player journey

1. Spawn forest path `(6, 70.5, 104)` looking north  
2. Covered bridge at `(6, 72)`  
3. Arrival hamlet  
4. Market square  
5. Hillside overlook (volcano + basin layered view)  
6. North through inner wall  
7. Descent into flooded streets  
8. Approach Drowned Bell Tower  
9. Climb to bell chamber  

Optional loops: east farm/mill path, west hillside stairs, north foothill route, east/west basin loops.

---

## Landmarks

| Landmark | Role |
| --- | --- |
| Drowned Bell Tower | Primary hero destination |
| Stratovolcano | Macro landscape presence |
| Watermill | Living-economy secondary |
| Covered bridge | Arrival threshold |
| Market square | Social center |
| Hillside overlook | Signature layered composition |
| Inner wall / broken gate | New→old transition |
| Hot springs + watch post | Future volcano-route tease |

---

## Files

| Path | Role |
| --- | --- |
| `src/worldgen/HollowmereGenerator.ts` | Terrain + volcano + river + basin |
| `src/worldgen/hollowmereSite.ts` | All authored architecture |
| `src/worldgen/Presets.ts` | Preset registration |
| `tests/hollowmere.test.ts` | Contracts |
| `docs/worlds/hollowmere/*` | Registry card + review history |

---

## Engine changes

**None.** Reused existing `CitadelStamp`, prefabs, `LayeredGenerator`, `WaterFiller`, scatter oaks, spiral stair.

---

## How to load

```
?world=hollowmere
```

Dev: `npm run dev` then open with `?world=hollowmere`.

Suggested load / spawn:

```
http://localhost:5177/?world=hollowmere&spawn=6,71.5,122&look=0,0.05
```

```js
__vr.teleport(6, 71.5, 122)
// look north (−z), yaw ≈ 0
```

---

## Screenshots (M1)

Directory: `experimental/hollowmere/screenshots-m1/`  
Also mirrored under `.captures/hollowmere-*.jpg` (gitignored).

| # | File | Subject |
| --- | --- | --- |
| 1 | `01-spawn.jpg` | Forest spawn approach |
| 2 | `02-forest-arrival.jpg` | Forest path |
| 3 | `03-covered-bridge.jpg` | Covered bridge interior |
| 4 | `04-arrival-hamlet.jpg` | Arrival hamlet |
| 5 | `05-main-village-street.jpg` | Main street |
| 6 | `06-market-square.jpg` | Market square |
| 7 | `07-hillside-district.jpg` | Hillside terraces |
| 8 | `08-layered-village-volcano.jpg` | Layered overlook (weak framing) |
| 9 | `09-first-lost-reveal.jpg` | First lost-village reveal |
| 10 | `10-transition-inner-wall.jpg` | Inner wall transition |
| 11 | `11-flooded-streets.jpg` | Flooded streets |
| 12 | `12-drowned-bell-tower.jpg` | Bell Tower exterior |
| 13 | `13-watermill.jpg` | Watermill |
| 14 | `14-volcanic-foothills.jpg` | Volcano mass |
| 15 | `15-signature-overview.jpg` | Elevated village overview |
| 16 | `16-bell-from-lost-square.jpg` | Bell from square |
| 17 | `17-farm-belt.jpg` | Farm belt |

---

## Known weaknesses (M1)

1. Some house footprints may sit slightly off micro-terrain seams on slopes.  
2. Interiors are minimal (chimney/furnace/lantern only).  
3. Lost-village flooding is heightmap + stamp based, not a full hydrology sim.  
4. Random oak scatter can still punch through edges of authored zones.  
5. Volcano foothill path is a tease only — no summit route.

---

## Milestone stop

**Milestone 1 frozen.** Awaiting Edgar's review. Do not start M2 without approval.
