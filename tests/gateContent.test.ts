import { describe, it, expect } from 'vitest';
import { BlockRegistry } from '../src/blocks/BlockRegistry';
import { OAK_FENCE_GATE } from '../src/blocks/blocks';
import { TALL_BOX } from '../src/blocks/shapeBoxes';

const reg = new BlockRegistry();

describe('gate content', () => {
  it('has stable id 38, gate-shaped, toggleable, creative, faces resolve', () => {
    expect(OAK_FENCE_GATE).toBe(38);
    expect(reg.shape(OAK_FENCE_GATE)).toBe('gate');
    expect(reg.isToggleable(OAK_FENCE_GATE)).toBe(true);
    expect(reg.collisionAABBs(OAK_FENCE_GATE, 0)).toEqual([TALL_BOX]); // closed gate is a single tall box
    expect(reg.get(OAK_FENCE_GATE).creative).toBe(true);
    expect(() => reg.faceLayer(OAK_FENCE_GATE, 0)).not.toThrow();
  });
});
