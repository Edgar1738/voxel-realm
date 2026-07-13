# Cloudspire Citadel — Design & Site Plan

**World ID:** `cloudspire-citadel`  
**Title:** Cloudspire Citadel  
**Branch:** `grok/cloudspire-citadel`  
**Worktree:** `.claude/worktrees/grok+cloudspire-citadel`  
**Classification:** ACTIVE PROTOTYPE → ship target (agent assignment: full autonomous ship)

## Promise

An enormous high-fantasy castle-city rising through mountain mist: pale limestone walls, dark slate roofs, a Gothic cathedral at the palace heart, and one impossibly tall central spire that dominates a multi-layer skyline of terraces, gardens, waterfalls, and secondary towers.

## Composition (world coords)

| Region | Approx size | Notes |
|--------|-------------|-------|
| Authored city envelope | ~380 × 340 | Mountains + distant towers beyond |
| Outer fortifications | ~250 wide | Curtain + gatehouses |
| Inner palace terrace | ~150 wide | Cathedral + palace court |
| Cathedral | ~90 L × 58 W × 78 H | Full nave + interior |
| Central spire base | ~48 across | Narrowing stages to summit |
| Highest architecture | y ≈ 420–435 | Accessible balcony ≤ y 420 |

### Elevation programme

| Level | Y | Role |
|-------|---|------|
| Valley / lower approach | 72–88 | Roads, outer district |
| Outer city terrace | 96 | Walls, lower towers, approach |
| Garden terraces | 102–108 | Formal gardens, canals |
| Palace / cathedral floor | 112 | Court, cathedral, palace hall |
| Palace mid floors | 120–220 | Residential / gallery |
| Spire mid stages | 230–340 | Library, observatory approach |
| Crown balcony | ~410 | Highest walkable |
| Decorative peak | ~430 | Pinnacles only |

### Frame anchors

- Center: `CX=0`, `CZ=0` (palace court)
- Spawn / Arrival Overlook: `(0, 118, -210)` looking north (`yaw ≈ π`, slight down pitch)
- Outer south gate: `z ≈ -125`
- Cathedral: south of palace, nave along Z
- Main spire: north of cathedral, stacked on palace

## Zones

1. Arrival Overlook  
2. Lower Approach District  
3. Outer Fortifications  
4. Formal Garden Terraces  
5. Grand Cathedral (Tier A interior)  
6. Inner Palace Court  
7. Central Palace + Main Spire (Tier A)  
8. Secondary Towers (mix A/B/C)  
9. Waterfall Cliffs  
10. Mountain / distant landscape  

## Hero route

Arrival Overlook → Lower Approach → Outer Gatehouse → Garden Terraces → Cathedral Entrance → Cathedral Nave → Inner Palace Court → Central Palace Hall → Main Stair → Upper Palace → Sky Bridge → Observatory / Crown Chamber → Highest Accessible Spire Balcony

## Materials

Append-only Cloudspire family after LAVA(41):

| ID | Name | Role |
|----|------|------|
| 42 | limestone | Primary pale walls |
| 43 | carved limestone | Cornices, buttress caps, detail |
| 44 | slate | Dark roofs, steep caps |
| 45 | slate slab | Roof trim, steps |
| 46 | slate stairs | Roof / ramp runs |
| 47 | cyan glass | Cathedral / spire windows |
| 48 | gold trim | Limited luminous accents |

Fallback palette: STONE, DEEPSLATE, GLASS, GLOWSTONE, LANTERN, PLANKS, WATER, GRASS, LEAVES.

## Architecture language

Gothic pointed silhouettes, tall narrow windows, buttresses, octagonal tower stages, steep slate roofs, flying-buttress-like supports, balconies, pinnacles, large gate arches, sky bridges. Pale stone vs dark roofs is the core identity.

## Implementation modules

```
src/worldgen/CloudspireGenerator.ts   # terrain + surfaceAt
src/worldgen/cloudspireFrame.ts       # constants
src/worldgen/cloudspirePrimitives.ts  # gothic helpers
src/worldgen/cloudspireTerrain.ts     # walls, approach, mountains hooks
src/worldgen/cloudspireCathedral.ts
src/worldgen/cloudspirePalace.ts
src/worldgen/cloudspireTowers.ts
src/worldgen/cloudspireGardens.ts
src/worldgen/cloudspireWater.ts
src/worldgen/cloudspireDressing.ts
src/worldgen/cloudspireSite.ts         # overlay composition
```

Plus: Presets registration, curatedPreset meta, tests, bake package script, experimental save-meta, world-manifest + VRW bundle, docs/worlds card.

## Atmosphere

Optional `WorldMeta.atmosphere` (non-breaking):

- `weather?: 'clear'|'rain'|'storm'|'snow'|'auto'`
- `timeOfDay?: number` (0–1)
- Fog remains view-distance driven; cool overcast feel via default mid-day + rain-auto clear preference (`weather: 'clear'`, slightly cool time).

Existing worlds ignore absent fields.

## Performance

Chunk-clipped `CitadelStamp` stamps (same as Grand Keep). No full-city re-stamp outside chunk bounds. Distant towers are Tier C shells. Bake neighborhood for cold start; generator fills remainder.

## Non-goals

- Do not modify Grand Keep / Moonspire / Ashen Reach / Frostvale content.
- Do not reorder block IDs.
- No new fluid engine.

## Ship definition

Playable preset + packaged VRW + manifest + tests/lint/build green + PR open.
