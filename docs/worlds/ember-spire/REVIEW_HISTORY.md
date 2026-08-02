# Review History — Ember Spire (formerly Ashen Reach)

## 2026-08-01 — integration and packaging

- **Authorization:** Edgar explicitly approved continuing the merge/packaging and benchmark work.
- **Integration:** Reconciled the preset registration with current mainline changes and added a
  dedicated Ember generation worker rather than raising the shared-worker budget.
- **Packaging:** Added the validated manifest entry and `public/worlds/ember-spire.vrw` (VRW1,
  metadata plus a no-op delta sentinel).
- **Evidence:** Ember/shipped-world tests pass; production build budgets pass; headed Chromium
  recorded first frame at 230 ms and initial streaming at 2945 ms with no browser errors.
- **Decision:** Transitioned from APPROVED WORLD to IMPLEMENTED WORLD in the current worktree.
  Commit/push remains a separate user-authorized action.

## 2026-08-01

- **Reviewer:** Codex readiness audit (no lifecycle transition)
- **Evidence:** `grok/ember-spire` at `6034734`; isolated `tests/emberSpire.test.ts` passes all
  16 tests; `git merge-tree main grok/ember-spire` reports one content conflict in
  `src/worldgen/Presets.ts`.
- **Packaging:** No `public/worlds/ember-spire.vrw` or manifest entry exists; the branch remains a
  generator/source world with curated metadata only.
- **Decision:** Remains APPROVED WORLD. Reconcile the preset registration on a fresh integration
  branch and package it only after Edgar explicitly approves the merge/ship path.

## 2026-07-08

- **Date:** 2026-07-08
- **Reviewer:** Edgar (per handoff — M2 approval recorded)
- **Milestone:** M2
- **Decision:** approved (M2), not merged to main
- **Evidence reviewed:** Branch `grok/ashen-reach` @ `5b300c9`; builder journal `docs/grok-world-journal.md` (on branch)
- **Required follow-up:** Edgar to decide merge/ship path; note generator/source world is not a full chunk bundle. No next milestone started automatically.
- **Approval status:** APPROVED WORLD (awaiting merge/ship decision)
