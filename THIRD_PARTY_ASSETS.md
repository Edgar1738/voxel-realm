# Third-Party Assets

Voxel Realm's blocks and worlds are original and procedural. The **optional** fantasy texture
theme and the decorative-prop system additionally use a small, curated set of **CC0-1.0**
(public-domain) assets from the creators below. All assets are used under CC0; attribution is not
legally required, but we credit the creators and record full provenance regardless. **Voxel Realm
does not claim authorship of any third-party asset.**

The classic procedural textures remain the default and are unaffected; the fantasy theme is
opt-in (`?theme=fantasy` or a world's `textureTheme` preference).

## Creators & source packs

| Pack                           | Creator    | License | Official page                                         |
| ------------------------------ | ---------- | ------- | ----------------------------------------------------- |
| Retro Textures Fantasy         | Kenney     | CC0-1.0 | https://kenney.nl/assets/retro-textures-fantasy       |
| Voxel Pack (UI, deferred)      | Kenney     | CC0-1.0 | https://kenney.nl/assets/voxel-pack                   |
| Cube World Kit                 | Quaternius | CC0-1.0 | https://quaternius.com/packs/cubeworldkit.html        |
| Fantasy Props MegaKit          | Quaternius | CC0-1.0 | https://quaternius.com/packs/fantasypropsmegakit.html |
| Ultimate Modular Ruins Pack    | Quaternius | CC0-1.0 | https://quaternius.com/                               |
| Poly Haven textures (deferred) | Poly Haven | CC0-1.0 | https://polyhaven.com/license                         |

Kenney asset-use info: https://kenney.nl/support · Quaternius FAQ: https://quaternius.com/faq.html

## What ships in the repo

The initial scaffold ships the pipeline, empty texture atlas, and empty prop catalog. Prepared
tiles and optimized models are added only after Edgar stages and reviews the official pack files.

- **Prepared block tiles** — `public/assets/textures/fantasy/*.png`, each center-cropped and
  downscaled to a 16×16 nearest-neighbor pixel-art tile from a Kenney source texture.
- **Optimized props** — `public/assets/models/fantasy/*.glb`, pruned of unused nodes/animations,
  welded and deduplicated. Base-color maps are kept; materials are normalized to an unlit look at
  runtime to match the voxel aesthetic.
- **License notices** — `public/assets/licenses/` (shipped) and `assets/source-notices/`
  (repo provenance).

Source archives (`.zip`), `.blend` projects, FBX/OBJ duplicates, engine projects, promo renders,
and unused files are **never** committed. They stage in the git-ignored `.asset-staging/` tree.

## Provenance & reproducibility

`assets/asset-sources.json` is the machine-readable catalog: one record per committed derivative
with package, creator, source page, license, retrieval date, original filename, output filename,
every transformation, and the output SHA-256. `scripts/buildAssets.ts` regenerates every
derivative deterministically from the staged official downloads. See `assets/README.md` for the
exact download-and-stage instructions.

## Full CC0 text

`public/assets/licenses/CC0-1.0.txt` (Creative Commons CC0 1.0 Universal). Each pack's own license
notice is copied under `assets/source-notices/` when its assets are staged and committed.
