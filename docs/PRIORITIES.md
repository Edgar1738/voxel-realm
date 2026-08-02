# Voxel Realm priorities

Reviewed 2026-08-01 against `main`, merged pull requests, CI, production benchmarks, the world
registry, and deferred-work records. Re-rank after each merge or new same-machine benchmark.

## Completed top-priority convergence

- PR #76 shipped as `4d4868a`: prefab anchors/sockets and kits, furniture blueprints, precise
  placement, obstruction-safe third-person camera behavior, and packaged Ember Spire.
- Stale PR #74 was reconciled and superseded by PR #77 (`33672cd`), shipping composable power
  brushes without regressing the newer builder dock or placement controls.
- Stale PR #75 was split into independently reviewed PRs #78 (`79fcb2f`, universal volcanic
  caverns) and #79 (`c665e7e`, creative NPC placement and repeat controls).
- All replacement PRs passed the full CI gate. The world registry, world cards, engine queue, and
  Obsidian improvement record were reconciled after landing.

## P2 — production confidence for every curated world

1. Add a repeatable production boot-smoke command for the manifest catalog.
   - Boot each shipped world through `vite preview`, fail on console/page errors or a missing
     first-frame/streamed event, and emit a compact timing report.
   - Keep wall-clock budgets advisory except on a pinned runner; structural boot failures should
     fail immediately.
   - Exit evidence: one command covers every manifest entry and is documented for release use.

2. Build a finish-world workflow around existing primitives.
   - Compose metadata validation, spawn/look setup, view-corridor preload, capture preflight,
     package/bundle, and archive/restore instructions.
   - Add interior checks for doorway clearance, usable air volume, furnishing, and minimum light;
     current exterior scans do not prove that a building is playable inside.
   - Exit evidence: a test world can be finished and audited without manual console choreography.

## P2 — next builder capability after power brushes

3. Add terrain-aware paths and foundations through the in-game builder.
   - Promote the existing route/path primitives into a UI workflow with road, bridge, retaining
     wall, and support/level modes.
   - Preserve edit caps, grouped undo, preload behavior, orientation state, and deterministic
     output.
   - Exit evidence: build and undo a path across flat ground, a slope, water, and a cliff edge.

## P3 — measured scalability and maintainability

4. Instrument large editable-world save cost before changing storage format.
   - `server/worldDiskStore.ts` still serializes a complete snapshot per debounced write.
   - Record save duration and bytes at representative chunk counts; move to per-chunk files only
     if measurements show user-visible stalls or unacceptable write amplification.

5. Continue feature-bound composition extraction.
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
