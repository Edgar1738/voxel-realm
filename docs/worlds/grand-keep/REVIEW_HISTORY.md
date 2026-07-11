# Review History — The Grand Keep

## 2026-07-09 — M3 polish + re-ship (Grok)

**Status set to:** IMPLEMENTED WORLD (M3 polish on showcase package)

### Edgar signal

- “yes proceed all 1-4” — playtest, merge kings-chamber, more build, merge/ship

### Scope completed (M3)

- Fixed hotel/solar floor collision: guest hotel moved to STACK[15–16] above solar skylight
- Guest suites, state/gallery props, library carrels, barracks bunks densified
- Village: lived-in houses, market goods, gardens, smithy benches, tavern/chapel props
- Processional spine clear (approach + courtyard) without wiping fountain plaza
- Structural tests: 34/34 green (processional, stair doors, library/barracks props)

### Ship

- Re-bake `public/worlds/grand-keep.json` + merge to `main` / live demo

---

## 2026-07-09 — Showcase ship (Grok)

**Status set to:** IMPLEMENTED WORLD (showcase package)

### Edgar signal

- M1: looks good → M2
- Interior/height/village expansions continued with approval
- **“lets save this as a showcase world. approved. proceed”**

### Shipped

- Baked package: `.saves/grand-keep.json` → `public/worlds/grand-keep.json` (~196 chunks, ~11 MB)
- Manifest entry with tags `castle,fantasy,exploration,village`
- Preview: `public/worlds/previews/grand-keep.jpg`
- Engine: `WORLD_HEIGHT` 512, `SAVE_VERSION` 2 (other showcase metas bumped to v2 for CI)

### Notes

- Generator preset `grand-keep` remains the full-world source; package bakes approach + keep neighborhood for cold start.
- Vault `world:package` archive step may hang on large saves; manifest + bundle done manually after bake.

---

## 2026-07-09 — Milestone 2 handoff (Grok)

**Status set to:** AWAITING EDGAR REVIEW — MILESTONE 2

### Edgar signal

After M1 playtest: “looks good. proceed” → M2 started.

### Scope completed (M2)

- Courtyard wayfinding: fountain, processional banners, keep door surround, side paths to wall stairs
- Great Hall dressing: feast tables, high table, aisle rugs/sconces, stair mouth markers
- Throne chamber: carpet runner, benches, banners, gallery pedestals, state desk
- Residential: beds, carpets, library tables/shelves, private hall seating
- High castle: war map table, armory racks, guard bunks, council table
- Grand stair: dense lantern lighting, glow under landings, overlook slits into the hall
- Exterior silhouette: south chapel bay, shoulder turrets, roof ridge strips, approach banners
- Dungeon atmosphere props
- Tests: 28 passing (`grandKeep` + circulation)

### Still out of scope

- Full city / multi-castle complex
- Manifest ship / merge to main
- Exhaustive prop density in every room

### Edgar decision needed

- Approve M2 for merge candidacy / further polish / ship path, or request changes.

---

## 2026-07-09 — Milestone 1 handoff (Grok)

**Status set to:** AWAITING EDGAR REVIEW — MILESTONE 1

### Scope completed

- Terrain/site mesa + approach road + moat + bridge
- Outer curtain ~124×124, gatehouse, courtyard
- Main keep shell multi-storey with hollow interiors
- Grand staircase (5-wide switchback) ground→roof
- Secondary west spiral stair ground→high
- Crown + Watch tower spirals above roof
- Dungeon under keep with cells, vault, return shaft
- Landmarks + tour meta (save-meta)
- Unit tests + screenshots under `experimental/grand-keep/screenshots/`

### Explicitly not done (was M2+)

- Deep furniture / prop dressing
- Surrounding city
- Manifest ship / merge to main
