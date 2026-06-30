import { describe, it, expect } from 'vitest';
import { resolveCollision, type SoliditySampler } from '../src/player/Collision';
import { CUBE_BOX, SLAB_BOX, TALL_BOX, stairBoxes, type AABB } from '../src/blocks/shapeBoxes';
import { FACING } from '../src/world/VoxelState';

const HALF = { x: 0.3, y: 0.9, z: 0.3 };

/** A sampler from a map of "x,y,z" -> local AABB[] (offset to world here). */
function sampler(boxes: Record<string, AABB[]>): SoliditySampler {
  return {
    collisionBoxes(x, y, z) {
      const local = boxes[`${x},${y},${z}`] ?? [];
      return local.map((b) => [x + b[0], y + b[1], z + b[2], x + b[3], y + b[4], z + b[5]] as AABB);
    },
  };
}

/**
 * Builds a sampler where all voxels matching the predicate are solid cubes.
 * Used to migrate the old boolean-predicate tests to the new collisionBoxes interface.
 */
function solidWhere(pred: (x: number, y: number, z: number) => boolean): SoliditySampler {
  return {
    collisionBoxes(x, y, z) {
      if (!pred(x, y, z)) return [];
      return [[x, y, z, x + 1, y + 1, z + 1]] as AABB[];
    },
  };
}

const NEVER = solidWhere(() => false);

describe('resolveCollision', () => {
  it('moves freely through empty space', () => {
    const r = resolveCollision(NEVER, { x: 0, y: 10, z: 0 }, HALF, { x: 1, y: 0, z: 2 });
    expect(r.center.x).toBeCloseTo(1, 5);
    expect(r.center.z).toBeCloseTo(2, 5);
    expect(r.grounded).toBe(false);
  });

  it('stops against a +X wall', () => {
    // Voxels with x >= 1 are solid; the wall voxel x=1 occupies [1, 2).
    const wall = solidWhere((x) => x >= 1);
    const r = resolveCollision(wall, { x: 0, y: 10, z: 0 }, HALF, { x: 2, y: 0, z: 0 });
    expect(r.center.x).toBeCloseTo(1 - HALF.x, 2); // box max rests at x = 1
  });

  it('rests on the floor and reports grounded', () => {
    // Voxels with y < 0 are solid; floor top is at y = 0.
    const floor = solidWhere((_x, y) => y < 0);
    const r = resolveCollision(floor, { x: 0, y: 5, z: 0 }, HALF, { x: 0, y: -10, z: 0 });
    expect(r.center.y).toBeCloseTo(HALF.y, 2); // box min rests at y = 0
    expect(r.grounded).toBe(true);
  });

  it('stops against a ceiling without grounding', () => {
    // Voxels with y >= 3 are solid; ceiling bottom is at y = 3.
    const ceil = solidWhere((_x, y) => y >= 3);
    const r = resolveCollision(ceil, { x: 0, y: 1, z: 0 }, HALF, { x: 0, y: 5, z: 0 });
    expect(r.center.y).toBeCloseTo(3 - HALF.y, 2);
    expect(r.grounded).toBe(false);
  });

  it('slides along a wall (blocked axis only)', () => {
    const wall = solidWhere((x) => x >= 1);
    const r = resolveCollision(wall, { x: 0, y: 10, z: 0 }, HALF, { x: 2, y: 0, z: 3 });
    expect(r.center.x).toBeCloseTo(1 - HALF.x, 2); // x blocked
    expect(r.center.z).toBeCloseTo(3, 5); // z free
  });
});

