# Voxel Realm — World Registry

**Purpose.** This is the master index of every Voxel Realm world: what has shipped, what is
being prototyped, what has been approved but not merged, and what has been archived. It is a
durable, documentation-only record so that world ownership, lifecycle state, and engine-change
risk survive across sessions and agents.

> **Registry status is documentation, not merge approval.** A world appearing here — at any
> lifecycle label — does **not** authorize merging it to `main`, promoting it, or shipping it.
> Only Edgar approves lifecycle transitions. See [WORLD_WORKFLOW.md](WORLD_WORKFLOW.md).

## Lifecycle labels

Full definitions live in [WORLD_WORKFLOW.md](WORLD_WORKFLOW.md). In short:

| Label | Meaning |
|-------|---------|
| `CONCEPT ONLY` | An idea. No branch, no save, no build. Lives in [IDEA_BANK.md](IDEA_BANK.md). |
| `ACTIVE PROTOTYPE` | Being built or explored. Not review-ready. |
| `WORLD IN REVIEW` | Build milestones done; awaiting Edgar's review. |
| `APPROVED WORLD` | Edgar approved it, but it is not yet merged/shipped. |
| `IMPLEMENTED WORLD` | Shipped: registered in `world-manifest.json` and bundled in `public/worlds/`. |
| `ARCHIVED / ABANDONED` | Retired, stale, or paused. Not on the active roadmap. |

## World table

| ID | Title | Classification | Branch | Worktree | Builder | Main status | Confidence | Notes |
|----|-------|----------------|--------|----------|---------|-------------|------------|-------|
| `tidewreck-cove` | Tidewreck Cove | IMPLEMENTED WORLD | main | none | Claude | shipped | high | In `world-manifest.json` + `public/worlds/tidewreck-cove.json` |
| `caverns` | Glow Caverns | IMPLEMENTED WORLD | main | none | Claude | shipped | high | In manifest + `public/worlds/caverns.json` |
| `giza` | The Pyramids of Giza | IMPLEMENTED WORLD | main | none | Claude | shipped | high | In manifest + `public/worlds/giza.json` |
| `wash-park` | Washington Park, Denver | IMPLEMENTED WORLD | main | none | Claude | shipped | high | In manifest + `public/worlds/wash-park.json`; seed must = 1337 |
| `moonspire-realm` | Moonspire Realm | IMPLEMENTED WORLD | main | none | Claude | shipped | high | In manifest + `public/worlds/moonspire-realm.json` |
| `ashen-reach` | Ashen Reach | APPROVED WORLD | `grok/ashen-reach` | `.claude/worktrees/grok+ashen-reach` | Grok | not merged | high | Approved M2; generator/source world, save meta not a full chunk bundle. Commit `5b300c9` |
| `grand-keep` | The Grand Keep | WORLD IN REVIEW | `grok/grand-keep` | `.claude/worktrees/grok+grand-keep` | Grok | not merged | high | **AWAITING EDGAR REVIEW — MILESTONE 1.** Generator/source world. Do not merge/ship. |
| `frostvale-valley` | Frostvale Valley | WORLD IN REVIEW | `origin/claude/frostvale-valley-world-qznjnv` | UNKNOWN | Claude | not merged | medium | Phases 0–6 done, Phase 7 (curation/ship) not done; branch stale vs main. Commit `9b8d493` |
| `stonehaven` | Stonehaven | ACTIVE PROTOTYPE | `experiment/project-stonehaven` | `.claude/worktrees/experiment+project-stonehaven` | Codex | not merged (dirty worktree) | medium | M2 review, not compositionally ready. Commit `c0293b9` + dirty. Source name `stonehaven-world` |
| `harbor` | Harbor (preset) | ACTIVE PROTOTYPE | main (preset) | none | UNKNOWN | preset-in-main | medium | Generator preset only; not a shipped portfolio world; distinct from Tidewreck Cove |
| `codex-realm` | Codex Realm | ACTIVE PROTOTYPE | UNKNOWN | UNKNOWN | Codex | local-save-only | medium | Local save only: `.saves/codex-realm.json` |
| `hogwarts` | Hogwarts | ARCHIVED / ABANDONED | `feat/hogwarts-castle`, `world/hogwarts-save` | `.claude/worktrees/hogwarts-castle` | Claude | not merged | medium | IDs `hogwarts` + `hogwartsV2`; stale prototype; possible IP/portfolio risk: UNKNOWN |
| `colosseum` | Colosseum | ARCHIVED / ABANDONED | UNKNOWN | UNKNOWN | Claude | local-save-only (meta-only) | medium | Current `.saves/colosseum.json` is metadata-only; backup appears to hold full chunk data |
| `local-uncurated-saves` | Local Uncurated Saves | ARCHIVED / ABANDONED | main / local | none | various | local-save-only | low | Grab-bag of `.saves/*.json` experiments not in the curated collection |

**Confidence** reflects how well the facts above are grounded in the repo, not world quality.

## Concepts

Ideas that are not yet worlds — plus landmark/alias clarifications — live in
[IDEA_BANK.md](IDEA_BANK.md).

## Engine changes

World branches often carry reusable engine changes tangled with world content. Those are tracked
separately in [ENGINE_CHANGE_QUEUE.md](ENGINE_CHANGE_QUEUE.md).

## Relationship to the Obsidian vault

Voxel Realm world knowledge lives in two places with a deliberate division of labor. Keep them
in sync; don't duplicate.

| This registry (`docs/worlds/`, in git) | The Obsidian vault (`Voxel Realm/`, Edgar's memory) |
|----------------------------------------|-----------------------------------------------------|
| **Source of truth for world *state*:** lifecycle classification, owner/builder, branch/worktree/commit, review history, engine-change risk, concepts/landmarks. | **Source of truth for restore/archive + narrative:** vault archive catalog, `world:restore` commands, screenshots/captures, demo URLs, session history, the "how worlds reach players" pipeline. |
| Read this to answer "what is the status of world X, and who owns it?" | Read the vault to answer "how do I restore/launch X, and what's its story?" |
| Structured, per-world cards. | `World Notes for Claude.md`, `World Archive.md`, `Artifacts/`, `Sessions/`. |

When a world's lifecycle/ownership changes, update **this registry**; when a world is
archived/restorable or gains captures, update the **vault**. Cards here link to the matching vault
archive under **Registry evidence / Source assets**.

## Per-world detail

Each world has a folder under `docs/worlds/<world-id>/` (archived ones under
`docs/worlds/archived/<world-id>/`) containing a `WORLD_CARD.md` and a `REVIEW_HISTORY.md`.
