import { describe, it, expect } from 'vitest';
import { AIR, GRASS, DIRT, STONE, WOOD, LEAVES, TextureLayer, Face } from '../src/blocks/blocks';
import { BlockRegistry } from '../src/blocks/BlockRegistry';

describe('block ids are stable and append-only', () => {
  it('matches the spec table', () => {
    expect(AIR).toBe(0);
    expect(GRASS).toBe(1);
    expect(DIRT).toBe(2);
    expect(STONE).toBe(3);
  });

  it('appends wood and leaves at the reserved ids', () => {
    expect(WOOD).toBe(5);
    expect(LEAVES).toBe(6);
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

  it('treats wood and leaves as opaque', () => {
    expect(reg.isOpaque(WOOD)).toBe(true);
    expect(reg.isOpaque(LEAVES)).toBe(true);
  });

  it('maps wood: rings on top/bottom, bark on the sides; leaves uniform', () => {
    expect(reg.faceLayer(WOOD, Face.PosY)).toBe(TextureLayer.WoodTop);
    expect(reg.faceLayer(WOOD, Face.NegY)).toBe(TextureLayer.WoodTop);
    expect(reg.faceLayer(WOOD, Face.PosX)).toBe(TextureLayer.WoodSide);
    for (const f of [Face.PosX, Face.NegX, Face.PosY, Face.NegY, Face.PosZ, Face.NegZ]) {
      expect(reg.faceLayer(LEAVES, f)).toBe(TextureLayer.Leaves);
    }
  });

  it('exposes the number of texture layers for the DataArrayTexture', () => {
    expect(reg.layerCount).toBe(7);
  });
});
