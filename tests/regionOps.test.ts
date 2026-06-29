import { describe, it, expect } from 'vitest';
import { replaceVoxels, prefabToVoxels } from '../src/app/RegionOps';
import type { Prefab } from '../src/core/Prefab';

describe('replaceVoxels', () => {
  it('retargets only matching ids inside the box', () => {
    const world: Record<string, number> = { '0,0,0': 3, '1,0,0': 5, '2,0,0': 3 };
    const read = (x: number, y: number, z: number) => world[`${x},${y},${z}`] ?? 0;
    const out = replaceVoxels(read, { x1: 0, y1: 0, z1: 0, x2: 2, y2: 0, z2: 0 }, 3, 7);
    expect(out).toEqual([
      { x: 0, y: 0, z: 0, id: 7 },
      { x: 2, y: 0, z: 0, id: 7 },
    ]);
  });

  it('normalizes a reversed box and still finds matching voxels', () => {
    const world: Record<string, number> = { '0,0,0': 3, '1,0,0': 5, '2,0,0': 3 };
    const read = (x: number, y: number, z: number) => world[`${x},${y},${z}`] ?? 0;
    // Box corners are reversed (x1 > x2) — normalization must handle this
    const out = replaceVoxels(read, { x1: 2, y1: 0, z1: 0, x2: 0, y2: 0, z2: 0 }, 3, 7);
    expect(out).toEqual([
      { x: 0, y: 0, z: 0, id: 7 },
      { x: 2, y: 0, z: 0, id: 7 },
    ]);
  });
});

describe('prefabToVoxels', () => {
  it('offsets prefab blocks to a paste origin', () => {
    const p: Prefab = {
      dims: [1, 1, 2],
      blocks: [
        [0, 0, 0, 1],
        [0, 0, 1, 2],
      ],
    };
    expect(prefabToVoxels(p, 10, 20, 30)).toEqual([
      { x: 10, y: 20, z: 30, id: 1 },
      { x: 10, y: 20, z: 31, id: 2 },
    ]);
  });
});
