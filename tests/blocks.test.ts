import { describe, it, expect } from 'vitest';
import {
  AIR,
  GRASS,
  DIRT,
  STONE,
  WOOD,
  LEAVES,
  SAND,
  WATER,
  SNOW,
  CACTUS,
  GLASS,
  PLANKS,
  COBBLESTONE,
  BRICK,
  LANTERN,
  COAL_ORE,
  IRON_ORE,
  GOLD_ORE,
  CRYSTAL,
  TextureLayer,
  TEXTURE_LAYER_COUNT,
  Face,
} from '../src/blocks/blocks';
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

  it('has sand at id 4 and water at id 8', () => {
    expect(SAND).toBe(4);
    expect(WATER).toBe(8);
  });

  it('has snow at id 9', () => {
    expect(SNOW).toBe(9);
  });

  it('has cactus at id 10', () => {
    expect(CACTUS).toBe(10);
  });

  it('has glass at id 7', () => {
    expect(GLASS).toBe(7);
  });

  it('has planks at id 11, cobblestone at 12, brick at 13', () => {
    expect(PLANKS).toBe(11);
    expect(COBBLESTONE).toBe(12);
    expect(BRICK).toBe(13);
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

  it('treats sand as opaque and water as non-opaque/transparent', () => {
    expect(reg.isOpaque(SAND)).toBe(true);
    expect(reg.isOpaque(WATER)).toBe(false);
    expect(reg.get(WATER).transparent).toBe(true);
  });

  it('treats snow as opaque', () => {
    expect(reg.isOpaque(SNOW)).toBe(true);
  });

  it('treats cactus as opaque', () => {
    expect(reg.isOpaque(CACTUS)).toBe(true);
  });

  it('treats glass as non-opaque and transparent', () => {
    expect(reg.isOpaque(GLASS)).toBe(false);
    expect(reg.get(GLASS).transparent).toBe(true);
  });

  it('treats planks, cobblestone, and brick as opaque', () => {
    expect(reg.isOpaque(PLANKS)).toBe(true);
    expect(reg.isOpaque(COBBLESTONE)).toBe(true);
    expect(reg.isOpaque(BRICK)).toBe(true);
  });

  it('exposes the number of texture layers for the DataArrayTexture', () => {
    expect(reg.layerCount).toBe(20);
  });
});

describe('BlockRegistry.has', () => {
  it('reports known and unknown block ids', () => {
    const reg = new BlockRegistry();
    expect(reg.has(AIR)).toBe(true);
    expect(reg.has(9999)).toBe(false);
  });
});

describe('TEXTURE_LAYER_COUNT is derived from TextureLayer', () => {
  it('equals the number of keys in TextureLayer', () => {
    expect(TEXTURE_LAYER_COUNT).toBe(Object.keys(TextureLayer).length);
  });

  it('equals 20 (current layer count)', () => {
    expect(TEXTURE_LAYER_COUNT).toBe(20);
  });
});

describe('newer block ids 14-18 (lantern, ores, crystal)', () => {
  it('has lantern at id 14 with light emission 14 and opaque', () => {
    expect(LANTERN).toBe(14);
    const reg = new BlockRegistry();
    expect(reg.isOpaque(LANTERN)).toBe(true);
    expect(reg.emission(LANTERN)).toBe(14);
  });

  it('has coal ore at id 15, opaque, no emission', () => {
    expect(COAL_ORE).toBe(15);
    const reg = new BlockRegistry();
    expect(reg.isOpaque(COAL_ORE)).toBe(true);
    expect(reg.emission(COAL_ORE)).toBe(0);
    for (const f of [Face.PosX, Face.NegX, Face.PosY, Face.NegY, Face.PosZ, Face.NegZ]) {
      expect(reg.faceLayer(COAL_ORE, f)).toBe(TextureLayer.CoalOre);
    }
  });

  it('has iron ore at id 16, opaque, no emission', () => {
    expect(IRON_ORE).toBe(16);
    const reg = new BlockRegistry();
    expect(reg.isOpaque(IRON_ORE)).toBe(true);
    expect(reg.emission(IRON_ORE)).toBe(0);
    for (const f of [Face.PosX, Face.NegX, Face.PosY, Face.NegY, Face.PosZ, Face.NegZ]) {
      expect(reg.faceLayer(IRON_ORE, f)).toBe(TextureLayer.IronOre);
    }
  });

  it('has gold ore at id 17, opaque, no emission', () => {
    expect(GOLD_ORE).toBe(17);
    const reg = new BlockRegistry();
    expect(reg.isOpaque(GOLD_ORE)).toBe(true);
    expect(reg.emission(GOLD_ORE)).toBe(0);
    for (const f of [Face.PosX, Face.NegX, Face.PosY, Face.NegY, Face.PosZ, Face.NegZ]) {
      expect(reg.faceLayer(GOLD_ORE, f)).toBe(TextureLayer.GoldOre);
    }
  });

  it('has crystal at id 18 with light emission 7 and opaque', () => {
    expect(CRYSTAL).toBe(18);
    const reg = new BlockRegistry();
    expect(reg.isOpaque(CRYSTAL)).toBe(true);
    expect(reg.emission(CRYSTAL)).toBe(7);
    for (const f of [Face.PosX, Face.NegX, Face.PosY, Face.NegY, Face.PosZ, Face.NegZ]) {
      expect(reg.faceLayer(CRYSTAL, f)).toBe(TextureLayer.Crystal);
    }
  });
});

describe('BlockRegistry.faceLayer throws on AIR', () => {
  it('throws a clear error when called on AIR (faceless block)', () => {
    const reg = new BlockRegistry();
    expect(() => reg.faceLayer(AIR, Face.PosX)).toThrow(/faceLayer called on block "air"/);
  });
});
