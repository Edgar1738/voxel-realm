# Frostvale Valley — flagship curated world brief

*Hand-off brief for the builder. Grounded against the engine at `0e6f51e` (2026-07-08); every
constraint below was verified in source — file references are included so you can re-verify
anything that matters to a decision. This supersedes the earlier free-form prompt.*

## 1. Mission

Design and build Voxel Realm's flagship handcrafted world: **Frostvale Valley**, an alpine
kingdom — glacial valley, granite cliffs, snow peaks, one enormous waterfall, and a Nordic
timber village that looks like it has stood there for centuries.

This is not buildings dropped on procedural terrain. Landscape comes first: the terrain decides
where water flows, where roads switchback, where the village grows, and where the forests begin.
The emotional register is peace, warmth, wonder, and coziness — players should immediately want
to wander. Aesthetic anchors (recreate the *principles*, never copy): Skyrim's mountain
villages, Swiss alpine valleys, Scandinavian timber architecture, mountain monasteries.

Frostvale sets the quality bar for the curated collection (five worlds shipped today —
`world-manifest.json`). It should become the world players associate with Voxel Realm.

## 2. Engine ground truth — build with these facts, not Minecraft instincts

### 2.1 World model

- World height is **192** (y 0–191), sea level **62** (`src/core/constants.ts`). Horizontal
  extent is unbounded. All vertical composition — valley floor, village, cliffs, falls, peaks —
  fits in ~125 blocks above the valley floor. Plan peaks ≤ ~150 so summit structures fit.
- The world seed is **hardcoded to 1337** (`src/app/Game.ts:121`). The manifest `seed` field is a
  compatibility check, not an input. You choose the *preset*, never the seed.
- A save stores **only voxel deltas** against generated terrain (`src/persistence/SaveTypes.ts`).
  Unedited chunks regenerate from preset+seed forever outward, so the world has no edge — but
  preset overlays (trees, scattered structures) also generate in every unedited chunk. Sculpting
  that mostly keeps generated ground is cheap; wholesale terraforming or solid built-up mountains
  explode the save (~10 bytes/voxel entry; shipped worlds run 0.8–8 MB).
- Shipped-world reference sizes: Moonspire 139 chunks / 1.4 MB; Giza 2300 chunks / 7.5 MB.
  **Frostvale budget: ≤ ~1500 edited chunks, ≤ ~6 MB bundled.**

### 2.2 The palette is 39 blocks — design inside it

Full table in `src/blocks/blocks.ts`. What you have: grass, dirt, stone, deepslate, cobblestone,
gravel (falls under gravity), sand (falls), mud, terracotta, brick, planks, wood (one oak-toned
family), leaves (opaque cubes, biome-tinted), snow (**full cube only** — no layers, no snow
slab), water, glass, lantern, glowstone, crystal, bookshelf, furnace, flower, tall grass,
stone/plank **slabs**, stone/plank/cobble/brick **stairs** (upside-down supported), oak fence,
oak fence **gate** (toggleable), cobblestone and stone-brick **walls**.

Confirmed absent — do not plan around these: ice, torches, spruce/birch wood variants, doors,
trapdoors, **ladders (no climbable block — all vertical access is stairs)**, chests, barrels,
beds, wool/carpet, campfire, hay, signs, item frames, colored glass, lava.

Load-bearing behaviors:

- **Glass has no collision** (`ChunkManager.ts:374`) — players fall straight through it. Never a
  floor or a walkable "ice" surface. Windows in walls are fine.
- Fences, walls, and closed gates collide **1.5 blocks tall** — unjumpable. Good for balcony
  rails and pen fences; never place them where a player must pass except via a gate.
- Only three light sources: **glowstone 15** (harsh, hide it inside chimneys/under floors),
  **lantern 14** (warm framed pane — the window-glow block), **crystal 7** (cool dim,
  script-only, id 18). The furnace emits **no** light.
