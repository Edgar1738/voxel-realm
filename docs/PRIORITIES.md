# Voxel Realm priorities

Reviewed 2026-08-01 against the current branch, open pull requests, CI, production benchmarks,
world registry, and deferred-work record. Re-rank after each merge or new same-machine benchmark.

## P0 — release decision for PR #76

1. Review and either merge or request changes on draft PR
   [#76](https://github.com/Edgar1738/voxel-realm/pull/76).
   - Why now: the branch is clean, synchronized with its remote, mergeable, and CI-green.
   - Delivers: prefab anchors/sockets and kits, furniture blueprints, more precise placement,
     obstruction-safe third-person camera behavior, and packaged Ember Spire.
   - Exit evidence: PR review decision, merge commit on `main`, and successful post-merge CI/Pages.

## P1 — converge the two older feature branches

2. Rebase and review draft PR [#74](https://github.com/Edgar1738/voxel-realm/pull/74) after #76.
   - Value: composable power brushes are the clearest next improvement to the build loop.
   - Risk: it predates #76 and overlaps `CreativeUi.ts`, `Game.ts`, `input.ts`, and README controls.
     Preserve the newer placement/prefab behavior instead of resolving conflicts mechanically.
   - Exit evidence: focused brush/input tests, full suite/build, and live pointer + undo smoke.

3. Split and reconcile draft PR [#75](https://github.com/Edgar1738/voxel-realm/pull/75) after #74.
   - Value: volcanic underground generation and creative NPC placement are both substantial.
   - Risk: its 45-file diff combines two independently reviewable features and touches current
     worldgen, workers, persistence, rendering, UI, and input. Land them as separate tranches if
     practical, with an explicit save/worldgen migration audit.
   - Exit evidence: deterministic generation parity, old-save compatibility, NPC round-trip
     persistence, production boot smoke, and full CI for each tranche.

## P1 — restore lifecycle records to source-of-truth quality

4. Reconcile world records immediately after the branch decisions above.
   - Update Ember Spire from “integrated on PR branch” to its actual merged or deferred state.
   - Audit Stonehaven's card/registry against the implementation now present in `main`; preserve
     the old worktree's unique M2/M3 captures before any cleanup.
   - Reconcile the Obsidian `Suggested Improvements.md` list, which still describes several
     shipped systems (stateful copy, capture response handling, corrupt-save protection, shapes)
     as open.
   - Exit evidence: registry, world cards, archive catalog, and open PR state agree.

## P2 — production confidence for every curated world

5. Add a repeatable production boot-smoke command for the manifest catalog.
   - Boot each shipped world through `vite preview`, fail on console/page errors or a missing
     first-frame/streamed event, and emit a compact timing report.
   - Keep wall-clock budgets advisory except on a pinned runner; structural boot failures should
     fail immediately.
   - Exit evidence: one command covers every manifest entry and is documented for release use.

6. Build a finish-world workflow around existing primitives.
   - Compose metadata validation, spawn/look setup, view-corridor preload, capture preflight,
     package/bundle, and archive/restore instructions.
   - Add interior checks for doorway clearance, usable air volume, furnishing, and minimum light;
     current exterior scans do not prove that a building is playable inside.
   - Exit evidence: a test world can be finished and audited without manual console choreography.

## P2 — next builder capability after power brushes

7. Add terrain-aware paths and foundations through the in-game builder.
   - Promote the existing route/path primitives into a UI workflow with road, bridge, retaining
     wall, and support/level modes.
   - Preserve edit caps, grouped undo, preload behavior, orientation state, and deterministic
     output.
   - Exit evidence: build and undo a path across flat ground, a slope, water, and a cliff edge.

## P3 — measured scalability and maintainability

8. Instrument large editable-world save cost before changing storage format.
   - `server/worldDiskStore.ts` still serializes a complete snapshot per debounced write.
   - Record save duration and bytes at representative chunk counts; move to per-chunk files only
     if measurements show user-visible stalls or unacceptable write amplification.

9. Continue feature-bound composition extraction.
   - `Game.ts` (~2.3k lines), `CreativeUi.ts` (~1.8k), and `DevControls.ts` (~1.3k) remain the
     largest coordination surfaces.
   - Extract only cohesive lifecycle/state boundaries exposed by upcoming features; file size
     alone is not sufficient justification.

## Measurement-gated, not current priorities

- Per-chunk network delivery: Ember's 1.5 KiB VRW1 package decoded in under 1 ms; generation and
  meshing dominate its 2.95 s initial stream.
- Alternate COOP/COEP hosting: current worlds meet recorded production boot budgets on the GitHub
  Pages-compatible path.
- A storage-format migration without save-duration evidence.
