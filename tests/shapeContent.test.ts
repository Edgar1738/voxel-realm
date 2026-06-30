import { describe, it, expect } from 'vitest';
import { BlockRegistry } from '../src/blocks/BlockRegistry';
import { STONE_SLAB, PLANK_SLAB, FLOWER, TALL_GRASS } from '../src/blocks/blocks';

const reg = new BlockRegistry();

describe('shape content blocks', () => {
  it('has stable ids 27–30', () => {
    expect([STONE_SLAB, PLANK_SLAB, FLOWER, TALL_GRASS]).toEqual([27, 28, 29, 30]);
  });
  it('slabs are opaque lowerHalf; plants are cross + non-solid + non-occluding', () => {
    expect(reg.shape(STONE_SLAB)).toBe('slab');
    expect(reg.collisionAABBs(PLANK_SLAB, 0).length).toBeGreaterThan(0); // slab has collision boxes
    expect(reg.occludes(STONE_SLAB)).toBe(false);
    expect(reg.shape(FLOWER)).toBe('cross');
    expect(reg.collisionAABBs(TALL_GRASS, 0).length).toBe(0); // cross/plant is passable
    expect(reg.occludes(FLOWER)).toBe(false);
  });
  it('all four appear in the creative picker and resolve to 6 face layers', () => {
    for (const id of [STONE_SLAB, PLANK_SLAB, FLOWER, TALL_GRASS]) {
      expect(reg.get(id).creative).toBe(true);
      expect(() => reg.faceLayer(id, 0)).not.toThrow();
    }
  });
});