- Stairs: facing = the direction the **low side** points; use `__vr.stairs`/`stairsRun` and
  `stairFacingToward(dx,dz)` for roof edges. Rotate/mirror of copied regions preserves facing.
- Biome tint (grass tops, leaves, tall grass) comes from seed noise and **cannot be authored**
  — in Mountains/Tundra cells foliage reads pale and cold for free.

### 2.3 Water is simulated — author it inert

Rules in `src/world/fluidRules.ts`; ticker: one wave per 0.18 s, 128 cells/wave.

- **Source water resting on water is permanently inert** (state 0 — what `__vr.fill` and
  `__vr.place` write by default). Flowing water on water never falls or spreads sideways, but it
  still re-levels every tick and evaporates if orphaned from its feed — so place *every* layer
  of pools, rivers, and the entire falls curtain as sources (`fill` with block id 8 — water is
  not in the creative picker); never rely on water that flooded into place. Flowing water
  renders *identically* to sources (the mesher ignores flow state), so simulation buys zero
  visual benefit and costs settle time.
- 1-deep water on a solid bed **spreads** into same-level air, and any drop resets its range —
  a single leak creeps downhill indefinitely, writing a saved delta per wetted cell. Banks at or
  above the water surface along the *entire* river are mandatory. Make rivers 2 deep: the top
  layer goes inert and fish (which need 2-deep water) can spawn.
- Saved water loads exactly as saved, static; the sim never re-runs on load. **Gate before every
  save: `__vr.flow.queued() === 0`.** A cascade saved mid-flow ships frozen mid-flow.
- No mist, spray, foam shader, or waterfall audio exists. The falls' drama is geometric: height,
  width, backdrop, backlight. Fake the plunge-pool mist with a broken collar of SNOW blocks at
  the waterline, and hide CRYSTAL behind the curtain for a subtle night glow.

### 2.4 Atmosphere, life, and navigation

- Weather and time-of-day are **global, per-session, and not shippable in world metadata**.
  Every visit starts at t=0.3 (morning) with clear weather. The world must read alpine in clear
  morning light — that means snow on the ground, not falling snow. (`__vr.weather('snow')` and
  `__vr.time(t)` are session tools for screenshots only.)
- Snowfall never accumulates as blocks. All snow cover is placed SNOW cubes (worldgen paints
  snow caps at surface height ≥ 95, `SurfacePainter.ts:9`).
- Critters are habitat-driven near the camera: rabbits need **GRASS**, birds need **GRASS or
  LEAVES** (they perch in canopies, conifers included), fish need **2-deep water**, butterflies
  need flowers by day, fireflies need grass/water at night. Nothing anchors on SNOW blocks —
  keep the valley floor grassy and flowered so the village feels alive.
- The guided tour is a HUD-guided **walk** (name + distance readout), started from the world-info
  dialog — *not* the `T` key despite the README. Waypoints use the JSON key **`name`** (the
  shipped worlds' `label` keys are silently ignored — don't copy them). Arrival radius is 4
  blocks, horizontal-only; space consecutive stops well beyond 4 blocks.

### 2.5 Toolchain and caps (dev build only: `npm run dev`, `window.__vr`)

- Shape helpers are **flat methods** on `__vr` (`fill`, `hollowBox`, `sphere`, `cylinder`,
  `hollowCylinder`, `ring`, `octagon`, `cone`, `pyramid`, `line`, `tunnel`, `stairs`,
  `stairsRun`) — the docs' `__vr.shapes` namespace does not exist. Each takes exactly one block
  id; mixed-material work goes through `__vr.apply([{x,y,z,id,state?},…])`.
- **`__vr.path(points, {width, block, supportBlock, markerEvery})`** is a terrain-conforming
  polyline road builder — it samples the surface per column and can pillar-support elevated
  spans. This is the switchback tool.
