# Review History — Cloudspire Citadel

## 2026-07-13 — P2 cleanups (Claude)

Minor follow-ups, straight to main:

- Dropped the buried court fountain at `(CX, CZ+30)` (it sat inside the palace footprint; the
  visible court fountain lives in `buildInnerCourt`).
- Trimmed the spire glass bays — windows now only on the wider lower stages (`half >= 7`) at height
  4, so the narrow upper stages + crown read as solid spire instead of a thin glass lattice at range.
- Removed the stale `docs/worlds/.hermes-tmp.*` sentinel dir.
- Investigated the "dead-on-arrival right-edge column": **not a bug** — it's the outer-wall gate/corner
  towers + pinnacles flanking the citadel, foreshortened by the wide arrival FOV.

Re-baked `.vrw` so the shipped save matches. Preview left as the P1 hero (change is subtle).

## 2026-07-13 — P1 polish (Claude)

**Status:** IMPLEMENTED WORLD — **showcase on main** (P1 committed straight to main)

Deferred P1s from the post-ship review, all applied and verified:

- **Palace facade** — `articulatePalace()` adds pilaster ribs between window bays, string courses,
  a projecting cornice, and a battlemented slate-capped crown, so the shaft reads as masonry rather
  than a blank box (`cloudspirePalace.ts`).
- **Spire doorway** — an explicit framed doorway on the stage-0 south face facing the roof; the
  roof→spire climb now walks straight through (was corner-gap-only; reachable went from stuck rem 22
  to arrived).
- **Cathedral nave lighting** — mid-height hanging chandeliers + denser aisle lanterns + glowing
  columns so the nave reads as a candlelit hall, not a dark corridor (`cloudspireCathedral.ts`).
- **Reservoir** — relocated east of the cathedral and stood on support piers to grade (was a slab
  floating over the east garden / clipping the cathedral), with a shorter aqueduct to the east
  cascade (`cloudspireWater.ts`).
- **Waterfalls** — widened from a 1–2-wide stripe to a 5-wide sheet in a stone chute with a mid
  ledge and a contained splash basin.

Repackaged: re-baked 242 chunks + `public/worlds/cloudspire-citadel.vrw` (~6.03 MB); preview refreshed
to show the articulated palace. Cloudspire tests + hero-route walkability re-verified (interior
segments + roof→spire→crown all walk). Committed straight to main (no PR).

## 2026-07-13 — Post-ship review + P0 polish (Claude)

**Status:** IMPLEMENTED WORLD — **showcase on main** (P0 fixes on `worktree-cloudspire-p0`, pending merge)

### Review findings (evidence-based)

Walkable and stable, but the shipped build missed three headline promises from the player's
actual viewpoints:

- **Buried gardens** — the generator's palace plateau (y112) reached to Chebyshev radius 78, but
  gardens/fountains/reflecting pool/paths were authored at `GG`=104, so the whole formal-garden
  layer sat below grade under bare grass.
- **Hero spire fogged out at arrival** — the crown is ~379 blocks from spawn but `fogFar` was 280,
  so the central spire dissolved into fog from the overlook.
- **Wrong preview** — `previews/cloudspire-citadel.jpg` was a byte-identical copy of Grand Keep's
  preview; the menu card showed a different world.

### P0 fixes applied

- Added seed-independent `cloudspireTerraceY()` and graded every garden feature + the processional
  paving onto the real terrace surface (`cloudspireGardens.ts`, `cloudspireDressing.clearHeroRoute`,
  hedges kept off the path spine). Gardens, fountains, reflecting pool, and paved avenue now read at
  grade; hero route re-verified walkable.
- `atmosphere.fogNear/fogFar` 140/280 → 150/500 so the spire reads as a silhouette from spawn while
  mist still builds through the mid-ground (`curatedPreset.ts`).
- Replaced the preview with a real Cloudspire 3/4 hero capture (spire + cathedral + terraced gardens).
- Rebuilt the shipped package: `.saves/cloudspire-citadel.json` (242 chunks) + `public/worlds/cloudspire-citadel.vrw` (~5.99 MB). Full suite (1511) + lint + build green.

Deferred (P1/P2, not in this pass): plain palace facade, obvious spire doorway from the roof,
cathedral nave lighting, floating reservoir over the east garden, dead-on arrival right-edge column.

## 2026-07-13 — Showcase approval + merge (Edgar)

**Status set to:** IMPLEMENTED WORLD — **showcase world on main**

### Edgar signal

- “merge it, and it is approved as a showcase world in voxel-realm”

### Ship

- PR #70 squash-merged to `main` as `b3c8578`
- Live identity: `world-manifest.json` + `public/worlds/cloudspire-citadel.vrw`
- Load: `?save=cloudspire-citadel` or `?world=cloudspire-citadel`

---

## 2026-07-13 — Full autonomous ship (Grok)

**Status set to:** IMPLEMENTED WORLD (branch ready to merge)

### Edgar signal

Assignment: design, build, validate, package, and ship Cloudspire Citadel end-to-end without intermediate approval pauses.

### Scope completed

- Generator preset `cloudspire-citadel` with multi-terrace mountain terrain
- Outer fortifications, gatehouse, lower district, gardens, cathedral, palace, multi-stage spire, secondary towers, waterfalls
- Cloudspire material family (limestone, carved limestone, slate, slate slab/stairs, cyan glass, gold trim)
- Optional world atmosphere metadata + boot application
- Hero route circulation clears
- Unit tests (`tests/cloudspire.test.ts`) green
- Baked package `.saves/cloudspire-citadel.json` (242 chunks)
- Manifest + VRW bundle + preview placeholder
- Design plan under `docs/plans/2026-07-13-cloudspire-citadel.md`

### Known limitations

- Preview image is a temporary stand-in until a true arrival capture is swapped in
- Distant Tier C towers are silhouette shells
- Full human walk of every optional secret not exhaustively playtested in this agent run
- Performance: bake focuses on hero neighborhood; full city streams from generator
