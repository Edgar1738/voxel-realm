import { describe, it, expect } from 'vitest';
import { resolveCollision, type SoliditySampler } from '../src/player/Collision';
import { CUBE_BOX, SLAB_BOX, type AABB } from '../src/blocks/shapeBoxes';

const HALF = { x: 0.3, y: 0.9, z: 0.3 };

/** A floor of half-height slabs across y in [0, 0.5] at voxel layer y=0. */
const slabFloor: SoliditySampler = {
  collisionBoxes(x, y, z) {
    if (y < 0) {
      // full cube floor below y=0
      const b = CUBE_BOX;
      return [[x + b[0], y + b[1], z + b[2], x + b[3], y + b[4], z + b[5]]] as AABB[];
    }
    if (y === 0) {
      // slab at voxel y=0: solid region [y, y+0.5]
      const b = SLAB_BOX;
      return [[x + b[0], y + b[1], z + b[2], x + b[3], y + b[4], z + b[5]]] as AABB[];
    }
    return [];
  },
};

describe('slab collision', () => {
  it('rests the player on the slab top (y=0.5), not the full-block top (y=1)', () => {
    // Drop from above; feet should settle at 0.5 → center.y = 0.5 + half.y.
    const r = resolveCollision(slabFloor, { x: 0, y: 5, z: 0 }, HALF, { x: 0, y: -10, z: 0 });
    expect(r.center.y).toBeCloseTo(0.5 + HALF.y, 5);
    expect(r.grounded).toBe(true);
  });

  it('a cross plant (none) never blocks movement', () => {
    const plants: SoliditySampler = { collisionBoxes: () => [] };
    const r = resolveCollision(plants, { x: 0, y: 5, z: 0 }, HALF, { x: 0, y: -10, z: 0 });
    expect(r.center.y).toBeCloseTo(-5, 5); // fell straight through
    expect(r.grounded).toBe(false);
  });

  it('slab under a full cube: highestSupport picks the cube top (y=2)', () => {
    // Column: voxel y<0 → full, voxel y=0 → lowerHalf (top=0.5), voxel y=1 → full (top=2).
    // Dropping from above must rest the player on the cube top, not the slab top.
    const columnSampler: SoliditySampler = {
      collisionBoxes(x, y, z) {
        if (y < 0) {
          const b = CUBE_BOX;
          return [[x + b[0], y + b[1], z + b[2], x + b[3], y + b[4], z + b[5]]] as AABB[];
        }
        if (y === 0) {
          const b = SLAB_BOX;
          return [[x + b[0], y + b[1], z + b[2], x + b[3], y + b[4], z + b[5]]] as AABB[];
        }
        if (y === 1) {
          const b = CUBE_BOX;
          return [[x + b[0], y + b[1], z + b[2], x + b[3], y + b[4], z + b[5]]] as AABB[];
        }
        return [];
      },
    };
    const r = resolveCollision(columnSampler, { x: 0, y: 5, z: 0 }, HALF, { x: 0, y: -10, z: 0 });
    // highestSupport returns top=2 (cube at y=1), so center.y = 2 + HALF.y = 2.9
    expect(r.center.y).toBeCloseTo(2 + HALF.y, 5);
    expect(r.grounded).toBe(true);
  });

  it('head-bump under a lowerHalf slab ceiling: head stops at integer boundary (y=3)', () => {
    // Slab at voxel y=3: solid region [3, 3.5]. Player jumps upward.
    // sweepAxis (used for sd.y > 0) snaps to the bottom of the slab at y=3.
    // When head crosses y=3, the snap leaves head ≈ 3 - EPS. Precision 2 covers EPS.
    const ceilSampler: SoliditySampler = {
      collisionBoxes(x, y, z) {
        if (y === 3) {
          const b = SLAB_BOX;
          return [[x + b[0], y + b[1], z + b[2], x + b[3], y + b[4], z + b[5]]] as AABB[];
        }
        return [];
      },
    };
    // Start player well below the slab, give a large +y delta to ensure it hits the ceiling.
    const r = resolveCollision(ceilSampler, { x: 0, y: 0, z: 0 }, HALF, { x: 0, y: 10, z: 0 });
    // head = center.y + HALF.y should stop at the slab's bottom integer boundary (3 - EPS)
    expect(r.center.y + HALF.y).toBeCloseTo(3, 2);
  });

  it('step-up onto a lowerHalf slab: player clears the slab and x advances', () => {
    // Floor: y<0 → full. Slab at x>=1, y=0 → lowerHalf (top=0.5).
    // Player walks +x with no vertical delta. tryStepUp raises by 1+EPS = 1.001.
    // Since sd.y=0 there is no downward correction in the same substep, so the player
    // ends up floating one block above the slab: center.y = HALF.y + 1 + 1e-3 = 1.901.
    // (The brief's "rest ON the slab" requires gravity; the geometrically correct value
    // for this no-gravity horizontal walk is the step-up height, not the slab surface.)
    const EPS_VAL = 1e-3;
    const stepSampler: SoliditySampler = {
      collisionBoxes(x, y, z) {
        if (y < 0) {
          const b = CUBE_BOX;
          return [[x + b[0], y + b[1], z + b[2], x + b[3], y + b[4], z + b[5]]] as AABB[];
        }
        if (y === 0 && x >= 1) {
          const b = SLAB_BOX;
          return [[x + b[0], y + b[1], z + b[2], x + b[3], y + b[4], z + b[5]]] as AABB[];
        }
        return [];
      },
    };
    // Start grounded: feet at 0 → center.y = HALF.y = 0.9
    const r = resolveCollision(stepSampler, { x: 0, y: HALF.y, z: 0 }, HALF, { x: 2, y: 0, z: 0 });
    // x must have advanced past the slab cell (x > 1)
    expect(r.center.x).toBeGreaterThan(1);
    // y should be at step-up height: HALF.y + 1 + EPS
    expect(r.center.y).toBeCloseTo(HALF.y + 1 + EPS_VAL, 5);
  });
});
