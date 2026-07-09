# Voxel Realm — World Workflow

How a world moves from an idea to a shipped, portfolio-quality experience — and the rules that
keep that process safe, reviewable, and owned.

## Lifecycle definitions

| Label | Definition | Entry condition |
|-------|------------|-----------------|
| `CONCEPT ONLY` | A named idea. No branch, no save, no build. | Recorded in [IDEA_BANK.md](IDEA_BANK.md). |
| `ACTIVE PROTOTYPE` | Under construction or exploration. May be a local save, a preset, or a WIP branch. Not review-ready. | A build has started (branch, worktree, save, or preset exists). |
| `WORLD IN REVIEW` | Build milestones complete; awaiting Edgar's review. No new milestone started. | Milestone stop rule satisfied and status set to awaiting review. |
| `APPROVED WORLD` | Edgar has reviewed and approved it, but it is not yet merged or shipped. | Explicit Edgar approval recorded in the world's `REVIEW_HISTORY.md`. |
| `IMPLEMENTED WORLD` | Shipped: registered in `world-manifest.json` and bundled in `public/worlds/`. | Merged to `main` with manifest entry + bundle. |
| `ARCHIVED / ABANDONED` | Retired, stale, or paused indefinitely. | Edgar or the owner marks it archived. |

## Core rules

- **Edgar-only approval.** No world advances lifecycle state without Edgar's explicit approval.
  Agents propose; Edgar disposes.
- **No automatic promotion.** A prototype never becomes an approved world on its own, and an
  approved world never merges/ships on its own. Each transition is a separate, explicit decision.
- **Milestone stop rule.** Agents stop at the end of each milestone and hand back to Edgar
  (see below). No next milestone is started automatically.
- **One world per branch.** Each world lives on its own branch. Do not bundle multiple worlds.
- **Separate world content from engine changes.** Reusable engine changes (rendering, physics,
  tour/HUD, fog, camera, etc.) must be identified and separated from world-specific content so
  they can be reviewed and merged independently. Track them in
  [ENGINE_CHANGE_QUEUE.md](ENGINE_CHANGE_QUEUE.md).
- **Registry ≠ approval.** Being listed in [WORLD_REGISTRY.md](WORLD_REGISTRY.md) is documentation
  only; it does not grant merge or ship rights.

## Recommended naming

- **Branch:** `<agent>/<world-id>` — e.g. `grok/ashen-reach`, `claude/frostvale-valley`.
- **Worktree:** `.claude/worktrees/<agent>+<world-id>` — e.g. `.claude/worktrees/grok+ashen-reach`.

## Milestone stop rule

At the end of each build milestone, the agent MUST:

1. Complete the build scope for that milestone (no partial, no over-reach).
2. Run the relevant check/test suite.
3. Collect screenshots or captures when the milestone is visual.
4. Write a short self-critique (what works, what's weak, what's next).
5. Commit — or, if leaving a dirty state, write an explicit dirty-state handoff.
6. Change the world's status to **awaiting Edgar review**.
7. **Stop.** Do not start the next milestone automatically.

## Merge-readiness checklist

Before a world (or its engine changes) is considered for merge to `main`:

- [ ] Edgar has approved the world (recorded in `REVIEW_HISTORY.md`).
- [ ] Branch is one world only (no unrelated worlds bundled).
- [ ] Reusable engine changes are separated and listed in the engine-change queue.
- [ ] Branch is rebased / reconciled against current `main` (no wholesale stale merge).
- [ ] Screenshots/captures exist for visual milestones.
- [ ] Checks/tests pass.
- [ ] If shipping: `world-manifest.json` entry + `public/worlds/<id>.json` bundle prepared
      (this step is Edgar-gated; agents do not edit the manifest without approval).

## Screenshot / capture expectation

Every **visual** milestone must produce screenshots or captures as review evidence. A world with
no captured visuals is not review-ready. Store/reference them per the project's capture workflow;
link them from the world's `REVIEW_HISTORY.md`.
