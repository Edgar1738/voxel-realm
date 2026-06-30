import { describe, it, expect } from 'vitest';
import { BlockRegistry } from '../src/blocks/BlockRegistry';
import { OAK_FENCE, COBBLE_WALL, STONEBRICK_WALL } from '../src/blocks/blocks';
import { TALL_BOX } from '../src/blocks/shapeBoxes';

const reg = new BlockRegistry();

describe('fence/wall content', () => {
  it('has stable ids 35-37', () => {
    expect([OAK_FENCE, COBBLE_WALL, STONEBRICK_WALL]).toEqual([35, 36, 37]);
  });
  it('the fence is fence-shaped, the walls wall-shaped; all full-collision, creative, faces resolve', () => {
    expect(reg.shape(OAK_FENCE)).toBe('fence');
    expect(reg.shape(COBBLE_WALL)).toBe('wall');
    expect(reg.shape(STONEBRICK_WALL)).toBe('wall');
    for (const id of [OAK_FENCE, COBBLE_WALL, STONEBRICK_WALL]) {
      expect(reg.collisionAABBs(id, 0)).toEqual([TALL_BOX]); // fence/wall is a single tall box
      expect(reg.occludes(id)).toBe(false);
      expect(reg.get(id).creative).toBe(true);
      expect(() => reg.faceLayer(id, 0)).not.toThrow();
    }
  });
});