describe('resolveCollision step-up (walk mode)', () => {
  // The ledge scenario: ground at y < 0, a 1-block ledge sits at x >= 1, y in [0,1).
  // Player starts at x=0, y=0.9 (resting on the ground), walks toward +X.
  // Without step-up, the ledge face at x=1 would block. With step-up, the player
  // should land on top of the ledge (y center near 1 + HALF.y).
  //
  // sampler: ground (y<0) + ledge column at x=1, y in [0,1)
  function ledgeSampler(wallHeight: number): SoliditySampler {
    return solidWhere(
      (x, y) =>
        y < 0 || // ground
        (x >= 1 && y >= 0 && y < wallHeight), // ledge / wall
    );
  }

  it('steps up onto a 1-block ledge when walking in X', () => {
    // Player resting on ground (y center = HALF.y = 0.9), moves toward +X into a 1-block ledge.
    const world = ledgeSampler(1);
    const center = { x: 0, y: HALF.y, z: 0 };
    const r = resolveCollision(world, center, HALF, { x: 2, y: 0, z: 0 });
    // Should have stepped up: x should advance past the ledge face.
    expect(r.center.x).toBeGreaterThan(1);
    // And the player's y should be elevated by ~1 voxel above where they started.
    expect(r.center.y).toBeGreaterThan(HALF.y + 0.5);
  });

  it('does NOT step up a 2-block wall (too tall)', () => {
    // 2-block wall: y in [0, 2) at x >= 1. Step-up only handles 1-block ledges.
    const world = ledgeSampler(2);
    const center = { x: 0, y: HALF.y, z: 0 };
    const r = resolveCollision(world, center, HALF, { x: 2, y: 0, z: 0 });
    // Should be blocked — x stays near the wall face.
    expect(r.center.x).toBeLessThan(1);
  });

  it('steps up onto a 1-block ledge when walking in Z', () => {
    // Same scenario but along the Z axis.
    const world = solidWhere(
      (_x, y, z) =>
        y < 0 || // ground
        (z >= 1 && y >= 0 && y < 1), // ledge
    );
    const center = { x: 0, y: HALF.y, z: 0 };
    const r = resolveCollision(world, center, HALF, { x: 0, y: 0, z: 2 });
    expect(r.center.z).toBeGreaterThan(1);
    expect(r.center.y).toBeGreaterThan(HALF.y + 0.5);
  });

  it('caps net vertical gain at 1.0 per substep when diagonal step-up hits an inside corner', () => {
    // Diagonal move: both X and Z are blocked, both attempt step-up.
    // Without the cap, step-up on X raises y by 1+EPS, then step-up on Z raises it again
    // by another 1+EPS in the same substep, giving net y gain > 1.
    // With the cap, net y gain per substep must be <= 1.0.
    //
    // Setup: ground at y < 0, ledges at x>=1 (y in [0,1)) AND z>=1 (y in [0,1)).
    // Player starts at (0, HALF.y, 0) moving diagonally toward (+X, +Z).
    const diagonalCorner = solidWhere(
      (x, y, z) =>
        y < 0 || // ground
        (x >= 1 && y >= 0 && y < 1) || // ledge along X
        (z >= 1 && y >= 0 && y < 1), // ledge along Z
    );
    const startY = HALF.y;
    const center = { x: 0, y: startY, z: 0 };
    const r = resolveCollision(diagonalCorner, center, HALF, { x: 2, y: 0, z: 2 });
    // The net y gain must be at most 1 block (allow +EPS=1e-3 that tryStepUp adds
    // for float-boundary safety — the invariant is "no more than 1 step-up per substep").
    expect(r.center.y - startY).toBeLessThanOrEqual(1.0 + 2e-3);
  });

  it('step-up does NOT occur in fly mode (resolveCollision itself is mode-agnostic; caller skips gravity)', () => {
    // resolveCollision does not know about fly mode — the PlayerController handles that.
    // This test verifies the step-up only happens when the horizontal move is blocked AND
    // the upward-shifted position is free. In fly mode the caller passes a different delta
    // (with explicit vertical component), so the behaviour is naturally correct.
    // Here we just confirm the wall scenario without a floor still blocks correctly
    // (no ground means no grounded result, and wall still stops horizontal movement
    // when the clearance above is also occupied).
    const solidEverywhere = solidWhere((x, y) => x >= 1 && y >= 0 && y < 5);
    const center = { x: 0, y: HALF.y, z: 0 };
    const r = resolveCollision(solidEverywhere, center, HALF, { x: 2, y: 0, z: 0 });
    // Solid for 5 blocks tall — step-up should not work.
    expect(r.center.x).toBeLessThan(1);
  });
});

