# Project Stonehaven Journal

## Milestone 2: Composition Review & World Design

**Date:** 2026-07-08

### Current Milestone
- Milestone 2 is a design review, not an implementation sprint.
- Primary question: does Stonehaven already guide a first-time player through a memorable journey?
- Content-building is intentionally paused until the terrain, pacing, road flow, sight lines, and landmark visibility have been judged honestly.

### What Changed
- Journal created for durable Stonehaven decisions and review findings.
- No terrain, road, or site content changes have been made during Milestone 2 yet.
- Captured 10 review viewpoints from the intended journey:
  - `.captures/stonehaven-m2-01-village-arrival-lake-crag.jpg`
  - `.captures/stonehaven-m2-02-harbor-edge-empty-waterfront.jpg`
  - `.captures/stonehaven-m2-03-village-road-forest-threshold.jpg`
  - `.captures/stonehaven-m2-04-east-shore-falls-bench.jpg`
  - `.captures/stonehaven-m2-05-stream-crossing-bridge-gap.jpg`
  - `.captures/stonehaven-m2-06-south-shore-fortress-vista.jpg`
  - `.captures/stonehaven-m2-07-switchback-base.jpg`
  - `.captures/stonehaven-m2-08-gate-notch-approach.jpg`
  - `.captures/stonehaven-m2-09-outer-ward-overlook.jpg`
  - `.captures/stonehaven-m2-10-summit-kingdom-overview.jpg`
  - Contact sheet: `.captures/stonehaven-m2-contact-sheet.jpg`
  - A second HUD-hidden Playwright pass also produced `.png` versions of the 10 captures plus `.captures/stonehaven-m2-contact-sheet.png`.

### What Improved
- The road spine is working as a testable structural idea: it gives the world a readable traversal path from the north bench toward the crag.
- The south-shore road segment is the strongest current playable moment. It has a believable cliff edge, meadow edge, and paved path moving through a framed corridor.
- The crag mass has scale. Up close, the switchback/gate approach already feels physically large enough to support a fortress.
- The road paving and route grading prove the terrain can be authored as a journey instead of a random heightmap.

### What Failed
- The world does not yet sell the intended journey from first contact. The opening village/lake view does not clearly reveal the fortress destination.
- The requested beats do not all exist in readable form yet. Harbor, residential district, bridge, fortress, and summit are mostly implied by terrain or absent.
- Several screenshots are technically locations, but not yet places. They lack focal landmarks, foreground/midground/background hierarchy, or a reason to stop.
- The road material reads too patchy and artificial in several views: the mixed cobble/gravel/stone creates noise before it creates character.
- The outer ward is the clearest failure of promise versus payoff. After the climb, the player reaches an empty grassy surface with path fragments instead of a strong arrival.
- The bridge beat is not compositionally legible yet; without an actual crossing object or carved threshold, it looks like a paved/grass collision on a slope.

### Composition Observations
- Overall composition: the macro ingredients are good (lake, village bench, forest road, eastern shelf, south-shore crag), but the readable destination arc is still weak.
- Pacing: the route has one strong middle stretch along the south shore, but the first act is under-authored and the final act lacks payoff.
- Terrain rhythm: bench -> lake -> shore road -> crag works in broad strokes. The local rhythm often breaks into voxel noise because the road edges and slopes are too busy.
- Sight lines: the fortress/crag is not visible often enough from the early route. The world needs more intentional "destination glimpses" across the lake and through forest openings.
- Road flow: the spline is structurally useful, but its visual treatment needs hierarchy: cleaner center line, softer shoulders, and occasional intentional pullouts/viewpoints.
- Landmark visibility: the crag is currently the only landmark with enough mass. The falls bench and bridge area do not yet read as named places.
- Vertical progression: the climb to the crag is promising. The road reaches height in a way tests already confirm is walkable, but the final arrival space is empty.
- Atmosphere: fog and distance haze help mood but hide the destination too aggressively for composition review. A memorable world needs the destination to appear, disappear, and reappear deliberately.
- Visual balance: water and meadow dominate early; stone dominates late. That contrast is good, but the middle needs stronger transitions so the journey feels authored rather than abrupt.

