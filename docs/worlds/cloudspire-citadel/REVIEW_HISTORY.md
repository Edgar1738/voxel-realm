# Review History — Cloudspire Citadel

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
