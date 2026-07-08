# Ashen Reach — World Journal

**Status:** Approved Voxel Realm world (Milestone 2). Isolated branch — **not merged to main**.

---

## World identity

| Field | Value |
| --- | --- |
| **Official name** | **Ashen Reach** |
| **World ID / preset** | `ashen-reach` |
| **Save name** | `ashen-reach` |
| **One-sentence** | An ancient volcanic-caldera civilization: pass through the Crater Gate into the Gate District, cross the ceremonial causeway to The Ember Spire, and climb to the summit beacon. |
| **Branch** | `grok/ashen-reach` |
| **Worktree** | `.claude/worktrees/grok+ashen-reach` |
| **Architecture language** | Deepslate massing, brick/terracotta trim, stone paving, glowstone/crystal ember accents, narrow vertical windows, hip roofs, timber posts |

---

## Approved composition (do not replace)

```
ARRIVAL PASS → CRATER GATE → GATE DISTRICT → LAKEFRONT
  → CEREMONIAL CAUSEWAY → EMBER SPIRE → SUMMIT
```

Plus: central caldera lake, circular open water, dark tower on island.

---

## Milestone history

### M1 (approved first pass)

- Authored caldera terrain + island
- Emberhold plaza, causeway, basic spire, magma bridge, vents, observatory, simple mine
- Vault archive `2026-07-08-ashen-reach`

### M2 (depth pass — current)

**Terrain landmarks**

- Arrival pass (enclosed north approach)
- SE cliff horn
- SW ash ravine
- NW monastery shelf
- NE terraced shelf
- Drowned-ruins shallows (west lake)

**District**

- Crater Gate (monumental twin towers + arch)
- Caldera Gate District: avenues, alleys, plaza, civic buildings, guild hall, workshops, terraces, colonnade vista

**Tower**

- Multi-tier exterior, buttresses, balconies
- Vertical journey: entrance → archive → ceremonial → guardian → shrine → summit crown

**Secondaries**

1. Cliff Monastery (NW) — cloister, shrine, overlook, approach stairs  
2. Drowned Ruins (west lake) — broken arches, waterline chamber  
3. Ash Mines (east) — monumental portal, branches, chamber, vertical shaft  

**Also:** ceremonial lakefront plaza, expanded causeway approach, reduced random scatter

---

## Main player journey

1. **Spawn** — arrival pass `(8, 71.5, -48)` looking south  
2. **Tunnel** — lantern-lined pass  
3. **Crater Gate** — emerge into first reveal of caldera  
4. **Gate District** — avenues, plaza, markets, terraces  
5. **Overlook / avenue south** — framed view toward lake  
6. **Lakefront plaza** — pylons, ceremonial apron  
7. **Causeway** — cross water to island  
8. **Spire entrance** — monumental north arch  
9. **Climb** — spiral through distinct floors  
10. **Summit** — crown beacon + walk ring  

---

## Secondary routes

| Destination | How to reach |
| --- | --- |
| Cliff Monastery | NW from district; follow stair path toward `(-62, 48)` |
| Drowned Ruins | West shore / causeway west; stepping stones to shallows |
| Ash Mines | East along ash road / fissure area to `(78, 108)` |
| Magma Bridge | East shore road (secondary scenic) |
| Cliff Horn Ruin | SE rim geological landmark |
| Rim Observatory | West rim road (legacy secondary) |

---

## Files

| Path | Role |
| --- | --- |
| `src/worldgen/AshenReachGenerator.ts` | Terrain + geological landmarks |
| `src/worldgen/ashenReachSite.ts` | Overlay orchestration |
| `src/worldgen/ashenReachDistrict.ts` | Gate + district |
| `src/worldgen/ashenReachTower.ts` | Spire M2 + ceremonial approach |
| `src/worldgen/ashenReachSecondaries.ts` | Monastery, ruins, mines, cliff ruin |
| `experimental/ashen-reach/save-meta.json` | Curated spawn/tour meta |
| `tests/ashenReach.test.ts` | Contracts |

---

## Engine changes

None beyond world content. Used existing `CitadelStamp`, prefabs, `LayeredGenerator`, `__vr` capture APIs.

---

## Performance notes

- Solid ground (no caves under site)  
- Geometry denser in district + tower — monitor FPS at full view distance  
- Prefer authored landmarks over wall noise scatter  

---

## Known weaknesses (post M2)

1. Cottage/civic buildings still share similar floor plans (palette + size variation only).  
2. Monastery stair may need foot-polish on steep terrain.  
3. Wide aerial stills still sensitive to chunk streaming/fog.  
4. Night lighting not authored as a separate pass.  
5. Not yet on official `world-manifest` / `main`.  

---

## Future opportunities (Milestone 3 candidates)

1. Unique landmark buildings (guild hall as special architecture)  
2. Night + fog atmosphere pass for volcanic mood  
3. More tower balcony exterior connections  
4. Optional official packaging after Edgar merge authorization  

---

## Launch

```powershell
cd C:\Users\Edgar\Desktop\voxel-realm\.claude\worktrees\grok+ashen-reach
copy experimental\ashen-reach\save-meta.json .saves\ashen-reach.json
npm run dev
```

http://localhost:5173/?save=ashen-reach&world=ashen-reach