### Player Journey Observations
- Intended route to evaluate:
  - Harbor
  - Village
  - Residential district
  - Forest
  - Mountain trail
  - Bridge
  - Fortress
  - Summit
- Harbor: not present as a readable place. The water edge exists, but there is no harbor silhouette, docking shape, quay, or arrival composition.
- Village: the bench is suitable, but it is currently more empty meadow than village. It needs either built mass later or a clearer terrain plaza/road logic now.
- Residential district: not visible as a district. This should not be added as detail until the village footprint and sight lines are solved.
- Forest: present, but it frames mood more than direction. It should be used to reveal/hide the crag on purpose, not just populate slopes.
- Mountain trail: the route exists and is the strongest system-level success. It needs cleaner material language and more deliberate view stops.
- Bridge: not yet readable. This is likely the first true authored object Milestone 3 should test, because it can anchor the midpoint and make the falls bench memorable.
- Fortress: the terrain mass is ready for fortress composition, but the fortress itself is absent. The world cannot yet answer "can the castle be seen often enough?" because there is no castle silhouette.
- Summit: the top has height but not reward. The overlook back to lake needs composition cleanup and a meaningful destination point.

### Engine Discoveries
- Local: `__vr.save(..., {hud:false})` produced all 10 JPEG captures, but the wrapper process did not exit cleanly afterward. The captures are usable; the automation wrapper needed to be stopped manually.
- Local: a second raw Playwright screenshot pass produced all 10 PNGs and a contact sheet, but like the `__vr.save` pass, the wrapper did not exit cleanly and had to be stopped manually. This looks like automation/capture-session friction rather than a game runtime issue.
- Systemic/worth watching: normal fog and loaded-chunk range make wide composition screenshots hard to judge. High vistas can show sparse/unloaded distance unless the area is preloaded and the camera is close enough.
- Systemic/worth solving later: there is no dedicated "composition review" camera tool that batches named viewpoints, hides HUD, preloads surrounding chunks, freezes weather/time, and exits cleanly.
- Local/worldgen: the route overlay can create visually noisy paving because every column independently chooses cobble/gravel/stone. That is a design limitation of the current road material pass, not a core engine blocker.

### Ideas for Future Milestones
- Milestone 3 should not start by adding a full fortress. Start with composition anchors:
  - a harbor/quay footprint that clarifies arrival;
  - one bridge at the stream/falls crossing;
  - a fortress silhouette/massing blockout on the crag, not finished architecture;
  - two or three framed viewpoints/pullouts along the road.
- Before decorative detail, tune terrain/road composition:
  - thin or move forests to frame destination glimpses;
  - simplify road material noise into center/edge language;
  - create a stronger village plaza-to-lake edge;
  - make the outer ward read as a threshold rather than a flat meadow.
- Add a small reusable composition-review script/tool if Stonehaven will continue through many visual iterations.

### Milestone 2 Recommendation
- Do not proceed to detailed building yet.
- Stonehaven is promising but not compositionally ready. The route spine is the right foundation, but the world currently has fewer than ten truly screenshot-worthy places.
- Recommended next step: approve a focused composition pass that adjusts terrain/road/framing and adds only minimal landmark massing necessary to test the journey. Keep final architecture and decorative density for later.

## Milestone 3: Composition Pass

**Date:** 2026-07-18

### What Changed
- All authored anchors live in one exported `STONEHAVEN_SITES` constant (generator + site overlay + tests read the same data).
- Harbor: a level quay apron terrain-cut into the bench's lake edge (y 63), stone esplanade + quay wall, and a 3-wide plank pier on wood pilings with lantern-lit head. The M2 "empty waterfront" is now an arrival.
- Village plaza: bordered cobble square at the road's first waypoint with flanking lamps; steps down to the quay.
- Bridge: the terrain now opens a real gap where the road corridor crosses the stream gorge; a stone deck with cobble-wall parapets and headwall abutments spans it flush with the graded road. Road paving skips the gorge (the deck carries it).
- Road material hierarchy: solid cobble center line (dist < 1.3), gravel shoulders with sparse cobbles, frayed edge — replaces the per-column cobble/gravel/stone confetti M2 flagged.
- Fortress massing blockout: curtain wall with merlons + three corner bastions on the plateau, twin-tower gatehouse with lintel + cleared passage over the road, keep block with crenellated rim on the knoll, and a glowstone beacon basin on the lake-facing turret (visible across the water at night). Ward court: paved circle with a lit waymark plinth where the climb arrives.
- Viewpoints: two pullouts (south-shore meadow at (40,160); falls-bench rim at (90,120)) with parapet on the view side, gravel spur to the road, wayside lamp, and 15-block tree clearings for sightlines.

