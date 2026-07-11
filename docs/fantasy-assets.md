# Fantasy assets

Voxel Realm supports an optional fantasy visual layer while keeping the classic procedural block
textures as the default. The integration is additive: block IDs, voxel saves, collision, terrain,
and the material graph do not change.

## Selecting a texture theme

Use `?theme=fantasy` or `?theme=classic`. The theme is resolved once, before the block texture
array is created, in this order:

1. URL `theme` parameter
2. player preference in `localStorage` (`vr.textureTheme`; the settings UI is deferred)
3. saved-world `meta.textureTheme`
4. shipped-manifest `textureTheme`
5. `classic`

An invalid supplied value resolves to `classic`. The fantasy theme reads
`public/assets/textures/fantasy/theme.tiles.json`; every missing or malformed semantic tile falls
back to its original procedural painter. This makes a partial or entirely empty asset staging tree
safe.

## Preparing official CC0 assets

Follow [the staging checklist](../assets/README.md) and place only the selected official source
files under the git-ignored `.asset-staging/` directory. Then run:

```bash
npm run assets:build
npm test
npm run lint
npm run build
```

The asset build is offline after staging. It skips absent catalog entries and prints the complete
skip list. Existing staged PNGs are center-cropped, resized to 16x16 with nearest-neighbor
sampling, and emitted as deterministic RGBA PNGs plus the JSON tile atlas. Existing GLBs are
pruned, stripped of animations, welded, deduplicated, and emitted under
`public/assets/models/fantasy/`. Output SHA-256 values are written back to
`assets/asset-sources.json` only when derivatives are processed.

Corrupt or oversized files fail the build. Catalog paths are restricted to `.asset-staging/` for
inputs and `public/assets/` for outputs. The catalog warns above 15 textures, 12 models, 10 MB of
production assets, or 15 MB of repository assets.

## Decorative world props

Decorative props are static, non-collidable, non-interactive scenery. Placement data is separate
from voxel saves and world metadata:

```text
public/worlds/props/<world-slug>.json
```

The file may be an array or `{ "props": [...] }`. Each instance uses this shape:

```json
{
  "id": "gate-crate-1",
  "asset": "crate",
  "x": 12,
  "y": 64,
  "z": -8,
  "yaw": 1.57,
  "pitch": 0,
  "roll": 0,
  "scale": 1
}
```

Only `id`, `asset`, `x`, `y`, and `z` are required. Invalid entries, unknown assets, and duplicate
instance IDs are skipped without stopping world boot. Model URLs are cached as Promises, repeated
single-mesh props are instanced, imported materials are normalized to unlit base-color materials,
and owned GPU resources are disposed on teardown. `GLTFLoader` is loaded lazily after terrain boot.

This first cut intentionally ships an empty `PROP_CATALOG` and no placement files. Therefore prop
loading is currently a fetch-free no-op. In a development build, `__vr.props()` and
`__vr.propCatalog()` inspect the active instance data and catalog.

## Provenance

`assets/asset-sources.json` is the source of truth for creator, official source page, license,
staged filename, transformations, outputs, and checksums. See [THIRD_PARTY_ASSETS.md](../THIRD_PARTY_ASSETS.md)
for the licensing overview. Source archives, engine projects, duplicate interchange formats, and
promo renders must never be committed.
