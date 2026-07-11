# Fantasy model catalog — design

## Goal

Complete the curated 12-model Quaternius catalog using only official CC0 downloads. Keep source
files in the ignored `.asset-staging/` tree and ship deterministic optimized GLB derivatives under
`public/assets/models/fantasy/`.

## Source format and preparation

Quaternius currently publishes the selected packs through official Google Drive folders linked
from each pack page. Some models are provided as `.gltf`, not `.glb`. The asset pipeline will
accept both formats and use `@gltf-transform/core` to resolve local buffers/textures from the
model's staging directory. Resolved dependencies must stay inside `.asset-staging/models/`; remote
URIs, data outside the staging tree, missing files, corrupt sources, and oversized inputs fail
loudly.

The pipeline removes animations, prunes unused nodes, welds and deduplicates geometry, and always
emits one GLB. The existing runtime material normalization remains responsible for converting PBR
materials to the unlit voxel look.

## Catalog

The completed catalog contains: dead tree, crystal, chest, barrel, crate, table, bench,
candle/lantern, books, broken column, rubble, and statue. `assets/asset-sources.json` records the
official pack/page, real original filename, retrieval date, transformations, output path, scale
and orientation defaults, and generated SHA-256.

`src/assets/PropCatalog.ts` exposes all 12 optimized URLs with tuned `defaultScale`, `yOffset`, and
`yawOffset` values. No placement files are added in this pass, so the models are available through
`__vr.propCatalog()` without automatically changing existing worlds.

## Validation

Tests cover `.gltf` conversion, `.glb` compatibility, local dependency resolution, path traversal
and remote-resource rejection, missing/corrupt resources, complete catalog parity, URL resolution,
cache behavior, and disposal. Each derivative is inspected for loadability and representative
models are visually checked for scale and orientation before completion.

## Existing worktree changes

The staged Kenney texture derivatives and provenance updates remain in place. Vite log files are
local-only and excluded from commits or deliverables.