### Verification
- 1335 tests pass (17 stonehaven, including new anchor tests: bridge span + flush approach, quay/pier, keep/gate/court, cobble center line, pullouts); tsc + lint clean.
- Fresh captures in `.captures/`: `stonehaven-m3-01-village-arrival` (plaza + pier + keep silhouette across the lake — the destination promise M2 found missing), `-02-harbor-quay`, `-03-bridge`, `-04-vista-pullout`, `-05-gate-approach`, `-06-falls-overlook`, `-07-dusk-beacon`.

### Findings / M4 Notes
- The first viewpoint originally sat on the mountain-apron scree at (70,153) — surface probing in the live game caught it; moved to the meadow at (40,160). Probe `__vr.surface()` before anchoring anything to "flat" ground.
- Fortress massing is plain STONE, which merges with the crag's natural rock — reads as hewn-from-the-mountain. Acceptable for blockout; if M4 wants "built" readability, face the walls in a masonry material (cobble/stone brick) or raise the curtain another 4–6 blocks.
- From the south-shore vista the tier dome dominates and the wall line only peeks; the falls-rim overlook is the stronger fortress view. Consider lifting the curtain or pushing it to the plateau rim in M4.
- The turret beacon partially coincides with the moon from the harbor angle; still reads as a lit point. A taller fire tower would separate it.

## Milestone 4: Readability Pass

