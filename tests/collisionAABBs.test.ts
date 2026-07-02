import { describe, it, expect } from 'vitest';
import { BlockRegistry } from '../src/blocks/BlockRegistry';
import { CUBE_BOX, SLAB_BOX, SLAB_TOP_BOX, TALL_BOX } from '../src/blocks/shapeBoxes';
import {
  STONE,
  STONE_SLAB,
  STAIRS_STONE,
  OAK_FENCE,
  OAK_FENCE_GATE,
  COBBLE_WALL,
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
  it('a top slab (half bit set) collides in the upper half', () => {
    expect(reg.collisionAABBs(STONE_SLAB, packState(0, 1))).toEqual([SLAB_TOP_BOX]);
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

describe('registry.connectedCollisionAABBs', () => {
  const AIR = 0 as const;
  it('an unconnected fence is just its post; a wall uses the thicker wall post', () => {
    const none = () => AIR as never;
    expect(reg.connectedCollisionAABBs(OAK_FENCE, 0, none)).toEqual([
      [0.375, 0, 0.375, 0.625, 1.5, 0.625],
    ]);
    expect(reg.connectedCollisionAABBs(COBBLE_WALL, 0, none)).toEqual([
      [0.25, 0, 0.25, 0.75, 1.5, 0.75],
    ]);
  });
  it('arms follow connectsTo: same shape and full cubes connect, gates/plants do not', () => {
    const east = (dx: number) => (dx === 1 ? OAK_FENCE : AIR) as never;
    expect(reg.connectedCollisionAABBs(OAK_FENCE, 0, east)).toEqual([
      [0.375, 0, 0.375, 0.625, 1.5, 0.625],
      [0.625, 0, 0.375, 1, 1.5, 0.625],
    ]);
    const gateEast = (dx: number) => (dx === 1 ? OAK_FENCE_GATE : AIR) as never;
    expect(reg.connectedCollisionAABBs(OAK_FENCE, 0, gateEast)).toEqual([
      [0.375, 0, 0.375, 0.625, 1.5, 0.625],
    ]);
    const stoneSouth = (_dx: number, dz: number) => (dz === 1 ? STONE : AIR) as never;
    expect(reg.connectedCollisionAABBs(COBBLE_WALL, 0, stoneSouth)).toEqual([
      [0.25, 0, 0.25, 0.75, 1.5, 0.75],
      [0.25, 0, 0.75, 0.75, 1.5, 1],
    ]);
  });
  it('non-connecting shapes defer to collisionAABBs', () => {
    expect(reg.connectedCollisionAABBs(STONE, 0, () => OAK_FENCE as never)).toEqual([CUBE_BOX]);
  });
});
