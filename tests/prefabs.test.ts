import { describe, it, expect } from 'vitest';
import {
  cottage,
  well,
  ruinedTower,
  brokenWall,
  lampPost,
  barn,
  watchtower,
  marketStall,
  bridge,
  farmPlot,
} from '../src/worldgen/prefabs';
import { LANTERN, PLANKS, DIRT } from '../src/blocks/blocks';

describe('prefabs', () => {
  for (const [name, make] of [
    ['cottage', cottage],
    ['well', well],
    ['ruinedTower', ruinedTower],
    ['brokenWall', brokenWall],
    ['lampPost', lampPost],
  ] as const) {
    it(`${name}: every block sits within its declared dims`, () => {
      const s = make();
      expect(s.blocks.length).toBeGreaterThan(0);
      const [sx, sy, sz] = s.dims;
      for (const [dx, dy, dz] of s.blocks) {
        expect(dx >= 0 && dx < sx).toBe(true);
        expect(dy >= 0 && dy < sy).toBe(true);
        expect(dz >= 0 && dz < sz).toBe(true);
      }
    });
  }

  it('lampPost and well carry a lantern (so villages glow at night)', () => {
    expect(lampPost().blocks.some(([, , , id]) => id === LANTERN)).toBe(true);
    expect(well().blocks.some(([, , , id]) => id === LANTERN)).toBe(true);
  });
});

describe('Track C prefabs (buildings)', () => {
  it('barn has the right dims and a non-empty block list', () => {
    const p = barn();
    expect(p.dims).toEqual([7, 6, 9]);
    expect(p.blocks.length).toBeGreaterThan(40);
    expect(
      p.blocks.every(([x, y, z]) => x >= 0 && y >= 0 && z >= 0 && x < 7 && y < 6 && z < 9),
    ).toBe(true);
  });
  it('watchtower is tall and topped with a lantern', () => {
    const p = watchtower();
    expect(p.dims[1]).toBeGreaterThanOrEqual(9);
    expect(p.blocks.some(([, , , id]) => id === LANTERN)).toBe(true);
  });
  it('marketStall fits its dims', () => {
    const p = marketStall();
    expect(p.dims).toEqual([5, 4, 5]);
    expect(p.blocks.length).toBeGreaterThan(10);
  });
});

describe('Track C prefabs (terrain features)', () => {
  it('bridge is a long plank deck with posts', () => {
    const p = bridge();
    expect(p.dims[0]).toBeGreaterThanOrEqual(8);
    expect(p.blocks.some(([, , , id]) => id === PLANKS)).toBe(true);
  });
  it('farmPlot is a bordered dirt patch', () => {
    const p = farmPlot();
    expect(p.dims).toEqual([5, 2, 5]);
    expect(p.blocks.some(([, , , id]) => id === DIRT)).toBe(true);
  });
});
