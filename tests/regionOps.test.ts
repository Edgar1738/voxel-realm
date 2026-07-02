import { describe, it, expect } from 'vitest';
import {
  replaceVoxels,
  prefabToVoxels,
  unloadedChunksInBox,
  captureRegion,
  orientedStateReader,
} from '../src/app/RegionOps';
import { rotateY, type Prefab } from '../src/core/Prefab';
import { packState, setOpen, FACING } from '../src/world/VoxelState';

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
  // New contract: a number (including 0) captures a 5-tuple, undefined captures a 4-tuple.
  const readState = (x: number, y: number, z: number): number | undefined =>
    states[`${x},${y},${z}`];
  const box = { x1: 0, y1: 0, z1: 0, x2: 1, y2: 0, z2: 0 };

  it('captures 5-tuples for stateful voxels when a state reader is supplied', () => {
    expect(captureRegion(read, box, readState).blocks).toEqual([
      [0, 0, 0, 5, 2],
      [1, 0, 0, 6],
    ]);
  });

  it('keeps an explicit ZERO state as a 5-tuple (a north-facing stair packs to 0)', () => {
    expect(captureRegion(read, box, () => 0).blocks).toEqual([
      [0, 0, 0, 5, 0],
      [1, 0, 0, 6, 0],
    ]);
  });

  it('stays stateless (4-tuples) when no state reader is supplied', () => {
    expect(captureRegion(read, box).blocks).toEqual([
      [0, 0, 0, 5],
      [1, 0, 0, 6],
    ]);
  });

  it('orientedStateReader keeps nonzero state, zero state for facing shapes, else undefined', () => {
    // ids: 7 = a stair (facing shape), 8 = plain stone, 9 = a top slab (nonzero state)
    const rIds: Record<string, number> = { '0,0,0': 7, '1,0,0': 8, '2,0,0': 9 };
    const rStates: Record<string, number> = { '2,0,0': 4 };
    const reader = orientedStateReader(
      (x, y, z) => rIds[`${x},${y},${z}`] ?? 0,
      (x, y, z) => rStates[`${x},${y},${z}`] ?? 0,
      (id) => id === 7,
    );
    expect(reader(0, 0, 0)).toBe(0); // N stair: zero state kept
    expect(reader(1, 0, 0)).toBeUndefined(); // stone: stateless
    expect(reader(2, 0, 0)).toBe(4); // top slab: nonzero state kept without facing
  });

  it('a copied north-facing stair (state 0) rotates to face west', () => {
    const rIds: Record<string, number> = { '0,0,0': 7 };
    const clip = captureRegion(
      (x, y, z) => rIds[`${x},${y},${z}`] ?? 0,
      { x1: 0, y1: 0, z1: 0, x2: 0, y2: 0, z2: 0 },
      orientedStateReader(
        (x, y, z) => rIds[`${x},${y},${z}`] ?? 0,
        () => 0, // facing N packs to state 0
        (id) => id === 7,
      ),
    );
    expect(clip.blocks).toEqual([[0, 0, 0, 7, 0]]); // the zero state must survive capture
    const turned = rotateY(clip, 1);
    expect(prefabToVoxels(turned, 0, 0, 0)).toEqual([
      { x: 0, y: 0, z: 0, id: 7, state: packState(FACING.W, 0) },
    ]);
  });

  it('copy→paste round-trips stair facing and gate open state', () => {
    const stairState = packState(FACING.E, 1); // upside-down east-facing stair
    const gateState = setOpen(packState(FACING.N, 0), true); // open gate
    const rIds: Record<string, number> = { '4,2,4': 7, '5,2,4': 8 };
    const rStates: Record<string, number> = { '4,2,4': stairState, '5,2,4': gateState };
    const clip = captureRegion(
      (x, y, z) => rIds[`${x},${y},${z}`] ?? 0,
      { x1: 4, y1: 2, z1: 4, x2: 5, y2: 2, z2: 4 },
      (x, y, z) => rStates[`${x},${y},${z}`] ?? 0,
    );
    expect(prefabToVoxels(clip, 4, 2, 4)).toEqual([
      { x: 4, y: 2, z: 4, id: 7, state: stairState },
      { x: 5, y: 2, z: 4, id: 8, state: gateState },
    ]);
  });
});
