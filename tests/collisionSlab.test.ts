import { describe, it, expect } from 'vitest';
import { resolveCollision, type SoliditySampler } from '../src/player/Collision';

const HALF = { x: 0.3, y: 0.9, z: 0.3 };

/** A floor of half-height slabs across y in [0, 0.5] at voxel layer y=0. */
const slabFloor: SoliditySampler = {
  isSolid: (_x, y) => y < 0 || y === 0, // voxel y=0 is "solid" for any isSolid caller
  solidBox: (_x, y) => (y < 0 ? 'full' : y === 0 ? 'lowerHalf' : 'none'),
};

describe('slab collision', () => {
  it('rests the player on the slab top (y=0.5), not the full-block top (y=1)', () => {
    // Drop from above; feet should settle at 0.5 → center.y = 0.5 + half.y.
    const r = resolveCollision(slabFloor, { x: 0, y: 5, z: 0 }, HALF, { x: 0, y: -10, z: 0 });
    expect(r.center.y).toBeCloseTo(0.5 + HALF.y, 2);
    expect(r.grounded).toBe(true);
  });

  it('a cross plant (none) never blocks movement', () => {
    const plants: SoliditySampler = { isSolid: () => false, solidBox: () => 'none' };
    const r = resolveCollision(plants, { x: 0, y: 5, z: 0 }, HALF, { x: 0, y: -10, z: 0 });
    expect(r.center.y).toBeCloseTo(-5, 5); // fell straight through
    expect(r.grounded).toBe(false);
  });
});
