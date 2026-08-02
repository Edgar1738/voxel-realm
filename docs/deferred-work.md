# Deferred work & known next steps

The recent polish/refactor pass (branch `claude/codex-inspection-review-0l07b5`) shipped a
**v1** of each track from the codex inspections. This is the honest list of what was deliberately
scoped **out** of those v1s — recorded here so it survives in the repo rather than in chat.

## Structures / worlds

- **Per-chunk streamed world delivery.** Shipped worlds now use the compact VRW1 binary format.
  Loading is still whole-world; add range/per-chunk delivery only when measured world size or
  network latency makes it necessary. The 2026-08-01 Ember Spire production benchmark found its
  1.5 KiB package decoded in under 1 ms and initial streaming remained generation/meshing-bound,
  so this is not an Ember integration requirement.

## Dev / infra

- **`server/worldDiskStore.ts`** still re-serializes the whole world JSON per debounce cycle. Dirty
  chunks are now batched into that single serialization, removing the former write-per-chunk
  multiplier. A per-chunk-file format would make each cycle O(changed chunks) instead of O(world),
  but requires a compatible migration and is deferred until measurements justify it.
- **Composition contexts:** `CreativeUi` now owns and disposes its DOM, active modal listener, and
  timers, while `Game` owns the remaining runtime teardown. Continue extracting systems only when
  a feature exposes a cohesive state/lifecycle boundary; avoid file splits that merely move closure
  state.
- **Production COOP/COEP hosting:** GitHub Pages remains the measured default; switch only when a
  production benchmark shows its main-thread mesh fallback missing the frame-time target. See the
  README deployment section. Ember Spire met its first-frame and initial-stream budgets in the
  headed production benchmark without alternate hosting.
