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
  TEXTURE_LAYER_COUNT,
  Face,
  BLOCK_DEFS,
  BLOCK_TEXTURES,
  buildBlockTextures,
  type BlockDef,
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

  it('treats wood and leaves as opaque', () => {
    expect(reg.isOpaque(WOOD)).toBe(true);
    expect(reg.isOpaque(LEAVES)).toBe(true);
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
    expect(reg.layerCount).toBe(TEXTURE_LAYER_COUNT);
  });
});

describe('BlockRegistry.has', () => {
  it('reports known and unknown block ids', () => {
    const reg = new BlockRegistry();
    expect(reg.has(AIR)).toBe(true);
    expect(reg.has(9999)).toBe(false);
  });
});

describe('TEXTURE_LAYER_COUNT is derived from BLOCK_TEXTURES', () => {
  it('equals the number of unique specs built from BLOCK_DEFS', () => {
    expect(TEXTURE_LAYER_COUNT).toBe(BLOCK_TEXTURES.layerCount);
  });

  it('is a positive integer', () => {
    expect(TEXTURE_LAYER_COUNT).toBeGreaterThan(0);
    expect(Number.isInteger(TEXTURE_LAYER_COUNT)).toBe(true);
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
  });

  it('has iron ore at id 16, opaque, no emission', () => {
    expect(IRON_ORE).toBe(16);
    const reg = new BlockRegistry();
    expect(reg.isOpaque(IRON_ORE)).toBe(true);
    expect(reg.emission(IRON_ORE)).toBe(0);
  });

  it('has gold ore at id 17, opaque, no emission', () => {
    expect(GOLD_ORE).toBe(17);
    const reg = new BlockRegistry();
    expect(reg.isOpaque(GOLD_ORE)).toBe(true);
    expect(reg.emission(GOLD_ORE)).toBe(0);
  });

  it('has crystal at id 18 with light emission 7 and opaque', () => {
    expect(CRYSTAL).toBe(18);
    const reg = new BlockRegistry();
    expect(reg.isOpaque(CRYSTAL)).toBe(true);
    expect(reg.emission(CRYSTAL)).toBe(7);
  });
});

describe('buildBlockTextures', () => {
  it('resolves every non-air block to 6 in-range face layers', () => {
    for (const def of BLOCK_DEFS) {
      if (!def.faces) continue;
      const layers = BLOCK_TEXTURES.faceLayers.get(def.id);
      expect(layers, `block ${def.name}`).toBeDefined();
      expect(layers).toHaveLength(6);
      for (const l of layers!) {
        expect(l).toBeGreaterThanOrEqual(0);
        expect(l).toBeLessThan(TEXTURE_LAYER_COUNT);
      }
    }
  });

  it('dedups identical specs into one layer', () => {
    const defs: BlockDef[] = [
      {
        id: 1,
        name: 'a',
        opaque: true,
        transparent: false,
        faces: { pattern: 'speckle', colors: [[1, 2, 3]] },
      },
      {
        id: 2,
        name: 'b',
        opaque: true,
        transparent: false,
        faces: { pattern: 'speckle', colors: [[1, 2, 3]] },
      },
    ];
    const t = buildBlockTextures(defs);
    expect(t.layerCount).toBe(1); // both blocks share the single unique spec
    expect(t.faceLayers.get(1)).toEqual([0, 0, 0, 0, 0, 0]);
    expect(t.faceLayers.get(2)).toEqual([0, 0, 0, 0, 0, 0]);
  });

  it('grass top and side resolve to different layers', () => {
    const g = BLOCK_TEXTURES.faceLayers.get(GRASS)!;
    expect(g[Face.PosY]).not.toBe(g[Face.PosX]); // top != side
    expect(g[Face.NegY]).toBe(BLOCK_TEXTURES.faceLayers.get(DIRT)![Face.PosY]); // grass bottom == dirt
  });
});
