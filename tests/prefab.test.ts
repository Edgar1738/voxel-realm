import { describe, it, expect } from 'vitest';
import {
  normalize,
  rotateY,
  mirror,
  repeat,
  validatePrefab,
  type Prefab,
} from '../src/core/Prefab';

const L: Prefab = {
  // An L-shape footprint (y=0): (0,0),(1,0),(0,1). dims 2x1x2.
  dims: [2, 1, 2],
  blocks: [
    [0, 0, 0, 1],
    [1, 0, 0, 2],
    [0, 0, 1, 3],
  ],
};

describe('normalize', () => {
  it('re-anchors min corner to origin and tightens dims', () => {
    const shifted: Prefab = {
      dims: [2, 1, 2],
      blocks: [
        [5, 2, 5, 1],
        [6, 2, 5, 2],
      ],
    };
    const n = normalize(shifted);
    expect(n.blocks).toEqual([
      [0, 0, 0, 1],
      [1, 0, 0, 2],
    ]);
    expect(n.dims).toEqual([2, 1, 1]);
  });
});

describe('rotateY', () => {
  it('rotated four times returns the original (normalized)', () => {
    let r = L;
    for (let i = 0; i < 4; i++) r = rotateY(r, 1);
    expect(normalize(r)).toEqual(normalize(L));
  });

  it('90deg maps (x,z) -> (z, maxX - x) and swaps x/z dims', () => {
    const r = rotateY(L, 1);
    expect(r.dims).toEqual([2, 1, 2]);
    // block (1,0,0,2) -> after rotate its new coords are normalized; assert the id set is preserved
    expect(r.blocks.map((b) => b[3]).sort()).toEqual([1, 2, 3]);
    // pin the rotation direction: (1,0,0,2) must land at (0,0,0,2) after one 90deg turn
    expect(r.blocks).toContainEqual([0, 0, 0, 2]);
    // every block lands inside the new dims
    for (const [x, , z] of r.blocks) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(z).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(r.dims[0]);
      expect(z).toBeLessThan(r.dims[2]);
    }
  });
});

describe('mirror', () => {
  it('mirror twice on x is identity', () => {
    expect(normalize(mirror(mirror(L, 'x'), 'x'))).toEqual(normalize(L));
  });

  it('flips coordinates across the x axis', () => {
    expect(normalize(mirror(L, 'x')).blocks).toContainEqual([0, 0, 0, 2]);
  });
});

describe('repeat', () => {
  it('tiles 2x1x1 with stride and multiplies block count', () => {
    const r = repeat(L, 2, 1, 1, [2, 0, 0]);
    expect(r.blocks.length).toBe(L.blocks.length * 2);
    expect(r.dims).toEqual([4, 1, 2]); // two copies offset by stride 2 in x
  });

  it('throws when the tiled total exceeds the cap', () => {
    const p = {
      dims: [1, 1, 1] as [number, number, number],
      blocks: [[0, 0, 0, 1]] as [number, number, number, number][],
    };
    expect(() => repeat(p, 1000, 1000, 1, [2, 0, 0])).toThrow(/too large|cap/i);
  });
});

describe('validatePrefab', () => {
  it('accepts a well-formed prefab', () => {
    expect(validatePrefab({ dims: [1, 1, 1], blocks: [[0, 0, 0, 3]] })).toBeNull();
  });
  it('rejects non-array blocks / bad dims', () => {
    expect(validatePrefab({ dims: [0, 1, 1], blocks: [] })).toMatch(/dims/i);
    expect(validatePrefab({ dims: [1, 1, 1], blocks: 'nope' })).toMatch(/blocks/i);
  });
  it('rejects negative or out-of-dims offsets', () => {
    expect(validatePrefab({ dims: [1, 1, 1], blocks: [[-1, 0, 0, 3]] })).toMatch(/offset|range/i);
    expect(validatePrefab({ dims: [1, 1, 1], blocks: [[5, 0, 0, 3]] })).toMatch(/offset|range/i);
  });
  it('rejects a block id outside 0..255', () => {
    expect(validatePrefab({ dims: [1, 1, 1], blocks: [[0, 0, 0, 999]] })).toMatch(/id/i);
  });
});

describe('stateful prefabs (5-tuple)', () => {
  // id 5 carries orientation state 2 (e.g. a stair facing); id 6 is a legacy 4-tuple.
  const STATE: Prefab = {
    dims: [2, 1, 1],
    blocks: [
      [0, 0, 0, 5, 2],
      [1, 0, 0, 6],
    ],
  };

  const stateOfId = (p: Prefab, id: number): number | undefined => {
    const b = p.blocks.find((v) => v[3] === id);
    return b && b.length === 5 ? b[4] : undefined;
  };

  it('validatePrefab accepts 4- and 5-tuples but rejects an out-of-range state', () => {
    expect(validatePrefab({ dims: [1, 1, 1], blocks: [[0, 0, 0, 5, 2]] })).toBeNull();
    expect(validatePrefab({ dims: [1, 1, 1], blocks: [[0, 0, 0, 5]] })).toBeNull();
    expect(validatePrefab({ dims: [1, 1, 1], blocks: [[0, 0, 0, 5, 999]] })).toMatch(/state/i);
    expect(validatePrefab({ dims: [1, 1, 1], blocks: [[0, 0, 0, 5, -1]] })).toMatch(/state/i);
    expect(validatePrefab({ dims: [1, 1, 1], blocks: [[0, 0, 0, 5, 6, 7]] })).toMatch(/dx/i);
  });

  it('normalize carries the state element through the re-anchor', () => {
    const shifted: Prefab = { dims: [1, 1, 1], blocks: [[5, 2, 5, 5, 2]] };
    expect(normalize(shifted).blocks).toEqual([[0, 0, 0, 5, 2]]);
  });

  it('preserves per-block state through copy → rotate → mirror → repeat', () => {
    expect(stateOfId(rotateY(STATE, 1), 5)).toBe(2);
    expect(stateOfId(mirror(STATE, 'x'), 5)).toBe(2);
    const tiled = repeat(STATE, 2, 1, 1, [2, 0, 0]);
    expect(tiled.blocks.filter((v) => v[3] === 5 && v.length === 5 && v[4] === 2)).toHaveLength(2);
    // the legacy 4-tuple stays a 4-tuple (state not fabricated)
    expect(rotateY(STATE, 1).blocks.find((v) => v[3] === 6)?.length).toBe(4);
  });
});
