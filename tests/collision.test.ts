import { describe, it, expect } from 'vitest';
import { resolveCollision, type SoliditySampler } from '../src/player/Collision';

const HALF = { x: 0.3, y: 0.9, z: 0.3 };

/** Sampler solid wherever `pred(x,y,z)` is true. */
function sampler(pred: (x: number, y: number, z: number) => boolean): SoliditySampler {
  return { isSolid: pred };
}

const NEVER = sampler(() => false);

describe('resolveCollision', () => {
  it('moves freely through empty space', () => {
    const r = resolveCollision(NEVER, { x: 0, y: 10, z: 0 }, HALF, { x: 1, y: 0, z: 2 });
    expect(r.center.x).toBeCloseTo(1, 5);
    expect(r.center.z).toBeCloseTo(2, 5);
    expect(r.grounded).toBe(false);
  });

  it('stops against a +X wall', () => {
    // Voxels with x >= 1 are solid; the wall voxel x=1 occupies [1, 2).
    const wall = sampler((x) => x >= 1);
    const r = resolveCollision(wall, { x: 0, y: 10, z: 0 }, HALF, { x: 2, y: 0, z: 0 });
    expect(r.center.x).toBeCloseTo(1 - HALF.x, 2); // box max rests at x = 1
  });

  it('rests on the floor and reports grounded', () => {
    // Voxels with y < 0 are solid; floor top is at y = 0.
    const floor = sampler((_x, y) => y < 0);
    const r = resolveCollision(floor, { x: 0, y: 5, z: 0 }, HALF, { x: 0, y: -10, z: 0 });
    expect(r.center.y).toBeCloseTo(HALF.y, 2); // box min rests at y = 0
    expect(r.grounded).toBe(true);
  });

  it('stops against a ceiling without grounding', () => {
    // Voxels with y >= 3 are solid; ceiling bottom is at y = 3.
    const ceil = sampler((_x, y) => y >= 3);
    const r = resolveCollision(ceil, { x: 0, y: 1, z: 0 }, HALF, { x: 0, y: 5, z: 0 });
    expect(r.center.y).toBeCloseTo(3 - HALF.y, 2);
    expect(r.grounded).toBe(false);
  });

  it('slides along a wall (blocked axis only)', () => {
    const wall = sampler((x) => x >= 1);
    const r = resolveCollision(wall, { x: 0, y: 10, z: 0 }, HALF, { x: 2, y: 0, z: 3 });
    expect(r.center.x).toBeCloseTo(1 - HALF.x, 2); // x blocked
    expect(r.center.z).toBeCloseTo(3, 5); // z free
  });
});