- Caps: console builds **50,000 voxels/call** (tile larger jobs); `copy`/`replace`/`scan`
  200,000; in-game region tools 8,192. Edits apply only to **loaded** chunks —
  `__vr.preloadArea(x, z, radius)` (or `preloadAreaAsync` in a live tab) before building far
  away (it returns `{generated, meshed}`), then confirm `unloaded` is 0 on each build call's
  returned result. Undo history is 128 batches, in-memory.
- Region ops from the console: `copy`, `paste`, `move`, `mirror`, `rotate`, and `array(box, nx,
  ny, nz, sx, sy, sz)` — tiled repetition with per-axis stride, the tool for fence runs, field
  rows, and conifer belts. All preserve stair/gate facing.
- Blueprints (`.blueprints/*.json` via the dev server) are the reuse mechanism. **Use
  `__vr.paste(await __vr.loadBlueprint(name), x, y, z)` — never `__vr.stamp()`, which drops
  per-voxel state and breaks every stair and gate orientation.**
- A 42-entry curated catalog exists (`src/app/curatedBlueprints.ts`): the Village set (cottage,
  barn, stable, blacksmith, tavern, market-stall, watchtower, town-gate, well, lamp-post,
  farm-plot), Nature set (rock-outcrop, boulder-cluster, stone-shelf, ponds), Adventure ruins
  (ruined tower/cottage, standing stones, camp-shrine, broken bridge, statue, dead tree), and a
  Dungeon set (crypt, cell, collapsed hall, treasure vault). Treat these as scale references and
  raw material — Frostvale's buildings should be original and larger. Note the older village
  prefabs have **no explicit AIR interiors**: clear the footprint before stamping into slopes.
- Walkability is verifiable: **`__vr.reachable(from, to)`** steps real physics (works headless)
  and reports arrived/stuck. It's a beeline walker with auto-hop — verify winding routes
  (spiral stairs) leg-by-leg with waypoint chains. `__vr.slice(y, x1, z1, x2, z2)` prints ASCII
  floor plans for interior checks.
- Cameras and captures: `__vr.pov`, `orbit`, `frame`; `__vr.capture.overview(name, target,
  {radius, height, hud})` writes `.captures/<name>.jpg` — pass `hud: false` for clean shots.
- Execution environment note: `__vr` exists only in the dev build. An agent executes this brief
  by running `npm run dev` and driving a browser (Playwright + the preinstalled Chromium)
  through `page.evaluate` calls against `__vr`. `reachable`/`simulate` step physics manually, so
  they work even in a hidden/headless tab; verify WebGL renders (software GL is fine, slower).
  Proven capture recipe under software GL (Phase 0): the adaptive view-distance governor pins
  VD at ~4 chunks and disposes preloaded chunks every frame, so **stub the loop first**
  (`window.requestAnimationFrame = () => 0` after boot), then `preloadArea` tiles (≤ radius 7
  each — the 256-chunk cap), set `time`/`weather`/`fog`, and shoot with
  `__vr.save(name, {hud:false})`, which forces its own renders.

## 3. Terrain strategy — build on the `default` preset

All five shipped worlds sit on `flat`, but Frostvale is terrain-first and 600×600: building an
alpine massif up from a flat plain as deltas is a multi-million-voxel save. Instead:

**Base the world on the `default` preset at seed 1337 and pick a real mountain site.** The
layered generator (`src/worldgen/Presets.ts`, `LayeredGenerator.ts`) gives you, for free:
Mountains-biome relief up to ~y110+ with **snow caps above y95**, **conifer scatter on the snow
caps**, oak/birch forest below, carved caves with ore and the occasional pre-lit pocket, cold
pale foliage tint in Mountains/Tundra cells, and water-flooded basins below y62. Unedited
surroundings continue seamlessly forever — no world edge, and the overlay "leak" outside the
sculpted area is just more coherent forested mountains.

The trade: terrain is found, then sculpted — not invented from zero. Every changed voxel is a
saved delta, so steepen cliffs, carve the river, terrace the village, and leave the rest.

