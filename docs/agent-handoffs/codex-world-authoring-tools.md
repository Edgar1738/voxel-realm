# Handoff: Project Stonehaven (world authoring)

**Last updated:** 2026-07-19, end of the Milestone 5 pass (Claude). M4 merged to main as `852e7c0`; M5 (stair roofs, keep interiors + wall-walk, the falls cascade, test-suite health) implemented on `experiment/project-stonehaven-m5` — see the journal's M5 entry for details, findings, and M6 candidates.
This file replaces the stale 2026-07-08 Codex handoff, which still described Milestone 2,
forbade starting M3, called PR #57 unmerged, and reported worktree states that no longer exist.

## Current repository truth

- `main` == `origin/main` at `5d73fd7` — the merge of `experiment/project-stonehaven`
  (M1 terrain `c0293b9`, road spline `41b833e`, M3 composition pass `4291175`).
- PR #57 (render distance 12→16 + surface-fog start 0.82) is **merged** (`4ee5208`).
- **Milestone 3 is complete and merged.** Every M2 gap has an anchor: harbor quay/pier + plaza,
  stone bridge over a real terrain gap, fortress massing with night beacon, paved ward court,
  road material hierarchy, two vista pullouts. Independent verification at merge: 188 files /
  1,656 tests, lint + tsc clean.
- **Milestone 4 is complete and merged** (`852e7c0`, fast-forwarded to `main` on Edgar's
  "ship it"; CI + Pages green). **Milestone 5** (stair roofs, keep interiors + wall-walk, the
  falls cascade, test-suite health) followed on branch `experiment/project-stonehaven-m5` in
  the same worktree — journal has full detail.

## Milestone 4 objective (done this pass)

Turn the M3 blockout into a readable authored journey: fortress that reads as architecture
(not crag), a harbor that feels inhabited, and a fully traversable route — without attempting a
finished kingdom.

## Files changed (uncommitted, in the M4 worktree)

- `src/worldgen/StonehavenGenerator.ts` — `STONEHAVEN_SITES` reshaped: ward heights raised
  (wallTop 116, towers 123), keep gains a set-back `upper` storey (topY 140), `turret` replaced
  by a taller `beacon` fire tower (topY 146), bridge deck widened to 7 (x 99..105 — the road
  crosses on a diagonal; the 5-wide deck put the centerline on the parapet), new `village`
  block with three building footprints.
- `src/worldgen/stonehavenSite.ts` — masonry fortress (cobblestone bodies over 2-course stone
  plinths, carved-limestone bastion crowns / gate jambs+lintel / keep quoins, buttress ribs
  every 6th curtain column, keep window slits + upper storey, glowstone basin on the fire
  tower, gate headroom 4); village builder (`buildingShell` + `hipRoof`: harbormaster's house,
  inn, boathouse); bridge-approach paving fix (skip only columns that truly dropped into the
  gorge — unpaved approaches were sprouting plants in the road); pier corridor air-clear (the
  shore lip sat one block above the apron and the pier dead-ended into the bank).
- `tests/stonehaven.test.ts` — determinism now compares **every** Y layer; south bridge
  approach; continuous post-overlay top-solid walk through the gorge section; generation-order
  /cross-chunk identity for the bridge chunk (6,7); full-width gate floor/headroom/arch; pier
  deck walkable + dry over water; village masses + open plaza-to-quay corridor. 22 stonehaven
  tests total.
- `docs/project-stonehaven-journal.md` — M4 entry appended.
- Main-checkout `.claude/launch.json` (untracked user config): added `stonehaven-m4` dev server
  entry, port 5241, `--prefix` into the M4 worktree.

## Verification (this pass)

- `vitest run`: 1,661 tests green (192 files). `tsc --noEmit` clean. `npm run lint` clean.
  `npm run build` passes (pre-existing large-bundle warning only).
- Live traversals via `__vr.simulate` on port 5241 (`?world=stonehaven&save=m4-review`):
  bridge crossing (101,102)→(106,125) grounded across the deck; plaza→pier head
  (16,5)→(15,64,27); road→gate→ward (−74,148)→(−61,108,136) through the gate passage.
  No console errors.
- **`__vr.simulate` yaw is RADIANS** with heading `(−sin ψ, −cos ψ)`; teleport the avatar to
  `surface().y + ~1.5` first or it embeds in the ground and cannot move.

## Captures

M4 set (matched to the M3 viewpoints recorded in the journal):
`.claude/worktrees/stonehaven-m4/.captures/stonehaven-m4-01..07-*.jpg`.
M3 baseline set: `.claude/worktrees/experiment+project-stonehaven/.captures/stonehaven-m3-*.jpg`.
The m4-02 camera moved to (−8,74,−8)→(18,62,26) because the harbormaster's house now occupies
the M3 camera position — deliberate evidence of the village, not drift.

## Remaining risks / open items

- The old `experiment/project-stonehaven` worktree still exists and holds the only copies of the
  M2/M3 captures; archive them before any teardown.
- Fortress interiors are still massing-only; the gate flanking bastion (−76..−72, 138..142)
  stands close beside the switchback — intended as a flanking tower, revisit if it crowds.
- Slate hip roofs are chunky at close range; stairs-based roofs are an M5 option.
- `RouteSpline` still assumes ≥2 points; fine while fixed to `STONEHAVEN_ROAD`.

## Next exact steps

1. M4 and M5 are shipped; the journal's "M6 candidate observations" hold the queued ideas
   (great-hall furnishing, a wider cascade header, bastion-crowding watch).
2. Do NOT begin Milestone 6 without Edgar.
