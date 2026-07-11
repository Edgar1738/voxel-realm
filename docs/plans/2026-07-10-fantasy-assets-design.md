# Fantasy Asset Integration — Design Note

**Branch:** `claude/fantasy-assets-pilot` · **Started from main:** `429bf55`
**Scope of this branch (lean first cut):** M0 design · M1 asset-prep pipeline · M2 optional
fantasy block-texture theme · M4 decorative-prop pipeline scaffold · docs. Deferred to
follow-ups: M3 Kenney UI art, M5 full Ashen Reach prop dressing, M6 settings-menu toggle.

This note answers the Milestone-0 questions against the **actual** codebase (verified, not the
brief's assumed paths). It is the architecture-decision record for the branch.

## Verified architecture (what we build on)

- **Textures.** `src/blocks/blocks.ts` declares blocks with *declarative face specs*
  (`TextureSpec`). `buildBlockTextures()` deduplicates every face spec by a content-derived
  `specKey()` into `uniqueSpecs[]` — one entry per unique tile. `render/TextureArray.ts`
  paints each entry into one layer of a `DataArrayTexture` via
  `paintLayer(out, layer, spec)` → `resolvePixel(spec)` (the procedural painter).
- **Single choke point.** `paintLayer` is the *only* place a layer's pixels are produced. A
  theme overrides pixels **here** — no change to meshing, dedup, or material passes.
- **Materials.** `render/ChunkMaterial.ts` builds three passes (opaque / transparent / cutout)
  that all share **one** `RawShaderMaterial` sampling **one** `DataArrayTexture` (+ a mipmapped
  sibling for opaque/transparent; the cutout pass samples the crisp non-mip base). A theme swaps
  the array's *pixels*, never the material graph.
- **Saves.** `SAVE_VERSION = 2`. `WorldMeta` (persistence/SaveTypes.ts) already carries optional,
  defensively-parsed fields. Block ids are stable/append-only (0..41).
- **Ashen Reach is procedural.** It is a `WorldPreset` (`worldgen/AshenReachGenerator.ts` +
  `curatedPresetMeta()`), shipped as `public/worlds/ashen-reach.json`. Props for it attach to the
  **preset/slug**, not to a `.saves` snapshot.
- **Base path.** Static assets resolve through `import.meta.env.BASE_URL + 'worlds/...'`. Assets
  reuse the same pattern, so GitHub Pages' `/voxel-realm/` base resolves them with no new logic.
- **No glTF loader today.** Three 0.185 ships `GLTFLoader` in `three/addons`; we use that. No new
  runtime dependency.

## Decisions

### Q: How does a theme override selected texture layers? How does procedural fallback work?
Add an optional **stable semantic key** to `TextureSpec` (`key?: string`, e.g. `'stone'`,
`'planks'`, `'log_bark'`). The key is authored on the spec and is **independent of layer index
and of the RGB colors** (so it survives palette tweaks). A `TextureTheme` is a
`Map<semanticKey, PreparedTextureTile>`. In `paintLayer`, for the active theme: if the spec has a
key **and** the theme has a tile for it, blit that tile (RGBA, alpha preserved); otherwise call
the existing procedural painter. Specs without a key, or keys absent from the theme, always fall
back procedurally. `classic` is the empty theme → 100% procedural, byte-identical to today.

Adding `key` does **not** change `specKey()`/dedup identity (dedup still keys on pattern+colors),
so layer count and layer order are unchanged and no block ids move.

### Q: Build-time or runtime tile processing?
**Build-time.** `scripts/buildTextureTheme.ts` reads staged official PNGs, crops/resizes each to a
coherent 16×16 RGBA tile with **nearest-neighbor** (pixel-art), and emits deterministic prepared
tiles + checksums. The runtime only *decodes* prepared tiles and blits them — no image processing
in the game. Dev-only deps, never shipped to the browser.

### Q: How does theme selection happen before materials are created?
Deterministic precedence, resolved **once at boot before the texture array is built**:
1. explicit URL override `?theme=fantasy|classic`
2. player override (localStorage) — reserved; the settings toggle is deferred to M6
3. saved-world meta `textureTheme`
4. shipped-manifest entry `textureTheme`
5. `classic`

Invalid values fall back to `classic`. The theme is chosen *before* `createTextureArray()` so the
first (and only) GPU texture is the correct one — no create-then-replace, no leaked upload.

### Q: How are static props represented? Where does placement data live?
**Separate authored data, keyed by world slug** — not `WorldMeta`. Prop instance arrays can be
large and would bloat frequently-loaded metadata and every save; they are authored, not
player-edited. Shipped as `public/worlds/props/<slug>.json` (fetched lazily, after terrain boot).
`WorldMeta`/manifest gain no required field. Saved voxel edits stay fully independent, so no save
format change. Export/import is unaffected in this cut (props are authored, not per-save).

### Q: How are models cached and disposed? How do materials match the voxel look?
One `GLTFLoader`; each unique asset URL is loaded **once** and cached (Promise cache). Repeated
single-mesh props use `InstancedMesh`; multi-mesh glTFs use cached shared-geometry clones. On
teardown the loader cache disposes owned geometries/textures/materials. Loading is **off the
terrain-boot critical path** — the world is playable first, props stream in after.
**Material normalization:** imported PBR materials are replaced with an unlit `MeshBasicMaterial`
carrying the base-color map (NearestFilter mag, mipmapped min, sRGB), no env map, no dynamic
shadows, no per-model lights — so props read as part of the stylized world. Global lighting is
**not** changed to accommodate models.

### Q: Asset-size budget, GitHub Pages, safe degradation.
Budgets (initial): ≤12 unique models, ≤15 imported 16×16 tiles, ≤10 MB added prod payload,
≤15 MB added repo (excl. doc screenshots). Prepared assets live under `public/assets/**` and
resolve via `import.meta.env.BASE_URL`. Missing tile → procedural fallback (world looks classic
for that block). Missing/corrupt model → one concise warning, world keeps booting. Nothing is
fatal.

## Proposed pilot assets (subject to what actually looks good once staged)
Textures (Kenney Retro Textures Fantasy, ~10–15): stone, cobblestone, brick/masonry, deepslate,
planks, log bark, log rings, bookshelf, terracotta, gravel, furnace, sand, basalt, ash.
Poly Haven basalt/ash considered **only** if a heavily-downscaled derivative beats the procedural
tile; otherwise deferred.
Models (≤12): Quaternius Cube World Kit (dead tree, crystal); Fantasy Props MegaKit (chest,
barrel, crate, table, bench, candle/lantern, books); Ultimate Modular Ruins (broken column,
rubble, statue). Placement onto Ashen Reach is **M5 (deferred)**.

## Out of scope (deferred follow-ups)
Animated characters, prop collision/interaction/placement tools, destructible props, prop
inventory, full asset browser, PBR/normal maps/dynamic shadows, runtime downloads, retexturing
every shipped world.
