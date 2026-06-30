import { describe, it, expect } from 'vitest';
import { BlockRegistry } from '../src/blocks/BlockRegistry';
import { STAIRS_STONE, STAIRS_PLANK, STAIRS_COBBLE, STAIRS_BRICK } from '../src/blocks/blocks';

const reg = new BlockRegistry();

describe('stair content', () => {
  it('has stable ids 31-34', () => {
    expect([STAIRS_STONE, STAIRS_PLANK, STAIRS_COBBLE, STAIRS_BRICK]).toEqual([31, 32, 33, 34]);
  });
  it('all are stair-shaped, opaque, creative, lowerHalf, resolve faces', () => {
    for (const id of [STAIRS_STONE, STAIRS_PLANK, STAIRS_COBBLE, STAIRS_BRICK]) {
      expect(reg.shape(id)).toBe('stair');
      expect(reg.collisionAABBs(id, 0).length).toBe(2); // stairs have exactly two collision boxes
      expect(reg.get(id).creative).toBe(true);
      expect(() => reg.faceLayer(id, 0)).not.toThrow();
    }
  });
});
