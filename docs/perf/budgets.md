# Performance budgets

These are regression gates, not aspirational targets. Tighten them after a measured optimization;
do not raise them merely to make CI green.

## CI-enforced artifact budgets

`npm run build` runs `scripts/checkBundleBudget.ts` after Vite and fails when an artifact exceeds:

| Artifact | Raw | Gzip |
| --- | ---: | ---: |
| Application JavaScript | 1100 KiB | 320 KiB |
| Generation worker | 180 KiB | 55 KiB |
| Mesh worker | 40 KiB | 15 KiB |

The limits leave roughly 8–15% headroom over the August 2026 build. Optional dev tooling is
already excluded from production; future large optional play/build systems should use dynamic
imports rather than consuming this headroom.

## Runtime budgets

Compare these only on the same machine/browser/profile, following `baseline-2026-07.md`:

- Default procedural world: first frame ≤ 250 ms; initial stream ≤ 14 s.
- Grand Keep production binary: first frame ≤ 500 ms; initial stream ≤ 5.5 s.
- Frostvale production binary: first frame ≤ 300 ms; initial stream ≤ 4.5 s.
- No individual startup long task above 200 ms after the first frame.

Runtime measurements remain a release benchmark rather than a CI failure because GPU, browser,
thermal, and runner contention make wall-clock thresholds unreliable on shared GitHub runners.
Record the machine and browser with every update to the baseline.
