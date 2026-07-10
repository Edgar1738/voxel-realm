# Grand Keep Capital Expansion Design

## Goal

Expand The Grand Keep into a prosperous high-medieval European capital whose urban history reads
in three layers: the existing curtain becomes the old inner wall, a complete newer outer wall
encloses planned boroughs, and an unprotected suburb spills along the roads beyond it.

## Spatial plan

- Preserve the existing keep and old wall at `x=-92..108`, `z=-80..120`.
- Add the new outer circuit at `x=-182..198`, `z=-170..210`, five blocks thick with a walkable
  parapet, eight towers, and monumental south/east/west gates.
- Extend the flat capital plateau far enough to support the wall and boroughs; blend back to plains
  beyond the extramural development.
- Continue the processional Grand Avenue from the new south gate at `(8,-170)` to the old Grand
  Gate at `(8,-80)`, with a nine-block carriageway and pedestrian edges.
- Place Crown Market east of the avenue around `x=25..65`, `z=-145..-110`, anchored by a fountain,
  guildhall, counting house, stalls, and merchant rows.
- Place the cathedral close to the west around `x=-150..-105`, `z=-30..35`, with a cathedral,
  cloister garden, hospice edge, and wealthy residences.
- Place the artisan ward to the east around `x=125..175`, `z=-70..70`, with smiths, workshops,
  warehouses, guild signs, yards, and dense housing.
- Place merchant offices and warehouses in the north-east around `x=90..170`, `z=135..190`.
- Place villas, formal gardens, stables, and a tournament green in the south-west around
  `x=-165..-95`, `z=-155..-80`.
- Continue a ribbon suburb beyond the new south gate to roughly `z=-245`, plus a smaller east-road
  fringe, then transition into farms, orchards, mills, livestock pens, and roadside structures.

## Architectural language

- Civic landmarks use stone and cobblestone massing, tall glazed openings, arcades, towers, and
  warm brick roofs.
- Merchant and residential buildings use stone ground floors, timber-framed upper floors, narrow
  footprints, steep roofs, overhangs, signs, shutters, and furnished ground rooms.
- Major roads are broad and legible; old lanes remain irregular and dense. Surviving inner-wall
  towers and arches are reused by shops and houses to make the city's growth visible.
- Human-scale details—wells, fountains, carts, stalls, gardens, lanterns, pens, and service yards—
  provide contrast with the monumental keep.

## Implementation structure

- `grandKeepCapitalFrame.ts`: new wall and district coordinates.
- `grandKeepCapitalPrimitives.ts`: roads, plazas, pitched roofs, timber facades, lamps, gardens.
- `grandKeepCapitalBuildings.ts`: merchant houses, inns, guildhall, cathedral, workshops,
  warehouses, villas, chapels, and farm buildings.
- `grandKeepCapitalWalls.ts`: complete outer circuit, towers, gates, patrol walk, ditch, bridges.
- `grandKeepCapitalDistricts.ts`: Grand Avenue, Crown Market, cathedral close, artisan, merchant,
  and villa districts.
- `grandKeepSuburbs.ts`: ribbon suburb and rural transition.
- `buildCapitalExpansion` is stamped after the existing village and before the final route-clearing
  pass, preserving the current town as the earliest fabric of the new borough.

## Quality and safety constraints

- All generation remains deterministic and chunk-clipped through `CitadelStamp`.
- New roads and gates retain player headroom and connect to existing circulation.
- Landmark coordinates receive focused structural tests before implementation.
- Wall continuity, gate openings, plateau support, furnished interiors, and district identity are
  covered by invariants rather than fragile whole-world snapshots.
- The curated `grand-keep` bundle and manifest metadata are regenerated after generator changes so
  the showcase page ships the expansion rather than only fresh procedural worlds.

## Delivery sequence

1. Terrain/frame and outer defenses.
2. Grand Avenue, roads, and plazas.
3. Cathedral, guildhall, market, inn, and other civic anchors.
4. Merchant, artisan, residential, warehouse, and villa infill.
5. Extramural suburb and rural transition.
6. Bundle regeneration, automated verification, and live visual review.
