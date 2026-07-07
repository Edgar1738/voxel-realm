import {
  DataArrayTexture,
  RGBAFormat,
  UnsignedByteType,
  NearestFilter,
  LinearMipmapLinearFilter,
  RepeatWrapping,
} from 'three';
import { BLOCK_TEXTURES, TEXTURE_LAYER_COUNT } from '../blocks/blocks';
import { TILE, paintLayer } from '../blocks/textures';

/** Builds the procedural block-face texture array (one layer per derived texture spec). */
export function createTextureArray(): DataArrayTexture {
  const data = new Uint8Array(TILE * TILE * 4 * TEXTURE_LAYER_COUNT);
  BLOCK_TEXTURES.uniqueSpecs.forEach((spec, layer) => paintLayer(data, layer, spec));

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
