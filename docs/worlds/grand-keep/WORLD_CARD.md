# World Card — The Grand Keep

- **World ID:** `grand-keep`
- **Title:** The Grand Keep
- **Classification:** IMPLEMENTED WORLD
- **One-sentence promise:** A colossal castle-city you can walk for hours — thirty storeys, a multi-level King's Solar, village bailey, and sky-bridge towers from gate to Crown.
- **Builder / owner:** Grok
- **Branch:** `grok/grand-keep`
- **Worktree:** `.claude/worktrees/grok+grand-keep`
- **Current commit:** (see HEAD on branch)
- **Main status:** Showcase package shipped on branch (manifest + `public/worlds/grand-keep.json`); merge to main is Edgar-gated if not yet merged.
- **Source assets:** Generator preset `grand-keep` + baked neighborhood package (~196 chunks, ~11 MB) + full procedural site beyond bake.
- **Registry evidence:** `world-manifest.json`, `public/worlds/grand-keep.json`, `public/worlds/previews/grand-keep.jpg`
- **Current risks:** `WORLD_HEIGHT` 512 + `SAVE_VERSION` 2 engine change ships with this world; other showcase worlds bumped to v2 meta for CI.
- **Next required approval:** Merge to `main` / production deploy if not already.
- **Last verified date:** 2026-07-09

## Load

```
?save=grand-keep
# or fresh generate:
?world=grand-keep
```

## Scale

| Measure | Value |
|---------|--------|
| Outer walls | ~200×200 |
| Keep stack | 30 storey rises + roof (~300 blocks tall) |
| King's Solar | Full-footprint multi-storey open atrium |
| Village | Inner bailey + outer town |
| Skyways | 12 towers + multi-level bridges |
