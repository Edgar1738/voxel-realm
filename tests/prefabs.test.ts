import { describe, it, expect } from 'vitest';
import { cottage, well, ruinedTower, brokenWall } from '../src/worldgen/prefabs';

describe('prefabs', () => {
  for (const [name, make] of [
    ['cottage', cottage],
    ['well', well],
    ['ruinedTower', ruinedTower],
    ['brokenWall', brokenWall],
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
});
