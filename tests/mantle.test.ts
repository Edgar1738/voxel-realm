import { describe, it, expect } from 'vitest';
import { PlayerController, type PlayerWorld } from '../src/player/PlayerController';
import { makeInput } from '../src/player/Simulate';

/**
 * Test arena: flat floor at y=0, a wall column at z=4 of configurable height, optionally
 * flagged as a barrier (fence-style: 1.5-tall box that must never be mantled).
 */
function arena(wallHeight: number, barrier = false): PlayerWorld {
  return {
    collisionBoxes: (x, y, z) => {
      if (y === 0) return [[x, y, z, x + 1, y + 1, z + 1]];
      if (z === 4 && y >= 1 && y <= wallHeight) {
        // A barrier renders as one 1.5-tall box from its base cell, like fences do.
        if (barrier) return y === 1 ? [[x, y, z, x + 1, y + 1.5, z + 1]] : [];
        return [[x, y, z, x + 1, y + 1, z + 1]];
      }
      return [];
    },
    isWater: () => false,
    isBarrier: (_x, y, z) => barrier && z === 4 && y === 1,
  };
}

/**
 * Runs toward −Z (yaw 0) from in front of the wall, jumping whenever grounded, for `seconds`.
 * Returns the final position plus the run's peak height and minimum z (how far it got).
 */
function jumpAtWall(world: PlayerWorld, seconds: number) {
  const player = new PlayerController({ x: 0.5, y: 1.9, z: 5.6 }, false);
  let maxY = player.position.y;
  let minZ = player.position.z;
  const frames = Math.round(seconds * 60);
  for (let i = 0; i < frames; i++) {
    player.update(1 / 60, makeInput({ forward: true, up: player.grounded }), 0, world);
    maxY = Math.max(maxY, player.position.y);
    minZ = Math.min(minZ, player.position.z);
  }
  return { player, maxY, minZ };
}

describe('mantle', () => {
  it('jump + hold-forward climbs over a 2-block wall', () => {
    const r = jumpAtWall(arena(2), 2);
    expect(r.maxY).toBeGreaterThan(3.8); // stood on top (feet ≥ 3)
    expect(r.minZ).toBeLessThan(4); // and crossed the wall line — impossible without mantling
  });

  it('a 3-block wall stays unclimbable', () => {
    const r = jumpAtWall(arena(3), 2);
    expect(r.maxY).toBeLessThan(4.5); // never reached the top (top stand height = 4.9)
    expect(r.minZ).toBeGreaterThan(5); // never crossed
  });

  it('never mantles a barrier (fence-height box)', () => {
    const r = jumpAtWall(arena(1, true), 2);
    // The fence is 1.5 tall: jump apex (~1.45) can't clear it and mantle must refuse it.
    expect(r.minZ).toBeGreaterThan(4.5); // still on the near side
    expect(r.maxY).toBeLessThan(3.4); // jump arcs only, no pull-up onto the fence
  });

  it('grounded walking into a 1-block ledge still steps up (mantle does not regress step-up)', () => {
    const world = arena(0); // no wall
    const step: PlayerWorld = {
      collisionBoxes: (x, y, z) => {
        if (y === 0) return [[x, y, z, x + 1, y + 1, z + 1]];
        if (z <= 3 && y === 1) return [[x, y, z, x + 1, y + 1, z + 1]]; // raised platform
        return [];
      },
      isWater: world.isWater,
    };
    const player = new PlayerController({ x: 0.5, y: 1.9, z: 5.5 }, false);
    for (let i = 0; i < 90; i++) player.update(1 / 60, makeInput({ forward: true }), 0, step);
    expect(player.position.y).toBeGreaterThan(2.8); // walked up onto the platform
    expect(player.position.z).toBeLessThan(4);
  });

  it('samplers without isBarrier still mantle plain walls (back-compat)', () => {
    const world = arena(2);
    delete (world as { isBarrier?: unknown }).isBarrier;
    const r = jumpAtWall(world, 2);
    expect(r.maxY).toBeGreaterThan(3.8);
    expect(r.minZ).toBeLessThan(4);
  });
});