**Date:** 2026-07-18 (implemented on `experiment/project-stonehaven-m4` off main `5d73fd7`; uncommitted pending Edgar's review)

### Resolved from M3's findings
- "Fortress merges with the crag" → RESOLVED: all built faces are now masonry — cobblestone
  bodies over a two-course natural-stone plinth, carved-limestone trim (bastion crowns, gate
  jambs + arch lintel, keep quoins). The hewn-from-the-mountain base survives in the plinths
  and buttress ribs; the architecture above reads as construction in every capture.
- "Beacon coincides with the moon" → RESOLVED: the beacon is a dedicated fire tower (top 146)
  rising past the keep's new upper storey (140); at dusk it burns clearly above the skyline.
- "Keep reads as a featureless cube" → set-back crenellated upper storey, limestone quoins,
  shadow-slit windows at two storey lines.
- "Curtain only peeks from the vistas" → wallTop 116 / towers 123 + buttress rhythm; the wall
  line reads from both pullouts.

### What Changed (beyond the fortress)
- Village framing: harbormaster's house + inn flanking the plaza (floor 65) and a boathouse on
  the quay apron (floor 63) — cobble base, plank upper, glass, oak doors, hanging lanterns,
  slate hip roofs. The x 10..23 lake corridor is kept open by construction.
- Route continuity (found by the new tests + live walkthrough):
  - Bridge deck widened to 7 (x 99..105): the road crosses the gorge on a diagonal, and the
    5-wide deck put the south-end centerline on top of the parapet (a 2-block step).
  - Bridge-approach paving: the gorge-proximity skip now only skips columns that truly dropped
    into the gap; the approaches are paved again (they had reverted to grass and sprouted
    flowers mid-road).
  - Pier: the corridor above the deck is air-cleared — the shore lip sat at 64 (one above the
    apron) and the pier dead-ended into the grass bank at its first two segments.
- Tests: 17 → 22. Determinism now byte-compares every Y layer; both bridge approaches; a
  continuous top-solid walk through the gorge; generation-order identity for the bridge chunk;
  full-width gate floor/headroom/arch; pier walkability; village + corridor guarantees.

### Verification
- 1,661 tests green (192 files), tsc clean, lint clean, build passes (known bundle warning).
- Live `__vr.simulate` traversals: bridge (101,102)→(106,125); plaza→pier head; road→gate→ward
  (−74,148)→(−61,108,136). Gotcha for future passes: simulate's `yaw` is RADIANS, heading
  `(−sin ψ, −cos ψ)`, and the avatar must be teleported ~1.5 above `surface().y` or it embeds.

### Capture reproduction (record for M5+)
All via `__vr.fog(260,460)` + `preloadArea` + `pov(ex,ey,ez, tx,ty,tz)` + `save(name,{hud:false})`,
noon (`time(0.4)`) except 07 at dusk (`time(0.82)`):
- 01 village arrival: pov(16,86,−42, 0,80,120)
- 02 harbor quay: pov(−8,74,−8, 18,62,26) — moved from M3's (2,70,−4): the harbormaster's
  house now stands on the old camera spot
- 03 bridge: pov(84,98,98, 103,89,112)
- 04 vista pullout: pov(40, surface+2.6, 160, −74,122,120)
- 05 gate approach: pov(−78, surface+2.6, 152, −66,107,138)
- 06 falls overlook: pov(90, surface+2.6, 120, −40,105,118)
- 07 dusk beacon: pov(16,70,16, −74,128,120)
M4 captures: `.claude/worktrees/stonehaven-m4/.captures/stonehaven-m4-*.jpg`.

### Current (M5 candidate) observations
- Slate hip roofs are chunky up close; stair-based roofing would refine them.
- Fortress interiors, keep entrance, and wall-walk access do not exist yet.
- The SW flanking bastion stands close beside the gate switchback — dramatic, but watch it.
- The waterfall lip itself (the falls bench's lake cliff) still has no authored water feature.

## Milestone 5: Interiors, Roofcraft, and the Falls

**Date:** 2026-07-19 (branch `experiment/project-stonehaven-m5` off main `852e7c0`)

### Resolved from M4's observations
- "Slate hip roofs are chunky" → RESOLVED: `hipRoof` now lays oriented slate STAIRS on every
  ring edge (facing uphill; solid slate hips at the corners) — the village roofs read as real
  pitched planes.
- "Fortress interiors don't exist" → the keep opens up: a lantern-lit great hall (stand y 119),
  an upper hall in the set-back storey (y 135), and a central `spiralStair` climbing hall →
  upper hall → a 3×3 roof hatch (y 141). Entrance: a limestone-framed doorway in the east face
  reached by a grand stone stair cut up the knoll from the ward court — one rise per column,
  walk-verified (−56,120) → through the door at (−68,119.9).
- "No wall-walk" → a protected parapet lane along the east curtain (lane top one below the
  merlon line, lanterns on the crest), with a supported stone stair up from the ward.
  Walk-verified: (−43,137) at ward level → up the stair → the lane's north end, 21.7 blocks.
- "No authored waterfall" → the stream's final descent is now a cascade: source water laid
  flush into the groove bed over a stone seal (gravity ticker can't drop sand from under it),
  ending in a stone-rimmed splash pool on the shore beside the lake. The fluid ticker is
  edit-driven, so undisturbed worldgen water holds its shape (Cloudspire precedent).

### Route findings fixed during the live walkthrough
- The wall-walk lane originally extended south past its access stair — a solid 7-high wall
  blocking the approach; the lane now ends where the stair lands (z 128).
- A lane lantern sat exactly on the stair landing and blocked the step-up; lane lanterns now
  sit on the parapet crest.

### Test-health finding
- The M4 "compare every voxel" determinism test used ~400k `expect()` calls; under full-suite
  load it (and the similarly heavy Cloudspire package test) hit the 20 s timeout. Both stonehaven
  comparisons now diff the chunks' raw `data`/`state` arrays (faster AND stronger — state bytes
  cover stair facings), and the file's read-only tests share one sampler instead of regenerating
  the same chunks per test. Full suite: 1,665 green.

### Verification
- 1,665 tests (26 stonehaven), tsc, lint, build all green.
- Captures: `stonehaven-m5-01-falls`, `-02-roofs`, `-03-keep-entrance`, `-04-great-hall`,
  `-05-wall-walk`, `-06-village-arrival` (matched to the M3/M4 arrival viewpoint) in this
  worktree's `.captures/`.

### M6 candidate observations
- The great hall is bare — furnishing (hearth, banners, bookshelf walls) is pure dressing now.
- The cascade is thin at the top of the face; a widened upper chute or a second header pool
  would give it more mass from the village view.
- Gate flanking bastion still worth a look in play; keep watching.

## Milestone 6: Dressing Pass

**Date:** 2026-07-19 (branch `experiment/project-stonehaven-m6` off main `52fd4cd`)

### Resolved from M5's observations
- "The great hall is bare" → RESOLVED: hearth (cobble chimney breast + furnace) on the north
  wall under the existing lantern, a two-high bookshelf library along the south wall, a long
  plank-and-trestle table with floor-slab benches, and a study (shelves + reading table) in the
  upper hall. The door lane and stair shaft stay clear — the court→hall walk still verifies.
- "The cascade is thin at the top" → the upper 55% of the sheet is now 3 wide, and a
  stone-rimmed header pool sits at the top of the descent so the fall visibly pours from
  somewhere.
- "Watch the SW flanking bastion" → RESOLVED as intentional: probed from below the switchback
  (`stonehaven-m6-probe-bastion.jpg`) it reads as a flanking tower guarding the climb, with the
  limestone gate frame visible beyond. No change.

### Test-suite health (unrelated file, deliberate)
- `tests/cloudspire.test.ts`'s full-package comparison regenerates 242 authored chunks (~7 s
  standalone) and had begun flaking on the default 20 s timeout under full-suite load as
  sibling suites grew. It now declares `{ timeout: 60_000 }` with a comment.

### Verification
- 1,666 tests (27 stonehaven) / tsc / lint / build green; hall walkthrough re-verified after
  furnishing; captures `stonehaven-m6-01-great-hall`, `-02-falls`, `-probe-bastion`.

### M7 candidate observations
- The header pool is invisible from the village (behind the crest) — audible/particle water
  effects or a taller spill notch would sell it from afar.
- Upper-hall study could take a CYAN_GLASS window facing the lake.
- The village interiors (harbormaster/inn) are empty shells; same furnishing treatment applies.

## Render Visibility Fix

**Date:** 2026-07-08

### Problem
- From high mountain views, the far landscape faded into sky-blue too early. The player's screenshot showed nearby snow/rock clearly, but the valley beyond was washed out before it could read as terrain.

### Root Cause
- The world was already loading a large settled area in the live browser (`625` chunks, equivalent to a 12-chunk radius), so this was not only an unloaded-chunk problem.
- Surface fog started at `55%` of the visible radius and reached full sky color at the chunk boundary.
- The `55%` value existed in two places: `src/render/fog.ts` and the per-frame `surfaceFog` calculation in `src/app/Game.ts`. Changing only the helper would have been overwritten every frame.

### What Changed
- Raised `MAX_VIEW_DISTANCE` from `12` to `16`, letting strong machines grow from `625` settled chunks to `1089`.
- Added `SURFACE_FOG_START_RATIO = 0.82` and `fogRangeFor()` in `src/render/fog.ts`.
- Updated `applyFogRange()` and `Game.ts` to share the same fog range calculation.
- Updated `tests/fog.test.ts` to cover the new helper and ratio.

### Verification
- `npx vitest run tests/fog.test.ts`: pass.
- `npx vitest run tests/stonehaven.test.ts`: pass.
- `npm run build`: pass, with the existing Vite large-bundle warning.
- `npm run lint`: pass.
- Restarted Vite on `127.0.0.1:5240`; `http://localhost:5240/?world=stonehaven&save=stonehaven-world` returns HTTP 200.

### Notes
- A fresh headless browser stayed at the initial 4-chunk radius because its frame timing did not let the adaptive governor grow; the live user browser had already reached the old 12-chunk cap. Judge the fix after a hard refresh in the real browser and a short settle period.
- If Stonehaven still needs cinematic vistas beyond 16 chunks, the next step should be a deliberate scenic/cinematic mode or LOD strategy, not simply raising the cap again.
