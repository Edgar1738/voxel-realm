import { describe, it, expect } from 'vitest';
import { BlockRegistry } from '../src/blocks/BlockRegistry';
import { AIR, LADDER, OAK_DOOR, STONE } from '../src/blocks/blocks';
import { doorBox, edgeSlabBox, DOOR_THICKNESS } from '../src/blocks/shapeBoxes';
import {
  FACING,
  FACING_DIR,
  facingFromDir,
  oppositeFacing,
  packState,
  setOpen,
  toggleOpen,
  isOpen,
} from '../src/world/VoxelState';
import { placementState } from '../src/app/placement';
import { PlayerController } from '../src/player/PlayerController';
import { makeInput } from '../src/player/Simulate';
import type { PlayerWorld } from '../src/player/PlayerController';

const registry = new BlockRegistry();

describe('facing↔direction mapping', () => {
  it('FACING_DIR round-trips through facingFromDir', () => {
    for (let f = 0; f < 4; f++) {
      const [dx, dz] = FACING_DIR[f];
      expect(facingFromDir(dx, dz)).toBe(f);
    }
    expect(facingFromDir(0, 0)).toBeUndefined();
    expect(facingFromDir(1, 1)).toBeUndefined();
  });

  it('oppositeFacing flips N↔S and E↔W', () => {
    expect(oppositeFacing(FACING.N)).toBe(FACING.S);
    expect(oppositeFacing(FACING.E)).toBe(FACING.W);
  });
});

