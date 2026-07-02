import { describe, it, expect } from 'vitest';
import { facingFromYaw, packState } from '../src/world/VoxelState';
import { placementState, halfFromHit, type PlacementHitInfo } from '../src/app/placement';

const topFace = (y = 6): PlacementHitInfo => ({
  normal: { x: 0, y: 1, z: 0 },
  point: { x: 5.5, y, z: 7.2 },
});
const underside = (y = 6): PlacementHitInfo => ({
  normal: { x: 0, y: -1, z: 0 },
  point: { x: 5.5, y, z: 7.2 },
});
const sideFace = (yFrac: number): PlacementHitInfo => ({
  normal: { x: 1, y: 0, z: 0 },
  point: { x: 5, y: 6 + yFrac, z: 7.2 },
});

describe('halfFromHit', () => {
  it('top face → bottom half; underside → top half', () => {
    expect(halfFromHit(topFace())).toBe(0);
    expect(halfFromHit(underside())).toBe(1);
  });

  it('side face picks the half from the hit height within the face', () => {
    expect(halfFromHit(sideFace(0.2))).toBe(0);
    expect(halfFromHit(sideFace(0.8))).toBe(1);
    expect(halfFromHit(sideFace(0.5))).toBe(1); // boundary counts as the upper half
  });
});

describe('placementState', () => {
  it('stairs pack facing from yaw with the hit-derived half', () => {
    for (const yaw of [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2]) {
      expect(placementState('stair', yaw, topFace())).toBe(packState(facingFromYaw(yaw), 0));
      expect(placementState('stair', yaw, underside())).toBe(packState(facingFromYaw(yaw), 1));
    }
  });

  it('slabs take only the half bit (no facing)', () => {
    expect(placementState('slab', 1.2, topFace())).toBe(packState(0, 0));
    expect(placementState('slab', 1.2, underside())).toBe(packState(0, 1));
    expect(placementState('slab', 1.2, sideFace(0.9))).toBe(packState(0, 1));
  });

  it('gates face the yaw and stay bottom-half even from an underside hit', () => {
    expect(placementState('gate', Math.PI / 2, underside())).toBe(
      packState(facingFromYaw(Math.PI / 2), 0),
    );
  });

  it('other shapes are stateless; a missing hit defaults to the bottom half', () => {
    expect(placementState('cube', 1.2, underside())).toBe(0);
    expect(placementState('cross', 0, topFace())).toBe(0);
    expect(placementState('stair', 0)).toBe(packState(facingFromYaw(0), 0));
    expect(placementState('slab', 0)).toBe(0);
  });
});
