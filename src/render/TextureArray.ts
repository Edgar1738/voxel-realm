import {
  DataArrayTexture,
  RGBAFormat,
  UnsignedByteType,
  NearestFilter,
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
  tex.magFilter = NearestFilter;
  tex.minFilter = NearestFilter;
  tex.wrapS = RepeatWrapping;
  tex.wrapT = RepeatWrapping;
  tex.needsUpdate = true;
  return tex;
}
