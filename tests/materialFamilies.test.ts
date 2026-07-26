import { describe, expect, it } from 'vitest';
import {
  BLOCK_DEFS,
  BLOCK_TEXTURES,
  GRANITE,
  WARM_MASONRY,
  STAIRS_WARM_MASONRY,
  MATERIAL_FAMILIES,
  familyRoleOf,
  familyCounterpart,
  STONE_SLAB,
  STAIRS_STONE,
  BASALT_SLAB,
  STAIRS_BASALT,
  BASALT_WALL,
  DIRT,
} from '../src/blocks/blocks';
import { BlockRegistry } from '../src/blocks/BlockRegistry';
import { CREATIVE_BLOCKS, creativeGroupFor } from '../src/app/CreativeInventory';
import { Biome } from '../src/worldgen/BiomeMap';
import { geologicalStone } from '../src/worldgen/SurfacePainter';
import { CASTLE_PALETTES, castleWallMaterial } from '../src/worldgen/MaterialPalettes';

describe('material families', () => {
  it('keeps new ids append-only, creative, and texture-backed', () => {
    const ids = BLOCK_DEFS.filter((d) => d.id >= 49).map((d) => d.id);
    expect(ids).toEqual(Array.from({ length: 47 }, (_, i) => i + 49));
    for (const id of ids) {
      expect(CREATIVE_BLOCKS).toContain(id);
      expect(BLOCK_TEXTURES.faceLayers.get(id)).toHaveLength(6);
    }
  });

  it('groups material variants semantically', () => {
    expect(creativeGroupFor(GRANITE)).toBe('Terrain');
    expect(creativeGroupFor(WARM_MASONRY)).toBe('Masonry');
    expect(creativeGroupFor(STAIRS_WARM_MASONRY)).toBe('Masonry');
  });
});

describe('material family tables (shape-aware swap)', () => {
  const reg = new BlockRegistry();

  it('every family member exists and its declared role matches its registered shape', () => {
    const roleToShape = { cube: 'cube', slab: 'slab', stair: 'stair', wall: 'wall' } as const;
    for (const roles of Object.values(MATERIAL_FAMILIES)) {
      for (const [role, id] of Object.entries(roles)) {
        expect(reg.shape(id)).toBe(roleToShape[role as keyof typeof roleToShape]);
      }
    }
  });

  it('maps counterparts role-for-role and returns undefined for missing roles', () => {
    expect(familyCounterpart(STONE_SLAB, 'basalt')).toBe(BASALT_SLAB);
    expect(familyCounterpart(STAIRS_STONE, 'basalt')).toBe(STAIRS_BASALT);
    // Stone has no wall member, so nothing maps TO one — but basalt's wall exists FROM cobble.
    expect(familyRoleOf(BASALT_WALL)?.role).toBe('wall');
    // Brick lacks a slab: a stone slab has no brick counterpart.
    expect(familyCounterpart(STONE_SLAB, 'brick')).toBeUndefined();
    // Non-family blocks never map.
    expect(familyRoleOf(DIRT)).toBeUndefined();
    expect(familyCounterpart(DIRT, 'stone')).toBeUndefined();
  });
});

describe('geological palette', () => {
  it('uses mountain stones and broad 16-block regions', () => {
    const samples = Array.from({ length: 256 }, (_, i) =>
      geologicalStone((i % 16) * 16, 90, Math.floor(i / 16) * 16, 100, Biome.Mountains),
    );
    expect(new Set(samples).size).toBeGreaterThan(1);
    expect(samples.every((id) => id === GRANITE || id === 50)).toBe(true);
    for (let x = 0; x < 64; x += 16) {
      const region = Array.from({ length: 16 }, (_, dx) =>
        geologicalStone(x + dx, 90, 0, 100, Biome.Mountains),
      );
      expect(new Set(region).size).toBe(1);
    }
  });

  it('reserves foundations and keeps weathering sparse', () => {
    const p = CASTLE_PALETTES.highlandKeep;
    expect(castleWallMaterial(p, 0, 10, 0, 10)).toBe(p.foundation);
    const wall = Array.from({ length: 100 }, (_, x) => castleWallMaterial(p, x, 20, x * 3, 10));
    expect(wall.filter((id) => id === p.weathered).length).toBeLessThan(20);
  });
});
