import { describe, it, expect } from 'vitest';
import {
  replaceVoxels,
  prefabToVoxels,
  unloadedChunksInBox,
  captureRegion,
} from '../src/app/RegionOps';
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

  it('throws on an over-large box', () => {
    const read = () => 0 as number;
    expect(() =>
      replaceVoxels(read, { x1: 0, y1: 0, z1: 0, x2: 999, y2: 999, z2: 999 }, 1, 2),
    ).toThrow(/too large|200000/);
  });
});

it('unloadedChunksInBox lists deduped chunk keys for unloaded columns', () => {
  const loaded = (x: number, z: number) => x >= 0 && z >= 0; // negative-x and negative-z columns unloaded
  const keys = unloadedChunksInBox(loaded, { x1: -20, y1: 0, z1: -20, x2: 0, y2: 0, z2: 0 });
  expect(keys.length).toBeGreaterThan(0);
  expect(new Set(keys).size).toBe(keys.length); // verify deduplication
  // all unloaded chunks must have either negative x or negative z (or both)
  expect(
    keys.every((k) => {
      const [cxStr, czStr] = k.split(',');
      const cx = Number(cxStr);
      const cz = Number(czStr);
      return cx < 0 || cz < 0;
    }),
  ).toBe(true);
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

  it('emits state for 5-tuple blocks and omits it for plain 4-tuples', () => {
    const p: Prefab = {
      dims: [2, 1, 1],
      blocks: [
        [0, 0, 0, 5, 2],
        [1, 0, 0, 6],
      ],
    };
    expect(prefabToVoxels(p, 10, 20, 30)).toEqual([
      { x: 10, y: 20, z: 30, id: 5, state: 2 },
      { x: 11, y: 20, z: 30, id: 6 },
    ]);
  });
});

describe('captureRegion – optional block state', () => {
  const ids: Record<string, number> = { '0,0,0': 5, '1,0,0': 6 };
  const states: Record<string, number> = { '0,0,0': 2 };
  const read = (x: number, y: number, z: number): number => ids[`${x},${y},${z}`] ?? 0;
  const readState = (x: number, y: number, z: number): number => states[`${x},${y},${z}`] ?? 0;
  const box = { x1: 0, y1: 0, z1: 0, x2: 1, y2: 0, z2: 0 };

  it('captures 5-tuples for stateful voxels when a state reader is supplied', () => {
    expect(captureRegion(read, box, readState).blocks).toEqual([
      [0, 0, 0, 5, 2],
      [1, 0, 0, 6],
    ]);
  });

  it('stays stateless (4-tuples) when no state reader is supplied', () => {
    expect(captureRegion(read, box).blocks).toEqual([
      [0, 0, 0, 5],
      [1, 0, 0, 6],
    ]);
  });
});
