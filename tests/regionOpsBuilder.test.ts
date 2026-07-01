import { describe, it, expect } from 'vitest';
import { captureRegion, fillBox, clearBox, prefabToVoxels } from '../src/app/RegionOps';
import { AIR } from '../src/blocks/blocks';

const STONE = 5 as never;

describe('captureRegion', () => {
  it('captures non-air voxels as min-corner-relative offsets and full box dims', () => {
    // A 2x1x2 box at (10,4,10); only (10,4,11) and (11,4,10) are stone.
    const read = (x: number, y: number, z: number) =>
      (x === 10 && y === 4 && z === 11) || (x === 11 && y === 4 && z === 10) ? STONE : AIR;
    const p = captureRegion(read, { x1: 10, y1: 4, z1: 10, x2: 11, y2: 4, z2: 11 });
    expect(p.dims).toEqual([2, 1, 2]);
    expect(p.blocks).toContainEqual([0, 0, 1, STONE]);
    expect(p.blocks).toContainEqual([1, 0, 0, STONE]);
    expect(p.blocks).toHaveLength(2);
  });

  it('round-trips: capture then prefabToVoxels at the same origin reproduces the non-air set', () => {
    const read = (x: number, y: number, z: number) => (x === 3 && y === 0 && z === 0 ? STONE : AIR);
    const p = captureRegion(read, { x1: 2, y1: 0, z1: 0, x2: 4, y2: 0, z2: 0 });
    expect(prefabToVoxels(p, 2, 0, 0)).toEqual([{ x: 3, y: 0, z: 0, id: STONE }]);
  });
});

describe('fillBox / clearBox', () => {
  it('fillBox sets every voxel in the box to the id (order-independent corners)', () => {
    const edits = fillBox({ x1: 1, y1: 0, z1: 0, x2: 0, y2: 0, z2: 0 }, STONE);
    expect(edits).toEqual([
      { x: 0, y: 0, z: 0, id: STONE },
      { x: 1, y: 0, z: 0, id: STONE },
    ]);
  });

  it('clearBox sets every voxel to AIR', () => {
    const edits = clearBox({ x1: 0, y1: 0, z1: 0, x2: 0, y2: 1, z2: 0 });
    expect(edits).toEqual([
      { x: 0, y: 0, z: 0, id: AIR },
      { x: 0, y: 1, z: 0, id: AIR },
    ]);
  });
});
