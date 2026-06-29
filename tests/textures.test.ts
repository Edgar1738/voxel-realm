import { describe, it, expect } from 'vitest';
import {
  TILE,
  expandFaces,
  specKey,
  resolvePixel,
  paintLayer,
  type TextureSpec,
} from '../src/blocks/textures';

const dirt: TextureSpec = { pattern: 'speckle', colors: [[134, 96, 62]], amp: 20 };
const grassTop: TextureSpec = { pattern: 'grassTop', colors: [[86, 152, 60]] };

describe('expandFaces', () => {
  it('expands a single spec to 6 identical faces', () => {
    const f = expandFaces(dirt);
    expect(f).toHaveLength(6);
    expect(f.every((s) => s === dirt)).toBe(true);
  });
  it('expands {top,side,bottom} to the right face order', () => {
    const side: TextureSpec = { pattern: 'bark', colors: [[105, 78, 46]] };
    const bottom: TextureSpec = dirt;
    // Face order: PosX, NegX, PosY(top), NegY(bottom), PosZ, NegZ
    const f = expandFaces({ top: grassTop, side, bottom });
    expect(f[2]).toBe(grassTop);
    expect(f[3]).toBe(bottom);
    expect(f[0]).toBe(side);
    expect(f[4]).toBe(side);
  });
});

describe('specKey', () => {
  it('is equal for structurally equal pattern specs and differs by color', () => {
    expect(specKey(dirt)).toBe(specKey({ pattern: 'speckle', colors: [[134, 96, 62]], amp: 20 }));
    expect(specKey(dirt)).not.toBe(
      specKey({ pattern: 'speckle', colors: [[100, 96, 62]], amp: 20 }),
    );
  });
  it('gives every custom spec a unique key', () => {
    const c1: TextureSpec = { custom: () => [0, 0, 0] };
    const c2: TextureSpec = { custom: () => [0, 0, 0] };
    expect(specKey(c1)).not.toBe(specKey(c2));
  });
});

describe('paintLayer', () => {
  it('fills a TILE*TILE*4 RGBA block with opaque pixels', () => {
    const out = new Uint8Array(TILE * TILE * 4 * 2);
    paintLayer(out, 1, grassTop);
    const base = 1 * TILE * TILE * 4;
    // alpha is 255 everywhere in the painted layer
    for (let i = 0; i < TILE * TILE; i++) expect(out[base + i * 4 + 3]).toBe(255);
    // green channel dominates for grass top somewhere
    let greenish = false;
    for (let i = 0; i < TILE * TILE; i++) {
      const g = out[base + i * 4 + 1];
      const r = out[base + i * 4];
      if (g > r) greenish = true;
    }
    expect(greenish).toBe(true);
    // layer 0 untouched
    expect(out[0]).toBe(0);
  });
  it('resolvePixel returns the custom fn directly', () => {
    const px = resolvePixel({ custom: () => [1, 2, 3] });
    expect(px(0, 0, () => 0.5)).toEqual([1, 2, 3]);
  });
});
