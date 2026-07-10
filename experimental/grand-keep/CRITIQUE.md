# The Grand Keep — Milestone 1 Self-Critique

**Status: AWAITING EDGAR REVIEW — MILESTONE 1**

## What works

| Area | Notes |
|------|--------|
| **Silhouette** | Gatehouse read is strong from the spawn approach — twin towers, portcullis, lanterned road. Spawn screenshot is the M1 hero image. |
| **Scale** | Outer curtain 124×124; keep ~97×61; four storeys + dungeon + roof; Crown/Watch towers above the roofline. Meets the “not a small keep” bar. |
| **Approach** | Deliberate south reveal: road → moat bridge → Grand Gate. Castle dominates the view. |
| **Vertical programme** | Distinct floor elevations (12-block rises), grand switchback stair well, secondary west spiral, two major tower spirals, dungeon shaft. |
| **Interiors as volumes** | Great Hall (columns, double-height feel), throne axis, residential rooms, war/high floor, dungeon vault + cells all exist as real hollow space. |
| **Roof reward** | Walkable roof, battlements, Crown Tower, beacon mast — roof shot reads as a summit. |
| **Architecture reuse** | Pure authored overlay on existing `CitadelStamp` / stair / preset pipeline. **No engine changes.** |

## What is weak

| Issue | Severity | Notes |
|-------|----------|--------|
| **Boxy massing** | Medium | Curtain + keep are still mostly rectangular slabs. Buttresses/setbacks help a little; M2 should add more silhouette breaks (chapels, wing setbacks, irregular towers). |
| **Empty interiors** | Expected M1 | Rooms are volumes + lanterns/placeholders. Throne and hall read large but sparse. |
| **Courtyard readability** | Medium | Processional path exists, but courtyard destinations (wall stairs, keep door, towers) need stronger visual anchors (M2). |
| **Stair photography** | Medium | Grand stair is present (unit-tested steps) but dark and hard to frame in captures; needs more well lighting and an open overlook. |
| **Dungeon sealing** | Medium | Earlier shots showed sky bleed; solid shell + ceiling added. Needs live playtest after reload. |
| **Headless walkTo** | Low/known | Beeline `__vr.reachable` fails on some legs even when block samples show air — likely chunk streaming under headless walk, and beelines cannot follow switchback stairs. Structural circulation tests pass. |
| **Overview capture** | Low | Distant orbit shows swiss-cheese streaming. Use closer approach/overview for review. |

## Navigation verdict (M1)

| Route | Verdict |
|-------|---------|
| **Primary (spawn → roof → Crown)** | Structurally present end-to-end. Spawn→gate verified on foot via headless walk. Intermediate legs: clear air column samples; live playtest required for stair flights. |
| **Dungeon** | Shaft + spiral + corridors + vault stamped; return via same shaft. Live climb test recommended. |
| **Stair systems** | (1) Grand 5-wide switchback east wing ground→roof (2) Secondary west spiral ground→high (3) Crown tower spiral (4) Watch tower spiral (5) Gatehouse upper stair (6) Corner wall-walk towers (7) Dungeon shaft spiral |

## Recommended Milestone 2 (do not start)

1. Live on-foot playtest with Edgar; fix any real choke points found.
2. Dress Great Hall / throne / one residential suite / war room with furniture language.
3. Strengthen courtyard wayfinding (banners, distinct door surrounds, fountain).
4. Light the grand stair well and add a mid-landing overlook into the hall.
5. Soften exterior silhouette (wing projections, taller gatehouse flanks, varied roof lines).
6. Optional: guided tour polish + one packaged save for easy demos (still no manifest ship without approval).

## Risks

| Risk | Mitigation |
|------|------------|
| **Biggest risk:** circulation feels correct in stamps but fails in live physics on a switchback | Edgar playtest; waypoint-based `__vr.reachable` legs along stair landings |
| Stair/tower join collisions | Already separated crown from stair well; re-check after any massing change |
| Scope creep into city/furniture | Hard stop at M1 |

## Strongest / weakest

- **Strongest:** Spawn approach silhouette + gatehouse presence; roof/Crown summit.
- **Weakest:** Mid-interior emptiness + boxy courtyard/keep reading; stair leg live-validation incomplete.
- **Biggest risk:** Hidden on-foot blockage on multi-flight stairs or keep entrance steps.
- **Next step:** Edgar reviews M1; only then approve M2 polish list above.
