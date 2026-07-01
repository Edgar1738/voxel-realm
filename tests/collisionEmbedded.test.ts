import { describe, it, expect } from 'vitest';
import { resolveCollision, type SoliditySampler } from '../src/player/Collision';
import { PlayerController, type PlayerWorld } from '../src/player/PlayerController';
import { walkToward } from '../src/player/Simulate';
import { createCavernsGenerator } from '../src/worldgen/LayeredGenerator';
import { BlockRegistry } from '../src/blocks/BlockRegistry';
import { ChunkData } from '../src/world/ChunkData';
import { chunkKey, worldToChunkCoord, worldToLocal } from '../src/core/coords';
import { WORLD_HEIGHT } from '../src/core/constants';
import type { AABB } from '../src/blocks/shapeBoxes';

// Regression tests for the walkTo tunneling bug: resolveCollision used to assume the starting
// AABB never overlaps solid. From an embedded start (e.g. __vr.teleport sets the body CENTER,
// so "teleport onto the floor" sinks the feet 0.9 into it), every sweep snapped the player to
// the near face of boxes it was already inside: horizontal moves ratcheted the player BACKWARD
// one block per frame, and a jump's rising sweep snapped DOWN to the box bottoms, drilling
// through solid ground into the void below y=0.

const HALF = { x: 0.3, y: 0.9, z: 0.3 };

function solidWhere(pred: (x: number, y: number, z: number) => boolean): SoliditySampler {
  return {
    collisionBoxes(x, y, z) {
      if (!pred(x, y, z)) return [];
      return [[x, y, z, x + 1, y + 1, z + 1]] as AABB[];
    },
  };
}

describe('resolveCollision from an embedded start (never snap backward/through)', () => {
  // Deep solid rock: everything below y=10 is stone. Player fully inside it.
  const rock = solidWhere((_x, y) => y < 10);

  it('horizontal move never moves the player backward', () => {
    const start = { x: 0.5, y: 5, z: 0.5 };
    const r = resolveCollision(rock, start, HALF, { x: 1, y: 0, z: 0 });
    // Must end between start and target: blocked ahead is fine, backward snap is the bug.
    expect(r.center.x).toBeGreaterThanOrEqual(start.x - 1e-3);
    expect(r.center.x).toBeLessThanOrEqual(start.x + 1);
    expect(r.center.z).toBeCloseTo(start.z, 5);
  });

  it('upward move (jump) never teleports the player down', () => {
    const start = { x: 0.5, y: 5, z: 0.5 };
    const r = resolveCollision(rock, start, HALF, { x: 0, y: 2, z: 0 });
    // The old rising sweep snapped to (embedded box bottom - half - eps), moving DOWN ~2.
    expect(r.center.y).toBeGreaterThanOrEqual(start.y - 1e-3);
    expect(r.center.y).toBeLessThanOrEqual(start.y + 2);
  });

  it('downward move embedded in a thin crust holds instead of sinking through', () => {
    // 1-block crust at y=4 with air below; player center overlaps the crust.
    const crust = solidWhere((_x, y) => y === 4);
    const start = { x: 0.5, y: 4.5, z: 0.5 };
    const r = resolveCollision(crust, start, HALF, { x: 0, y: -0.3, z: 0 });
    // The old code found no support below (air) and sank by the full delta each frame,
    // tunneling through the crust into the space below.
    expect(r.center.y).toBeCloseTo(start.y, 5);
    expect(r.grounded).toBe(true);
  });
});

describe('walkToward from a teleport-style embedded start', () => {
  it('feet sunk 0.9 into a flat floor: pops up via step-up and arrives', () => {
    // Floor top at y=0. __vr.teleport(x, 0, z) puts the CENTER at 0, feet at -0.9 (embedded).
    const floor: PlayerWorld = {
      ...solidWhere((_x, y) => y < 0),
      isWater: () => false,
    } as PlayerWorld;
    const player = new PlayerController({ x: 0, y: 0, z: 0 }, false);
    let minX = Infinity;
    const origUpdate = player.update.bind(player);
    player.update = (dt, input, yaw, w) => {
      origUpdate(dt, input, yaw, w);
      minX = Math.min(minX, player.position.x);
    };
    const r = walkToward(player, floor, { x: 6, y: 0, z: 0 });
    expect(r.arrived).toBe(true);
    expect(minX).toBeGreaterThan(-0.1); // no backward lurch out of the embedded start
    expect(player.position.y).toBeCloseTo(HALF.y, 1); // standing ON the floor
  });
});

describe('walkTo tunneling repro (caverns seed 1337, teleport 18,14,-16 → walk 31,14,-3)', () => {
  function buildWorld(): PlayerWorld {
    const gen = createCavernsGenerator();
    const registry = new BlockRegistry();
    const chunks = new Map<string, ChunkData>();
    for (let cx = 0; cx <= 2; cx++)
      for (let cz = -2; cz <= 0; cz++)
        chunks.set(chunkKey(cx, cz), gen.generateBaseChunk(1337, cx, cz));

    // Mirrors ChunkManager.collisionBoxesAt: below-world and unloaded chunks read solid.
    return {
      collisionBoxes(wx, wy, wz): AABB[] {
        if (wy < 0) return [[wx, wy, wz, wx + 1, wy + 1, wz + 1]];
        if (wy >= WORLD_HEIGHT) return [];
        const chunk = chunks.get(chunkKey(worldToChunkCoord(wx), worldToChunkCoord(wz)));
        if (!chunk) return [[wx, wy, wz, wx + 1, wy + 1, wz + 1]];
        const lx = worldToLocal(wx);
        const lz = worldToLocal(wz);
        const id = chunk.get(lx, wy, lz);
        if (!registry.isOpaque(id)) return [];
        const state = chunk.getState(lx, wy, lz);
        return registry
          .collisionAABBs(id, state)
          .map((b) => [wx + b[0], wy + b[1], wz + b[2], wx + b[3], wy + b[4], wz + b[5]] as AABB);
      },
      isWater: () => false,
    };
  }

  it('never falls below the rock it started in (used to end near (-6,-24,-40))', () => {
    const world = buildWorld();
    // The exact reported repro: teleport sets the body center — here that is deep inside
    // generated rock, the worst-case embedded start.
    const player = new PlayerController({ x: 18, y: 14, z: -16 }, false);

    let minY = Infinity;
    let minX = Infinity;
    let minZ = Infinity; // walking +z: a decreasing z is the backward ratchet
    const origUpdate = player.update.bind(player);
    player.update = (dt, input, yaw, w) => {
      origUpdate(dt, input, yaw, w);
      minY = Math.min(minY, player.position.y);
      minX = Math.min(minX, player.position.x);
      minZ = Math.min(minZ, player.position.z);
    };

    const r = walkToward(player, world, { x: 31, y: 14, z: -3 });

    // Embedded in solid rock with rock above: the walk cannot succeed, but it must fail
    // SAFELY — stuck near the start, not teleported backward or drilled into the void.
    expect(r.stuck).toBe(true);
    expect(minY).toBeGreaterThan(12.5); // never tunnels below its own block
    expect(minX).toBeGreaterThan(17); // never ratchets backward in X
    expect(minZ).toBeGreaterThan(-17.5); // never ratchets backward in Z
    expect(Math.abs(r.finalPos.x - 18)).toBeLessThan(1.5);
    expect(Math.abs(r.finalPos.z + 16)).toBeLessThan(1.5);
  });
});
