import { describe, it, expect } from 'vitest';
import { BlockRegistry } from '../src/blocks/BlockRegistry';
import { CUBE_BOX, SLAB_BOX, TALL_BOX } from '../src/blocks/shapeBoxes';
import {
  STONE,
  STONE_SLAB,
  STAIRS_STONE,
  OAK_FENCE,
  OAK_FENCE_GATE,
  FLOWER,
} from '../src/blocks/blocks';
import { packState, setOpen, FACING } from '../src/world/VoxelState';

const reg = new BlockRegistry();

describe('registry.collisionAABBs', () => {
  it('cube / slab / fence(tall) / plant(none)', () => {
    expect(reg.collisionAABBs(STONE, 0)).toEqual([CUBE_BOX]);
    expect(reg.collisionAABBs(STONE_SLAB, 0)).toEqual([SLAB_BOX]);
    expect(reg.collisionAABBs(OAK_FENCE, 0)).toEqual([TALL_BOX]);
    expect(reg.collisionAABBs(FLOWER, 0)).toEqual([]);
  });
  it('stair returns its two boxes by state', () => {
    const boxes = reg.collisionAABBs(STAIRS_STONE, packState(FACING.N, 0));
    expect(boxes.length).toBe(2);
    expect(boxes[0]).toEqual([0, 0, 0, 1, 0.5, 1]);
  });
  it('a gate is solid (tall) closed, empty open', () => {
    expect(reg.collisionAABBs(OAK_FENCE_GATE, packState(FACING.N, 0))).toEqual([TALL_BOX]);
    expect(reg.collisionAABBs(OAK_FENCE_GATE, setOpen(packState(FACING.N, 0), true))).toEqual([]);
  });
});