it('full-cube floor still rests the player at the integer top (regression)', () => {
  const floor = solidWhere((_x, y) => y < 0);
  const r = resolveCollision(
    floor,
    { x: 0, y: 5, z: 0 },
    { x: 0.3, y: 0.9, z: 0.3 },
    { x: 0, y: -10, z: 0 },
  );
  expect(r.center.y).toBeCloseTo(0 + 0.9, 5); // feet at 0 (top of voxel y=-1), center at 0.9
  expect(r.grounded).toBe(true);
});

describe('collision parity (cube/slab)', () => {
  it('rests on a cube top at y+1', () => {
    const s = sampler({ '0,0,0': [CUBE_BOX] });
    const r = resolveCollision(s, { x: 0.5, y: 2, z: 0.5 }, HALF, { x: 0, y: -2, z: 0 });
    expect(r.center.y).toBeCloseTo(1 + HALF.y, 2);
    expect(r.grounded).toBe(true);
  });
  it('rests on a slab top at y+0.5', () => {
    const s = sampler({ '0,0,0': [SLAB_BOX] });
    const r = resolveCollision(s, { x: 0.5, y: 2, z: 0.5 }, HALF, { x: 0, y: -2, z: 0 });
    expect(r.center.y).toBeCloseTo(0.5 + HALF.y, 2);
  });
  it('slides along a wall (blocked X, free Z)', () => {
    // Two-block tall wall at x=1 so step-up cannot clear it; tests axis-independent sliding.
    const s = sampler({ '1,1,0': [CUBE_BOX], '1,2,0': [CUBE_BOX] }); // wall to the +x
    const r = resolveCollision(s, { x: 0.5, y: 1.9, z: 0.5 }, HALF, { x: 1, y: 0, z: 0.5 });
    expect(r.center.x).toBeLessThan(1); // stopped at the wall face (x = 1 - half - eps)
    expect(r.center.z).toBeCloseTo(1.0, 1); // z moved freely
  });
  it('steps up a 1-block ledge', () => {
    const s = sampler({ '1,1,0': [CUBE_BOX] }); // 1-tall block ahead at y=1, ground at y=1 top
    const r = resolveCollision(s, { x: 0.5, y: 1 + HALF.y, z: 0.5 }, HALF, { x: 1, y: 0, z: 0 });
    expect(r.center.x).toBeGreaterThan(1); // climbed onto the ledge
  });
});

describe('collision precision (fence/stair)', () => {
  it('cannot step over a 1-tall fence (1.5 box blocks the step-up)', () => {
    const s = sampler({ '1,1,0': [TALL_BOX] }); // fence ahead
    const r = resolveCollision(s, { x: 0.5, y: 1 + HALF.y, z: 0.5 }, HALF, { x: 1, y: 0, z: 0 });
    expect(r.center.x).toBeLessThan(1); // blocked at the fence face, did NOT climb over
  });
  it('climbs a stair (ends above the lower step)', () => {
    const s = sampler({ '1,1,0': stairBoxes(FACING.W, 0) }); // stair ahead, step on east (toward player)
    const r = resolveCollision(s, { x: 0.5, y: 1 + HALF.y, z: 0.5 }, HALF, { x: 1, y: 0, z: 0 });
    expect(r.center.x).toBeGreaterThan(1); // walked up onto the stair
    expect(r.center.y).toBeGreaterThan(1 + HALF.y); // rose at least onto the lower half
  });
});
