# Curated CC0 asset pipeline

This directory holds the **provenance catalog** and **staging instructions** for the small,
curated set of CC0 assets used by the optional fantasy theme and decorative props. It does **not**
hold the source archives — those are downloaded manually from official pages into the git-ignored
`.asset-staging/` tree and never committed. Only the optimized derivatives under
`public/assets/**` (plus license text under `public/assets/licenses/`) ship.

- `asset-sources.json` — machine-readable catalog (source of truth). One record per committed
  derivative, with package, creator, official source page, license, transformations, and (after a
  build) the output SHA-256.
- `source-notices/` — a copy of each pack's `License.txt` / license notice, committed for
  provenance even though CC0 requires no attribution.

## Why manual download

Kenney, Quaternius, and Poly Haven serve official downloads through their own sites (some behind a
"download" button / donation flow). They must be fetched **manually from the official pages** —
no third-party mirrors. Once staged, the build pipeline is fully offline and reproducible.

## What to download (exact list)

All six are CC0. Download each from its **official** page, unzip, and copy the specific files
below into `.asset-staging/`. Rename to the exact `stagedFile` names from `asset-sources.json` so
the pipeline finds them (the packs' internal filenames vary; renaming decouples us from them).

### 1. Kenney — Retro Textures Fantasy → `.asset-staging/textures/`

Page: https://kenney.nl/assets/retro-textures-fantasy
Pick the tile that best matches each surface and copy it renamed:

| Copy the tile for…              | → staged file                               |
| ------------------------------- | ------------------------------------------- |
| plain stone / rock              | `.asset-staging/textures/stone.png`         |
| cobblestone                     | `.asset-staging/textures/cobblestone.png`   |
| brick / masonry                 | `.asset-staging/textures/brick.png`         |
| dark fortress stone / deepslate | `.asset-staging/textures/deepslate.png`     |
| wooden planks                   | `.asset-staging/textures/planks.png`        |
| log bark (side)                 | `.asset-staging/textures/log_bark.png`      |
| log rings (end)                 | `.asset-staging/textures/log_rings.png`     |
| bookshelf                       | `.asset-staging/textures/bookshelf.png`     |
| terracotta / clay               | `.asset-staging/textures/terracotta.png`    |
| gravel                          | `.asset-staging/textures/gravel.png`        |
| furnace / forge front           | `.asset-staging/textures/furnace_front.png` |
| sand                            | `.asset-staging/textures/sand.png`          |
| dirt / soil                     | `.asset-staging/textures/dirt.png`          |

You do **not** need all 13 — any subset works; missing ones fall back to the procedural texture.
Prefer square source tiles; the pipeline center-crops and downscales to 16×16 with nearest.

### 2. Quaternius — Cube World Kit → `.asset-staging/models/` (`.glb`)

Page: https://quaternius.com/packs/cubeworldkit.html

- a dead / stylized tree → `.asset-staging/models/dead_tree.glb`
- a crystal → `.asset-staging/models/crystal.glb`

### 3. Quaternius — Fantasy Props MegaKit → `.asset-staging/models/` (`.glb`)

Page: https://quaternius.com/packs/fantasypropsmegakit.html

- chest → `chest.glb` · barrel → `barrel.glb` · crate → `crate.glb` · table → `table.glb`
- bench → `bench.glb` · candle/lantern → `candle.glb` · books → `books.glb`

### 4. Quaternius — Ultimate Modular Ruins Pack → `.asset-staging/models/` (`.glb`)

Catalog: https://quaternius.com/ (Ultimate Modular Ruins Pack)

- broken column → `broken_column.glb` · rubble pile → `rubble.glb` · statue → `statue.glb`

Prefer `.glb`. If a pack only ships `.gltf`/`.fbx`/`.obj`, stage the `.glb` if present; otherwise
tell me and I'll add a convert step. Do **not** stage `.blend`, engine projects, or promo renders.

### 5. Kenney — Voxel Pack (UI art) — **deferred (M3)**

Page: https://kenney.nl/assets/voxel-pack — not needed for this branch.

### 6. Poly Haven (basalt/ash source) — **deferred**

License: https://polyhaven.com/license — only used later if a heavily-downscaled derivative beats
the procedural tile. Do not scrape; manual download only.

## After staging

```bash
npm run assets:build      # validates staged files, writes public/assets/**, updates checksums
npm test                  # confirm runtime and pipeline fallbacks
npm run lint
npm run build
```

The build **fails loudly** on a missing/oversized/corrupt staged file, and **skips** catalog
entries you chose not to stage (printing which were skipped). Re-running is deterministic: same
inputs → byte-identical outputs.

## License / provenance rules

Every committed derivative has a record in `asset-sources.json`. Before committing new assets:
reverify the license on the official page, copy the pack's license notice into `source-notices/`,
record the original filename + every transformation, and let the pipeline write the output
SHA-256. CC0 requires no attribution, but we keep clear credit and provenance regardless. Voxel
Realm does not claim authorship of any third-party asset.
