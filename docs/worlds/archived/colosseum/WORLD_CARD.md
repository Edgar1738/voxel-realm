# World Card — Colosseum

- **World ID:** `colosseum`
- **Title:** Colosseum
- **Classification:** ARCHIVED / ABANDONED
- **One-sentence promise:** The Roman Colosseum (OSM georeference + procedural arcades/cavea/arena/ruin) with the Arch of Constantine.
- **Builder / owner:** Claude
- **Branch:** UNKNOWN
- **Worktree:** UNKNOWN
- **Current commit:** UNKNOWN
- **Main status:** **Local save only.** Not merged, not shipped.
- **Source assets:** Local save `.saves/colosseum.json` (**metadata-only** in its current state). Full chunk data is preserved as a **restorable vault archive**: `Voxel Realm/Artifacts/2026-07-05-roman-colosseum/` (has `world.json` + `manifest.json`).
- **Registry evidence:** Save `.saves/colosseum.json` (present, meta-only); vault archive `Artifacts/2026-07-05-roman-colosseum/` catalogued in `Voxel Realm/World Archive.md` as restorable. Excluded from curated v1 (scope/IP).
- **Current risks:** The local `.saves` copy is **metadata-only**; the full build lives in the vault archive. Reviving = restore from the vault archive, not a mystery backup. Keep archived until Edgar revives it.
- **Next required approval:** Edgar to decide whether to revive from the vault archive.
- **Last verified date:** 2026-07-08

## Restore (from vault archive)

```
npm run world:restore -- --archive 2026-07-05-roman-colosseum --save colosseum-restored
```

See `Voxel Realm/World Archive.md` for the authoritative restore catalog.

## Unknowns

- Branch, worktree, and commit of the original build (if any).
- Whether the vault-archive restore has been re-validated recently.
