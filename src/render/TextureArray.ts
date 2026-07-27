import {
  DataArrayTexture,
  DataTexture,
  RGBAFormat,
  UnsignedByteType,
  NearestFilter,
  LinearMipmapLinearFilter,
  RepeatWrapping,
} from 'three';
import { BLOCK_TEXTURES, TEXTURE_LAYER_COUNT } from '../blocks/blocks';
import { TILE, paintLayer, type DriftClass, type TextureSpec } from '../blocks/textures';

/** Builds the procedural block-face texture array (one layer per derived texture spec). */
export function createTextureArray(): DataArrayTexture {
  const data = new Uint8Array(TILE * TILE * 4 * TEXTURE_LAYER_COUNT);
  BLOCK_TEXTURES.uniqueSpecs.forEach((spec, layer) =>
    paintLayer(data, layer, spec, BLOCK_TEXTURES.layerVariant[layer]),
  );

  const tex = new DataArrayTexture(data, TILE, TILE, TEXTURE_LAYER_COUNT);
  tex.format = RGBAFormat;
  tex.type = UnsignedByteType;
  // Crisp, un-mipmapped base. The cutout (alpha-tested) plant pass samples THIS so mip-averaging
  // of thin binary-alpha blades can't drop their alpha below alphaTest=0.5 and erode foliage at
  // distance. The opaque/transparent passes use the mipmapped sibling below instead.
  tex.magFilter = NearestFilter;
  tex.minFilter = NearestFilter;
  tex.wrapS = RepeatWrapping;
  tex.wrapT = RepeatWrapping;
  tex.needsUpdate = true;
  return tex;
}

/**
 * A mipmapped sibling of {@link createTextureArray} for the OPAQUE and TRANSPARENT passes:
 * trilinear minification kills distant shimmer on solid block faces while `magFilter` stays
 * Nearest for crisp close-ups. Deliberately NOT used by the cutout pass (see above). `clone()`
 * shares the source pixel data (same `image` reference), so this is a second small GPU upload,
 * not a second paint. 16px tiles are power-of-two and each is its own array layer, so WebGL2
 * builds a per-layer mip chain with no cross-tile bleed.
 */
export function mipmappedArray(base: DataArrayTexture): DataArrayTexture {
  const tex = base.clone();
  tex.minFilter = LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}

/** Drift-class ids as the shader reads them from the meta LUT's green channel. */
const DRIFT_ID: Record<DriftClass, number> = { grass: 1, foliage: 2, soil: 3, stone: 4 };

/** Fluid-effect ids as the shader reads them from LUT row 1's red channel. */
const FX_ID: Record<NonNullable<Extract<TextureSpec, { pattern: unknown }>['fx']>, number> = {
  water: 1,
  lava: 2,
};

/**
 * Per-layer material metadata for the chunk shader, as a 256×2 RGBA8 LUT indexed by
 * texture-array layer (texelFetch — never filtered). Row 0:
 *   R = variant count of the layer's group (1 = no variants)
 *   G = drift class (0 none, 1 grass, 2 foliage, 3 soil, 4 stone)
 *   B = bit 0: per-voxel rotation allowed; bits 1-7: gloss strength (0..127)
 *   A = emissive strength (0..255 -> 0..1 self-illumination)
 * Row 1:
 *   R = fluid FX id (0 none, 1 water, 2 lava)
 *   G = 1 when sunlit tops glitter (snow/ice sparkle)
 *   B = 1 when emissive flickers like flame (lanterns); A reserved
 * Only GROUP BASE layers are ever addressed by vertex data, but every member layer
 * carries its group's values (they share the spec), so the table has no holes.
 */
export function createTextureMetaLUT(): DataTexture {
  const data = new Uint8Array(256 * 2 * 4);
  BLOCK_TEXTURES.uniqueSpecs.forEach((spec, layer) => {
    if (!('pattern' in spec)) return;
    const p = layer * 4;
    data[p] = Math.max(1, spec.variants ?? 1);
    data[p + 1] = spec.drift ? DRIFT_ID[spec.drift] : 0;
    const gloss7 = Math.round(Math.min(1, Math.max(0, spec.gloss ?? 0)) * 127);
    data[p + 2] = (spec.rotate ? 1 : 0) | (gloss7 << 1);
    data[p + 3] = Math.round(Math.min(1, Math.max(0, spec.emissive ?? 0)) * 255);
    data[256 * 4 + p] = spec.fx ? FX_ID[spec.fx] : 0;
    data[256 * 4 + p + 1] = spec.sparkle ? 1 : 0;
    data[256 * 4 + p + 2] = spec.flicker ? 1 : 0;
  });
  const tex = new DataTexture(data, 256, 2, RGBAFormat, UnsignedByteType);
  tex.magFilter = NearestFilter;
  tex.minFilter = NearestFilter;
  tex.needsUpdate = true;
  return tex;
}
