import { describe, it, expect } from 'vitest';
import { AIR, GRASS, DIRT, STONE, TextureLayer, Face } from '../src/blocks/blocks';
import { BlockRegistry } from '../src/blocks/BlockRegistry';

describe('block ids are stable and append-only', () => {
  it('matches the spec table', () => {
    expect(AIR).toBe(0);
    expect(GRASS).toBe(1);
    expect(DIRT).toBe(2);
    expect(STONE).toBe(3);
  });
});

describe('BlockRegistry', () => {
  const reg = new BlockRegistry();

  it('reports air as non-opaque and others as opaque', () => {
    expect(reg.isOpaque(AIR)).toBe(false);
    expect(reg.isOpaque(GRASS)).toBe(true);
    expect(reg.isOpaque(DIRT)).toBe(true);
    expect(reg.isOpaque(STONE)).toBe(true);
  });

  it('maps grass faces: top=grass-top, bottom=dirt, sides=grass-side', () => {
    expect(reg.faceLayer(GRASS, Face.PosY)).toBe(TextureLayer.GrassTop);
    expect(reg.faceLayer(GRASS, Face.NegY)).toBe(TextureLayer.Dirt);
    expect(reg.faceLayer(GRASS, Face.PosX)).toBe(TextureLayer.GrassSide);
    expect(reg.faceLayer(GRASS, Face.NegZ)).toBe(TextureLayer.GrassSide);
  });

  it('maps dirt and stone uniformly on all faces', () => {
    for (const f of [Face.PosX, Face.NegX, Face.PosY, Face.NegY, Face.PosZ, Face.NegZ]) {
      expect(reg.faceLayer(DIRT, f)).toBe(TextureLayer.Dirt);
      expect(reg.faceLayer(STONE, f)).toBe(TextureLayer.Stone);
    }
  });

  it('exposes the number of texture layers for the DataArrayTexture', () => {
    expect(reg.layerCount).toBe(4);
  });
});
