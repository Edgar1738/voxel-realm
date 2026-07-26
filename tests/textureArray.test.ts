import { describe, it, expect } from 'vitest';
import { NearestFilter, LinearMipmapLinearFilter } from 'three';
import {
  createTextureArray,
  mipmappedArray,
  createTextureMetaLUT,
} from '../src/render/TextureArray';
import {
  TEXTURE_LAYER_COUNT,
  BLOCK_TEXTURES,
  WATER,
  LAVA,
  GLASS,
  Face,
} from '../src/blocks/blocks';
import { BlockRegistry } from '../src/blocks/BlockRegistry';
import { TILE } from '../src/blocks/textures';

describe('createTextureArray', () => {
  it('allocates one TILE*TILE RGBA layer per derived texture layer', () => {
    const tex = createTextureArray();
    const data = tex.image.data as Uint8Array;
    expect(data.length).toBe(TILE * TILE * 4 * TEXTURE_LAYER_COUNT);
    expect(tex.image.depth).toBe(TEXTURE_LAYER_COUNT);
    // most layers are fully opaque; plant/cross layers have transparent pixels — at least one
    // alpha byte must be 255 across the whole array (sanity: array is not zeroed out)
    let hasOpaque = false;
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] === 255) {
        hasOpaque = true;
        break;
      }
    }
    expect(hasOpaque).toBe(true);
  });

  it('base array is crisp (nearest, no mipmaps) so the cutout plant pass never mip-erodes', () => {
    const tex = createTextureArray();
    expect(tex.magFilter).toBe(NearestFilter);
    expect(tex.minFilter).toBe(NearestFilter);
    expect(tex.generateMipmaps).toBe(false);
  });

  it('mipmappedArray sibling is trilinear + mipmapped, keeps nearest mag, and shares the pixels', () => {
    const base = createTextureArray();
    const mip = mipmappedArray(base);
    expect(mip).not.toBe(base);
    expect(mip.minFilter).toBe(LinearMipmapLinearFilter);
    expect(mip.generateMipmaps).toBe(true);
    expect(mip.magFilter).toBe(NearestFilter); // crisp up close on both
    // clone() shares the source image, so the mipmapped sibling is a second GPU upload, not a re-paint
    expect(mip.image.data).toBe(base.image.data);
  });
});

describe('createTextureMetaLUT — fluid FX row', () => {
  const reg = new BlockRegistry();
  const lut = createTextureMetaLUT();
  const data = lut.image.data as Uint8Array;
  const fxOf = (id: number): number => {
    const layer = reg.faceLayer(id, Face.PosY);
    return data[256 * 4 + layer * 4]; // row 1, red channel
  };

  it('is a 256x2 table with water=1 and lava=2 in row 1', () => {
    expect(lut.image.width).toBe(256);
    expect(lut.image.height).toBe(2);
    expect(fxOf(WATER)).toBe(1);
    expect(fxOf(LAVA)).toBe(2);
  });

  it('leaves glass (same transparent pass) with no fluid FX', () => {
    expect(fxOf(GLASS)).toBe(0);
  });

  it('marks no other layer as a fluid', () => {
    let fluids = 0;
    for (let layer = 0; layer < BLOCK_TEXTURES.layerCount; layer++) {
      if (data[256 * 4 + layer * 4] !== 0) fluids++;
    }
    expect(fluids).toBe(2); // exactly the water layer and the lava layer
  });
});
