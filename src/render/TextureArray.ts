import {
  DataArrayTexture,
  RGBAFormat,
  UnsignedByteType,
  NearestFilter,
  RepeatWrapping,
} from 'three';
import { TEXTURE_LAYER_COUNT, TextureLayer } from '../blocks/blocks';
import { mulberry32 } from '../core/math';

const TILE = 16; // px per tile

function clamp(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}

/** Fills one TILE×TILE RGBA layer in `out` at `layerIndex`, with a flat base + speckle. */
function paintLayer(
  out: Uint8Array,
  layerIndex: number,
  base: [number, number, number],
  speckle: number,
): void {
  const rng = mulberry32(0xc0ffee + layerIndex);
  const offset = layerIndex * TILE * TILE * 4;
  for (let i = 0; i < TILE * TILE; i++) {
    const d = Math.floor((rng() - 0.5) * 2 * speckle);
    const p = offset + i * 4;
    out[p] = clamp(base[0] + d);
    out[p + 1] = clamp(base[1] + d);
    out[p + 2] = clamp(base[2] + d);
    out[p + 3] = 255;
  }
}

/** Builds the procedural block-face texture array (one layer per TextureLayer). */
export function createTextureArray(): DataArrayTexture {
  const data = new Uint8Array(TILE * TILE * 4 * TEXTURE_LAYER_COUNT);
  paintLayer(data, TextureLayer.GrassTop, [86, 152, 60], 18);
  paintLayer(data, TextureLayer.GrassSide, [120, 110, 70], 18);
  paintLayer(data, TextureLayer.Dirt, [134, 96, 62], 20);
  paintLayer(data, TextureLayer.Stone, [128, 128, 132], 22);

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