**Phase 0 (site survey) is therefore the first deliverable.** Fly the seed-1337 default world
(teleport in a coarse grid, sample `__vr.surface(x,z)`, capture overviews) and select a site
with: a bowl or through-valley with floor ~y64–72; a natural headwall on one side reaching
≥y110 (snow, and the waterfall source — you are expected to steepen and raise it; natural
Mountains terrain tops out around y110–127); at least one saddle usable as a mountain pass out
of the valley; flanking ridges that frame sightlines; no desert/swamp surface blocks (sand/mud
caps) within view of the core. Record the site's bounding box and the spawn-vista candidate in
this document before building. If no acceptable site exists after a
genuine search (~30+ probes), fall back to `flat` with **hollow-shell** mountains — but treat
that as a scope escalation and say so, don't slide into it.

### Selected site — Phase 0 record (2026-07-08) ✓

An exhaustive analytical survey (±8192 blocks, every column sampled at stride 16 against a
transcription of the height/biome pipeline, validated exactly against the engine by
`tests/frostvaleSiteProbe.test.ts` and cross-checked in-engine via `__vr.surface`) found 409
gate-passing sites; the selected winner:

- **World footprint:** x 200–800, z 3040–3640 (600×600, center ≈ (500, 3340)).
- **Headwall massif:** (500–620, 3080–3230); natural peaks **y113 at (560, 3184)** and y110+
  at (584, 3160), with natural snow caps and conifer scatter. The falls lip goes on its south
  face near (555, 3195) — the natural face already drops y100 → y60 in ~60 blocks at x≈544;
  build the lip up to ~y118–123 for the 55–60 drop.
- **Plunge basin:** natural sub-62 hollow at (472–560, 3230–3300) → pool and upper river.
- **West lake:** (140–360, 3150–3300) — the river's outlet; bridge/ford below the pool.
- **Village bowl:** (420–620, 3290–3470), floor y63–70, a natural Mountains/Tundra patchwork
  (grass meadows with snow patches — keep the grass for critters; it's already the Frostvale
  look). Confirmed from ground level: the snowy massif reads over the meadows.
- **Spawn vista (confirmed in-engine after Phase 1):** (560, ~65.5, 3330) looking north — the
  full falls curtain over the plunge basin, gravel shore and snow ledges in the foreground
  (`docs/media/frostvale-p1-spawn-vista.jpg`). The earlier candidate at (520, 3450) turned out
  to sit inside a wooded hillside — vista points must be verified with an actual render.
- **Mountain pass (re-sited in Phase 2):** the NE lake-inlet **narrows** at (612–622, ~3119) —
  stepping-stone crossing — then north through the natural shoreline defile at x≈644–658 out of
  the valley. The watchtower pad sits on the shoulder above the narrows at (590, 3134, y85),
  guarding the pass. Gentle secondary exit south ≈(590, 3450). (The original col guess at
  (640, 3100) is open water — grid-sample before routing.)
- **Phase 1 re-surface list:** sand shorelines (the generator caps ≤y63 near water with SAND —
  beaches read wrong here) → gravel/stone/grass; NE desert pocket (656–712, 3040–3160) →
  stone/snow; east swamp fringe (x ≥ ~700, z 3176–3300) → re-dress as moor or re-cap; the
  S desert strip sits outside the footprint (z ≥ 3650).
- Survey overviews: `docs/media/frostvale-site-aerial.jpg`, `docs/media/frostvale-site-massif.jpg`.

## 4. Design program

### 4.1 Scale targets

| Element | Target |
|---|---|
| Playable core | ~600×600 blocks (sculpted; world continues naturally beyond) |
| Village zone | ~180×180, organic — nothing grid-aligned |
| Hero lodge | ~55×40 footprint incl. porches/wings; ridge ~20 above its terrace |
| Valley floor | ~y64–72 (grass, meadows, river) |
| Snow line | y95+ (matches worldgen; hand-placed snow below only as drifts/roof caps) |
| Peaks | y110–150 |
| Interiors | ceilings ≥4, doorways ≥2 wide × 3 high, corridors ≥2 wide, stair runs ≥2 wide |

