import { describe, it, expect } from 'vitest';
import { CUBE_BOX, SLAB_BOX, TALL_BOX, stairBoxes } from '../src/blocks/shapeBoxes';
import { FACING } from '../src/world/VoxelState';

describe('shapeBoxes', () => {
  it('constants are correct local boxes', () => {
    expect(CUBE_BOX).toEqual([0, 0, 0, 1, 1, 1]);
    expect(SLAB_BOX).toEqual([0, 0, 0, 1, 0.5, 1]);
    expect(TALL_BOX).toEqual([0, 0, 0, 1, 1.5, 1]);
  });
  it('a bottom stair = lower full half + upper back-half; facing rotates the upper box', () => {
    const n = stairBoxes(FACING.N, 0);
    expect(n.length).toBe(2);
    expect(n[0]).toEqual([0, 0, 0, 1, 0.5, 1]); // lower full half
    expect(n[1]).toEqual([0, 0.5, 0.5, 1, 1, 1]); // upper, south-half cut (N → step on south, upper on north z 0.5..1)
    const e = stairBoxes(FACING.E, 0);
    expect(e[1]).toEqual([0, 0.5, 0, 0.5, 1, 1]); // upper on west x 0..0.5
  });
  it('a top-half (upside-down) stair flips the halves', () => {
    const n = stairBoxes(FACING.N, 1);
    expect(n[0]).toEqual([0, 0.5, 0, 1, 1, 1]); // full upper half
    expect(n[1]).toEqual([0, 0, 0.5, 1, 0.5, 1]); // step on the bottom
  });
});
