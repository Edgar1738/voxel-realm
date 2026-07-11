# Boot-time baseline — 2026-07-10

First recorded baseline from the boot telemetry added on `feat/boot-telemetry`
(`src/app/bootStats.ts`; read live via `window.__vrBootStats()`).

## Method

- Machine: ROG (Windows 11), headless Chromium via Playwright (SwiftShader — GPU-free, so
  absolute frame-rate numbers are pessimistic; use these as *relative* references).
- Dev server (`vite`) in the worktree; dev uses `ServerSaveStore` (disk-backed `.saves/`).
- Each world booted fresh; run ends when the cold-start streaming burst drains
  (`streamed` event, i.e. the initial view-distance ring is generated + meshed).
- Runner: one-shot Playwright script (`bootBench.mjs`, see PR description) hitting
  `?save=<name>&world=<preset>`.

## Results (ms)

| Phase / event | default (procedural) | grand-keep (12 MB save + preset) | giza (7.5 MB, flat) | moonspire (1.4 MB, flat) |
| --- | ---: | ---: | ---: | ---: |
| renderer+materials | 52 | 64 | 53 | 54 |
| load-meta | 30 | 499 | 458 | 92 |
| load-deltas | 16 | 515 | 132 | 39 |
| chunk-manager | 0.9 | 1.0 | 0.9 | 0.7 |
| systems+ui | 70 | 111 | 69 | 82 |
| **first-frame** | **182** | **1193** | **721** | **271** |
| spawn-settled | 241 | — (curated spawn) | — | — |
| **streamed** (burst drained) | **13621** | **25702** | **5132** | **4037** |

## Reading the numbers

- **Save loading dominates time-to-first-frame on big worlds**: grand-keep spends
  ~1014 ms of its 1193 ms pre-first-frame inside `load-meta` + `load-deltas` — the cost
  that grows linearly with authored content. Small worlds boot their first frame in ~200 ms.
- **Dev double-fetches the world JSON**: `ServerSaveStore.loadMeta` and `.loadDeltas` each
  fetch + parse the full snapshot (~500 ms each for grand-keep). Production's
  `ShippedWorldStore` memoizes the fetch, so only one of these costs applies there —
  but prod adds network transfer. Fix candidate for the streaming-format phase.
- **`chunk-manager` is now ~1 ms** — this branch removed the constructor deep copy of the
  delta maps (`ChunkManager` adopts what `SaveStore.loadDeltas` returns) and the
  `ShippedWorldStore` base deep copy.
- **`streamed` is generation/meshing-bound**, not save-bound: grand-keep's 25.7 s burst is
  the authored preset stamping + lighting + meshing the initial ring on the main thread
  (headless CPU rendering inflates this; treat as a ceiling). This is the target for the
  worker-generation phase, not for format work.
- Production shipped-world splits (`vr:shipped-fetch+json` / `vr:shipped-validate` /
  `vr:shipped-to-deltas` measures) only appear on a production-store boot; dev runs won't
  show them.

## Repeating

1. `npm run dev` (or the worktree's port), then boot any world and read
   `window.__vrBootStats()` in the console — dev also logs `[vr] boot …` once the burst drains.
2. Compare like-for-like: same machine, same headless/headed mode, cold Vite cache noise
   excluded (run each world once as warm-up if the dev server just started).