Interiors sized for the 0.6×1.8 player with room to feel generous — "bigger than Minecraft
proportions" means these numbers, not vibes.

### 4.2 The hero waterfall

One enormous fall dominates the valley. The drop is the derived number: **lip = plunge-pool
level + 50–60** (a floor at y64–72 puts the lip at ~y115–130; natural headwalls reach
~y110–127, so building the lip up is expected sculpting, not a deviation). Make it 3–5 blocks
wide — width reads better than height at these scales — falling sheer into a plunge pool at
valley level, feeding the river. Construction: fully hand-placed source columns
(§2.3), solid cliff behind the curtain, banked pool ≥2 deep, SNOW foam collar at the waterline,
CRYSTAL glow hidden behind the curtain. **Secret: a walkable grotto behind the falls** —
crystal-lit, reached by a ledge path from the pool; the curtain is inert so it's safe to tunnel
behind. The falls must be visible from the spawn vista, the village square, and the lodge
balcony; the river below it is crossable at the village bridge and at one ford downstream.

### 4.3 The village

A believable settlement responding to terrain, roughly: **summit shrine** → snow trail over
the **mountain pass** (the walkable route out of the valley) → **watchtower** on a spur →
switchback descent → **hero lodge** on a terrace above the square → **village square + market
stalls** → **blacksmith** (stone, chimney), **stable**, **barn + fields**, a
**storehouse/granary**, scattered **cabins** on their own terraces → **river, stone bridge,
and water mill** (hand-built vertical wheel — blueprint it) → forest edge, with a furnished
**hunter's cabin** deeper in the trees. Buildings sit on cut-and-fill terraces with retaining
walls (cobblestone wall + stone), never on stilts of dirt. Nothing grid-aligned; roads find
the contours.

### 4.4 The hero lodge

The visual centerpiece: heavy timber framing (WOOD frame members against PLANKS infill; SNOW or
TERRACOTTA for plaster contrast), intersecting plank-stair roofs with SNOW ridge/eave caps,
stone chimney (glowstone hidden in the throat for ember-glow), covered entry porch with fence
gates (there are no doors — gates and open archways are the vocabulary), balconies with fence
rails, big lantern-lit windows (lantern behind or as the glass).

Interior program, every room walkable and furnished: Great Hall (double-height, hearth),
Kitchen (furnace + counters), Dining Hall, Bedrooms, Library (bookshelves), Storage, Attic,
Basement. Furniture recipes (no furniture blocks exist): bed = plank-slab frame + SNOW duvet;
table = fence post + top-half plank slab; chair = plank stairs; shelf = bookshelf or top-slab
rows; hearth = furnace framed in cobble/brick + hidden glowstone; counter = planks + top-slab
overhang; crates = stacked planks cubes (the knotted texture reads as crating) in corners and
cellars. Build the furniture set **once as blueprints** and paste everywhere.

**The lodge balcony must overlook the entire valley — falls, river, village, peaks.**

### 4.5 Roads and circulation

No straight lines. Use `__vr.path()` along surveyed polylines for the valley roads (gravel core
with cobble edging and mud/dirt mottling; lay gravel on solid ground — it falls), `stairsRun`
for stone stair climbs, retaining walls on every cut, wood bridges (bridge prefab as reference)
over streams, narrow dirt forest paths threading the conifer belts, a snow trail over the
mountain pass, and a switchback trail with landings up to the shrine. Every path leads
somewhere; the road network *is* the exploration guide.

### 4.6 Vegetation by elevation

- Valley floor: grass, flowers, tall grass (the cross-billboard plants sway in the wind, and
  butterflies/fireflies follow them), fields, gardens. Keep it grassy — this is where the
  critters live.
- Lower slopes: conifer belts. The generator only scatters conifers on snow caps, so **harvest
  them**: `__vr.copy` 3–4 generated conifers from a snow cap, save as blueprints, and paste
  belts and clusters on the slopes (oak-toned trunks are the only wood — the conical silhouette
  carries the pine identity). Clear generated oaks where they break alpine sightlines; each
  removal is cheap (AIR deltas).
