import { describe, it, expect } from 'vitest';
import { PlayerController, type PlayerWorld } from '../src/player/PlayerController';
import { simulateSteps, walkToward, makeInput, yawToward } from '../src/player/Simulate';
import type { AABB } from '../src/blocks/shapeBoxes';

/**
 * Minimal physics world: solid ground for all cells with y ≤ 0 (floor top = y=1), plus an
 * optional full-height wall at a given z. Enough to exercise gravity, walking, and blocking.
 */
function world(wallZ?: number): PlayerWorld {
  return {
    isWater: () => false,
    collisionBoxes: (x: number, y: number, z: number): AABB[] => {
      const boxes: AABB[] = [];
      if (y <= 0) boxes.push([x, y, z, x + 1, y + 1, z + 1]); // ground
      if (wallZ !== undefined && z === wallZ && y >= 1 && y <= 10)
        boxes.push([x, y, z, x + 1, y + 1, z + 1]); // tall wall — cannot be stepped over
      return boxes;
    },
  };
}

describe('yawToward', () => {
  it('faces −Z (forward at yaw 0) when the target is to the −Z', () => {
    expect(yawToward(0, -1)).toBeCloseTo(0, 5);
  });
});

describe('simulateSteps', () => {
  it('gravity settles the player onto the floor and marks it grounded', () => {
    const player = new PlayerController({ x: 0, y: 3, z: 0 }, false);
    const r = simulateSteps(player, world(), makeInput(), 0, 90, 1 / 60);
    expect(r.grounded).toBe(true);
    // feet rest on the floor top (y=1) → body centre at 1 + HALF.y(0.9) = 1.9
    expect(player.position.y).toBeCloseTo(1.9, 1);
  });

  it('walking forward on flat ground moves the player', () => {
    const player = new PlayerController({ x: 0, y: 1.9, z: 0 }, false);
    const r = simulateSteps(player, world(), makeInput({ forward: true }), 0, 60, 1 / 60);
    expect(r.moved).toBeGreaterThan(1); // covered real ground
    expect(player.position.z).toBeLessThan(-1); // forward at yaw 0 is −Z
  });

  it('does nothing observable with neutral input on the ground', () => {
    const player = new PlayerController({ x: 0, y: 1.9, z: 0 }, false);
    const r = simulateSteps(player, world(), makeInput(), 0, 30, 1 / 60);
    expect(r.moved).toBeLessThan(0.01);
  });
});

describe('walkToward', () => {
  it('arrives at a reachable target on flat ground', () => {
    const player = new PlayerController({ x: 0, y: 1.9, z: 0 }, false);
    const r = walkToward(player, world(), { x: 0, y: 1.9, z: -6 });
    expect(r.arrived).toBe(true);
    expect(r.remaining).toBeLessThanOrEqual(0.8);
  });

  it('reports stuck when a full-height wall blocks the path (the "unreachable" signal)', () => {
    const player = new PlayerController({ x: 0, y: 1.9, z: 0 }, false);
    const r = walkToward(player, world(-3), { x: 0, y: 1.9, z: -8 }, { maxFrames: 400 });
    expect(r.arrived).toBe(false);
    expect(r.stuck).toBe(true);
    expect(r.remaining).toBeGreaterThan(3); // stalled well short of the target
  });

  it('does not report arrival when only the horizontal coordinates match', () => {
    const player = new PlayerController({ x: 0, y: 1.9, z: 0 }, false);
    const r = walkToward(player, world(), { x: 0, y: 20, z: 0 });
    expect(r.arrived).toBe(false);
    expect(r.remaining).toBeGreaterThan(16);
  });
});
