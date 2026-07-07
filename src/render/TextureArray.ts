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
  // Crisp texels up close (Nearest mag), but trilinear-filtered minification with mipmaps so
  // distant/grazing surfaces stop shimmering. Each 16px tile is its own array layer, so mip
  // downsampling averages only within a tile — no cross-tile atlas bleed. 16 is power-of-two,
  // so WebGL2 can generate the array-texture mip chain.
  tex.magFilter = NearestFilter;
  tex.minFilter = LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.wrapS = RepeatWrapping;
  tex.wrapT = RepeatWrapping;
  tex.needsUpdate = true;
  return tex;
}