- High slopes: thinning trees, rock outcrops (nature blueprints), snow patches.
- Peaks: snow, bare stone/deepslate banding, wind-carved cornices.

### 4.7 Environmental storytelling and secrets

Small handmade scenes everywhere: wood piles (stacked WOOD), a cart (planks/fence/wood), fenced
animal pens (empty of livestock — the engine has no farm animals; imply use with hay-less
mangers, water troughs), lantern posts, cairns marking trails, a hunter's camp, gardens,
roadside shrines (camp-shrine prefab as a base). Rewarded exploration, each discoverable but
unmarked: the behind-falls grotto; a dressed natural cave (the preset carves them — find one on
site, light it faintly); one or two small tributary cascades on side streams (cheap — inert
source columns); a hanging-valley tarn with a fishing hut; an abandoned/ruined cabin; an old
broken bridge; a hidden treasure vault (dungeon set) at the end of the cave — the Tidewreck
smugglers' den is the precedent. Every secret gets a landmark only if it should appear in the
world-info list; leave at least two entirely unmarked.

### 4.8 Cinematic composition

Compose for the **default morning light (t=0.3), clear weather** — that is what every player
sees first. Design and verify these views explicitly (capture each with `{hud:false}`):

1. **Spawn vista** (this is the money shot): from the valley road, falls + lodge + peaks in one
   frame. Pose it, then `__vr.world.setSpawn('Arrival')`.
2. Village square → falls over the rooftops.
3. Lodge balcony → whole valley.
4. Bridge → up-valley to the falls.
5. Summit shrine → down-valley panorama.

## 5. Delivery phases — each gated, each captured

Work in a working save (`frostvale-valley-wip`), `world.saveAs('frostvale-valley')` for
publish. Metadata calls require the save to exist — make one edit before curating. Capture a
checkpoint overview per phase to `.captures/frostvale-phaseN-*.jpg`.

- **Phase 0 — Site survey.** Probe seed-1337 `default` terrain; select and document the site
  (bounding box, floor/headwall heights, spawn-vista candidate). *Gate: site meets §3 criteria.*
  **Done 2026-07-08 — see the site record in §3.**
- **Phase 1 — Terrain + water.** Sculpt cliffs/headwall (raise the falls lip to pool + 50–60),
  carve river channel, build falls + pool + river + tributary cascades (all sources, banked),
  tarn, frozen pond — the entire walkable sheet is SNOW; glass "ice windows" only where players
  cannot step, since glass has no collision. *Gate: `__vr.flow.queued() === 0` after a full
  settle; `scan` shows no stray water outside channels.*
  **Done 2026-07-08.** Headwall raised to ~y122 (lip y118, 55-block curtain at x 552–556,
  z 3205), stone-lined amphitheater + plunge pool, tributary cascade at x 578–579, ~230-block
  river to the west lake, hanging tarn on the plateau at (560, 3167, WL 105), frozen mere
  (2,315-cell snow sheet) NW of the village bowl, alpine shore/desert/moor recap. Gates:
  flow queue 0; water scans match predicted natural water **exactly** (4,267/4,267 and
  1,181/1,181 — zero leaks). Save: 832 chunks / 2.38 MB (`docs/worlds/wip/`). Lessons
  recorded: rim-fills on un-surveyed ground can produce towers (the first tarn) — carve water
  bodies into known ground; verify every vista with a render; the falls sightline needed the
  pool's south knob lowered.
