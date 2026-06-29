import { describe, it, expect } from 'vitest';
import { createTextureArray } from '../src/render/TextureArray';
import { TEXTURE_LAYER_COUNT } from '../src/blocks/blocks';
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
});