describe('door geometry', () => {
  it('closed panel is thin, full-width, flush at the edge behind the facing', () => {
    // Facing N looks toward -Z, so the panel hugs the +Z edge.
    const b = doorBox(FACING.N, false, 1.5);
    expect(b).toEqual([0, 0, 1 - DOOR_THICKNESS, 1, 1.5, 1]);
  });

  it('open panel swings to the adjacent side edge, clearing the passage', () => {
    const closed = doorBox(FACING.N, false, 1.5);
    const open = doorBox(FACING.N, true, 1.5);
    expect(open).not.toEqual(closed);
    // Open panel spans Z (thin on X) — the walk axis the closed panel blocked is clear.
    expect(open[3] - open[0]).toBeCloseTo(DOOR_THICKNESS);
    expect(open[5] - open[2]).toBe(1);
  });

  it('every facing keeps the panel inside the voxel', () => {
    for (let f = 0; f < 4; f++) {
      for (const open of [false, true]) {
        const b = doorBox(f, open, 2);
        expect(b[0]).toBeGreaterThanOrEqual(0);
        expect(b[2]).toBeGreaterThanOrEqual(0);
        expect(b[3]).toBeLessThanOrEqual(1);
        expect(b[5]).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe('door registry behavior', () => {
  it('doors are toggleable, keep facing, and collide 1.5 tall in both states', () => {
    expect(registry.isToggleable(OAK_DOOR)).toBe(true);
    expect(registry.hasFacing(OAK_DOOR)).toBe(true);
    const closedBoxes = registry.collisionAABBs(OAK_DOOR, packState(FACING.N, 0));
    const openBoxes = registry.collisionAABBs(OAK_DOOR, setOpen(packState(FACING.N, 0), true));
    expect(closedBoxes).toHaveLength(1);
    expect(openBoxes).toHaveLength(1);
    expect(closedBoxes[0][4]).toBe(1.5);
    expect(openBoxes[0]).not.toEqual(closedBoxes[0]);
  });

  it('doors do not occlude neighbours (light and faces pass the doorway)', () => {
    expect(registry.occludes(OAK_DOOR)).toBe(false);
  });

  it('the open bit toggles round-trip', () => {
    const state = packState(FACING.E, 0);
    expect(isOpen(state)).toBe(false);
    expect(isOpen(toggleOpen(state))).toBe(true);
    expect(isOpen(toggleOpen(toggleOpen(state)))).toBe(false);
  });
});

describe('ladder registry behavior', () => {
  it('ladders are climbable, keep facing, and have no collision boxes', () => {
    expect(registry.isClimbable(LADDER)).toBe(true);
    expect(registry.isClimbable(STONE)).toBe(false);
    expect(registry.hasFacing(LADDER)).toBe(true);
    expect(registry.collisionAABBs(LADDER, 0)).toEqual([]);
  });

  it('the plate hugs the wall behind the facing', () => {
    // Facing S looks toward +Z: the wall (behind) is the -Z edge.
    const b = edgeSlabBox(FACING.S, 0.08, 1);
    expect(b[2]).toBe(0);
    expect(b[5]).toBeCloseTo(0.08);
  });
});

describe('ladder placement state', () => {
  const point = { x: 0.5, y: 0.5, z: 0.5 };

  it('mounts on the clicked wall face (facing = the face normal)', () => {
    // Clicking a wall face whose normal points -Z → ladder faces N.
    const state = placementState('ladder', 0, { normal: { x: 0, y: 0, z: -1 }, point });
    expect(state & 0b11).toBe(FACING.N);
    const east = placementState('ladder', 0, { normal: { x: -1, y: 0, z: 0 }, point });
    expect(east & 0b11).toBe(FACING.E);
  });

  it('floor/ceiling clicks face back toward the player', () => {
    // Player at yaw 0 looks N; a floor hit mounts the ladder facing S (toward the player).
    const state = placementState('ladder', 0, { normal: { x: 0, y: 1, z: 0 }, point });
    expect(state & 0b11).toBe(FACING.S);
  });

  it('doors take the yaw facing like gates', () => {
    const state = placementState('door', 0, { normal: { x: 0, y: 1, z: 0 }, point });
    expect(state & 0b11).toBe(FACING.N);
  });
});

describe('ladder climbing physics', () => {
  /**
   * Flat stone floor at y=0, a stone wall at z=4, and a ladder column in the cell in front
   * of it (5,1..8,5). At yaw 0 "forward" is −Z: the player pushes into the wall, like a real
   * climb.
   */
  const ladderWorld: PlayerWorld = {
    collisionBoxes: (x, y, z) => {
      const floor = y === 0;
      const wall = x === 5 && z === 4 && y >= 1 && y <= 8;
      if (floor || wall) return [[x, y, z, x + 1, y + 1, z + 1]];
      return [];
    },
    isWater: () => false,
    isClimbable: (x, y, z) => x === 5 && z === 5 && y >= 1 && y <= 8,
  };

  const stepFrames = (
    player: PlayerController,
    input: ReturnType<typeof makeInput>,
    frames: number,
  ): void => {
    for (let i = 0; i < frames; i++) player.update(1 / 60, input, 0, ladderWorld);
  };

  it('holding forward climbs the ladder instead of falling', () => {
    const player = new PlayerController({ x: 5.5, y: 1.9, z: 5.5 }, false);
    stepFrames(player, makeInput({ forward: true }), 90);
    expect(player.position.y).toBeGreaterThan(5); // 1.5s at climb speed 4 ≈ +6, minus grab
  });

  it('idling on the ladder slides down slowly, not at gravity speed', () => {
    const player = new PlayerController({ x: 5.5, y: 6, z: 5.5 }, false);
    stepFrames(player, makeInput(), 30); // 0.5s
    const dropped = 6 - player.position.y;
    expect(dropped).toBeGreaterThan(0.4); // it does descend…
    expect(dropped).toBeLessThan(1.2); // …but far slower than free fall (~3.5 in 0.5s)
  });

  it('shift descends under control', () => {
    const player = new PlayerController({ x: 5.5, y: 6, z: 5.5 }, false);
    stepFrames(player, makeInput({ down: true }), 30);
    expect(6 - player.position.y).toBeGreaterThan(1.5);
    expect(6 - player.position.y).toBeLessThan(2.5);
  });

  it('off the ladder, gravity still applies', () => {
    const player = new PlayerController({ x: 10.5, y: 6, z: 10.5 }, false);
    stepFrames(player, makeInput(), 60);
    expect(player.position.y).toBeLessThan(2); // fell to the floor
  });

  it('a sampler without isClimbable keeps working (back-compat)', () => {
    const legacy: PlayerWorld = {
      collisionBoxes: (x, y, z) => (y === 0 ? [[x, y, z, x + 1, y + 1, z + 1]] : []),
      isWater: () => false,
    };
    const player = new PlayerController({ x: 0.5, y: 3, z: 0.5 }, false);
    for (let i = 0; i < 60; i++) player.update(1 / 60, makeInput(), 0, legacy);
    expect(player.position.y).toBeLessThan(2.1); // fell and landed normally
  });

  it('AIR is never climbable via the registry', () => {
    expect(registry.isClimbable(AIR)).toBe(false);
  });
});