- **Phase 2 — Circulation.** Roads, switchbacks, stairs, bridges, retaining walls. *Gate:
  `reachable()` passes leg-by-leg along every named route (spawn→square, square→lodge,
  square→bridge→ford, trail→watchtower→shrine).*
  **Done 2026-07-08 — 77/77 legs pass.** Six routes: mainSouth (spawn→square→south exit),
  shoreNorth (square→mere shore→bridge at 457–463×3264–3284→switchback base), switchback
  (west shoulder→tarn→shrine site at (559,3151)), eastLookout (square→pool SE rim overlook),
  pass (shrine→watchtower pad (590,3134)→narrows stepping stones→defile north), westFord
  (square→mere south shore→ford at (361–364, 3259–3267)). Square pad at (545,3346) y64.
  Verification lessons for later phases: `reachable()`/`teleport` y is **body center =
  ground + 1.9** (ground+1 starts embedded and intermittently sticks — it masquerades as
  terrain failure); test legs every ~12 blocks along the actual centerline; graded fixes must
  cut as well as fill; grade shared segments once, not per-route.
- **Phase 3 — Hero lodge.** Shell, roofs, interiors, furniture kit, lighting. *Gate: every room
  reachable from the porch; `slice()` floor plans reviewed per storey; balcony vista captured.*
  **Done 2026-07-08 — 15/15 rooms reachable from the porch.** Lodge at x550–596, z3352–3398 on
  a leveled y66 terrace SE of the square: double-height great hall with hearth + ember-lit
  chimney, kitchen, dining, library annex, three bedrooms + master, storage, railed gallery
  over the hall, north balcony (falls vista, view corridor cleared), cellar, east attic;
  half-step slab staircases throughout (no ladders exist). Furniture kit saved as blueprints
  (`docs/worlds/wip/blueprints/`, copy into `.blueprints/` to reuse). Verification lessons:
  toggle fence-gate doors open before `reachable()` runs (the walker can't interact);
  slab-run stairs with integer tread tops need their `top` cell explicitly cleared where a
  floor plane crosses; stair shafts need rails or walkers (and players) fall in; check every
  wall-mounted lantern and porch post against walk lanes; wing perimeter walls crossing
  another block's interior need upper-storey doorways carved too.
- **Phase 4 — Village.** Square, market, blacksmith, stable, barn+fields, storehouse, mill,
  cabins, hunter's cabin, watchtower, shrine — all with interiors, terraced, lit. *Gate: every
  building enterable and reachable from the square; no floating/buried footprints.*
  **Done 2026-07-08 — 11/11 buildings enterable; all six routes re-verified (78/78 legs).**
  Sites: blacksmith (522–532, 3321–3331) with alley + forge; stable + pen (523–533, 3335–3344);
  storehouse (524–534, 3355–3364); barn (536–550, 3408–3419) + fenced fields (536–549,
  3390–3405); mill + water wheel (439–449, 3277–3285); cabins at (594–602, 3336) / (524–532,
  3312) / (550–558, 3414); hunter's cabin (368–376, 3228) at the ford trail end; watchtower
  keep (587–593, 3131–3137) with interior spiral stair + crenellated platform, pass trail bent
  around its south face; summit shrine at (557–561, 3148–3152). Market stalls + lamp posts on
  the square. Siting lessons: check every pad against the route polylines BEFORE building
  (barn + cabin3 originally landed on the main road, the blacksmith on the spawn vista point);
  door aprons need grading as one surface with neighboring approaches, not per-building strips;
  `surface()`-derived verification heights are wrong under roofs — use explicit interior floor
  heights; stair hatches exit cleanest as bottom-slab half-steps, not hop-up holes.
- **Phase 5 — Vegetation + set dressing.** Conifer belts, oak clearing, meadows/flowers,
  storytelling props, snow drifts and roof caps. *Gate: the five §4.8 views composed and
  captured clean.*
  **Done 2026-07-08.** 117 conifers planted across five slope belts (no natural snow-cap
  conifers found to harvest in the surveyed windows — a synthesized cone prefab substituted,
  reads well); 414 meadow flowers/tall-grass; crest of the headwall broken up with snow drifts
  + boulders; props: cart at the barn, cairns along pass + switchback, firewood ricks, lookout
  bench. All six vistas captured clean (`docs/media/frostvale-v*.jpg`): spawn, square,
  balcony (after clearing six leftover canopy leaves off the lodge NW corner — probe before
  clearing: the "tree" was the lodge's own wall studs), bridge, shrine panorama, falls-lip
  overlook. Planting rules that worked: avoid rects for buildings/corridors, skip road-cap
  blocks and anything within 3 of a road deck, jittered 9-block grid at 0.35–0.55 density.
- **Phase 6 — Exploration layer.** Grotto, cave dress, tarn hut, ruins, vault, unmarked
  secrets. *Gate: each secret reachable; vault gated behind genuine discovery, not luck.*
- **Phase 7 — Curation + ship.** See §6.

## 6. Definition of done (the shipping contract — CI-enforced)

1. Saved as `.saves/frostvale-valley.json`; `__vr.flow.queued() === 0`.
2. Metadata complete via `__vr.world.*`: title **Frostvale Valley**, 1–2 sentence description in
   the shipped worlds' voice, spawn+look from the posed Arrival vista (`setSpawn('Arrival')`),
   **≥3 named landmarks** (plan ~8: The Falls, The Lodge, Village Square, The Bridge, The Mill,
   Watchtower, Summit Shrine, The Tarn), **tour of 8–12 waypoints using `name` keys**, ordered
   as a natural walk, consecutive stops >4 blocks apart. All y in [0,192].
3. `__vr.world.audit()` → `ready: true` (that check requires ≥3 landmarks and a ≥2-point tour on
   top of title/description/spawn/look).
4. Overview + vista captures in `.captures/` (`hud:false`).
5. `npm run world:package -- --save frostvale-valley --title "Frostvale Valley" --manifest
   --tags alpine,village,fantasy --port 5173` exits 0 with **no curation warnings**. Set
   `VR_VAULT` to a real writable directory first on non-Windows machines — the archive step
   defaults to a Windows path (the vault archive is a side effect; any scratch dir works).
6. `npm run world:bundle` exits 0 → `public/worlds/frostvale-valley.json`. **Known prerequisite:
   `world:bundle` re-bundles every manifest entry and `.saves/` is gitignored, so a fresh clone
   lacks the other five saves.** The committed bundles are byte-complete snapshots — restore by
   copying `public/worlds/<slug>.json` to `.saves/<slug>.json` for each shipped world, then run
   the normal full bundle. (`npm run world:restore` only works on a machine with the Obsidian
   vault. And beware: `worldBundle.ts` prunes any `public/worlds/*.json` it didn't just write,
   so a naive `--only` flag would delete the other worlds' bundles — don't take that path
   without also scoping the prune.)
7. Commit `world-manifest.json` + `public/worlds/frostvale-valley.json`; `npm test` green
   (`tests/shippedWorlds.test.ts` validates manifest/bundle/meta/block-ids).
8. `__vr.benchTour()` run along the tour with no pathological meshing hotspots; bundle ≤ ~6 MB.

## 7. Success criteria

- Feels handcrafted and centuries-settled; no "objects placed on terrain."
- The falls are visible from every major location and anchor navigation.
- Every structure is enterable, furnished, lit, and `reachable()`-verified.
- Exploration pays: every path leads somewhere, at least two secrets are unmarked.
- The five composed vistas each produce a screenshot worth shipping as marketing.
- The world visibly exercises the engine's signature systems: inert-but-simulated water at
  scale, critter habitats, shaped-block architecture, warm lighting, the guided tour.
- The full shipping contract (§6) passes, including CI.

## 8. Collection note

Frostvale is the quality bar for future curated worlds. The roadmap (one line each, to be
briefed separately): **Iron District** (dense industrial verticality), **Aetherion**
(Greco-Roman marble, aqueducts, amphitheater), **Emberreach** (desert mesas and canyon
cities), **Verdant Wilds** (giant trees, rope bridges, woodland settlements). Moonspire Realm
and Tidewreck Cove already ship — castle-kingdom and harbor themes are evolutions of those, not
new worlds.
