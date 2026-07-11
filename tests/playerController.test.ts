import { describe, it, expect } from 'vitest';
import {
  PlayerController,
  type InputState,
  type PlayerWorld,
} from '../src/player/PlayerController';
import type { AABB } from '../src/blocks/shapeBoxes';
import { CUBE_BOX } from '../src/blocks/shapeBoxes';

/** Build a PlayerWorld where voxels matching `pred` are solid full cubes. */
function makeWorld(
  pred: (x: number, y: number, z: number) => boolean,
  waterPred: (x: number, y: number, z: number) => boolean = () => false,
): PlayerWorld {
  return {
    collisionBoxes(x, y, z): AABB[] {
      if (!pred(x, y, z)) return [];
      const b = CUBE_BOX;
      return [[x + b[0], y + b[1], z + b[2], x + b[3], y + b[4], z + b[5]]];
    },
    isWater: waterPred,
  };
}

const NEVER: PlayerWorld = makeWorld(() => false);
const FLOOR: PlayerWorld = makeWorld((_x, y) => y < 0);
const WATER: PlayerWorld = makeWorld(
  () => false,
  () => true,
);

function input(partial: Partial<InputState> = {}): InputState {
  return {
    forward: false,
    back: false,
    left: false,
    right: false,
    up: false,
    down: false,
    sprint: false,
    toggleFly: false,
    ...partial,
  };
}

describe('PlayerController (flying)', () => {
  it('moves forward along -Z at yaw 0', () => {
    const p = new PlayerController({ x: 0, y: 50, z: 0 }, true);
    p.update(0.1, input({ forward: true }), 0, NEVER);
    expect(p.position.z).toBeLessThan(0);
    expect(p.position.x).toBeCloseTo(0, 5);
  });

  it('strafes right along +X at yaw 0', () => {
    const p = new PlayerController({ x: 0, y: 50, z: 0 }, true);
    p.update(0.1, input({ right: true }), 0, NEVER);
    expect(p.position.x).toBeGreaterThan(0);
  });

  it('flies up and down with Space/Shift, ignoring gravity', () => {
    const p = new PlayerController({ x: 0, y: 50, z: 0 }, true);
    p.update(0.1, input({ up: true }), 0, NEVER);
    const afterUp = p.position.y;
    expect(afterUp).toBeGreaterThan(50);
    p.update(0.1, input({ down: true }), 0, NEVER);
    expect(p.position.y).toBeLessThan(afterUp);
  });
});

describe('PlayerController (walking)', () => {
  it('falls under gravity and lands grounded on the floor', () => {
    const p = new PlayerController({ x: 0, y: 5, z: 0 }, false);
    for (let i = 0; i < 120; i++) p.update(1 / 60, input(), 0, FLOOR);
    expect(p.grounded).toBe(true);
    expect(p.position.y).toBeCloseTo(0.9, 1); // resting box center (half-height 0.9)
  });

  it('jumps when grounded but not while airborne', () => {
    const p = new PlayerController({ x: 0, y: 5, z: 0 }, false);
    for (let i = 0; i < 120; i++) p.update(1 / 60, input(), 0, FLOOR); // settle on floor
    const resting = p.position.y;
    p.update(1 / 60, input({ up: true }), 0, FLOOR); // jump
    expect(p.position.y).toBeGreaterThan(resting);
  });

  it('toggling fly resets to flying and stops falling', () => {
    const p = new PlayerController({ x: 0, y: 50, z: 0 }, false);
    p.update(1 / 60, input({ toggleFly: true }), 0, NEVER);
    expect(p.flying).toBe(true);
    const y = p.position.y;
    p.update(1 / 60, input(), 0, NEVER);
    expect(p.position.y).toBeCloseTo(y, 5); // no gravity while flying
  });
});

describe('PlayerController eye', () => {
  it('places the eye above the body center', () => {
    const p = new PlayerController({ x: 1, y: 50, z: 2 }, true);
    const eye = p.eye();
    expect(eye.x).toBe(1);
    expect(eye.z).toBe(2);
    expect(eye.y).toBeGreaterThan(50);
  });
});

describe('PlayerController (submerged detection)', () => {
  it('treats feet-in-water as submerged even when the body center is dry', () => {
    // Water only at y <= 1: the player center is at y=2 (dry), but feet are at y=2-0.9=1.1
    // which floors to voxel y=1 — that IS water. Should use swim physics (slower speed).
    const feetWaterOnly: PlayerWorld = makeWorld(
      () => false,
      (_x, y) => y <= 1,
    );
    // Player center at y=2: feet at y=1.1 (voxel y=1, water), center at y=2 (voxel y=2, dry)
    const inWater = new PlayerController({ x: 0, y: 2, z: 0 }, false);
    const onLand = new PlayerController({ x: 0, y: 2, z: 0 }, false);
    inWater.update(0.1, input({ forward: true }), 0, feetWaterOnly);
    onLand.update(0.1, input({ forward: true }), 0, FLOOR);
    // Swim speed (3.3) < walk speed (5.5), so horizontal displacement should be less
    expect(Math.abs(inWater.position.z)).toBeLessThan(Math.abs(onLand.position.z));
  });

  it('treats head-in-water as submerged even when the body center is dry', () => {
    // Water only at y >= 3: player center at y=2 (dry), head at y=2+0.9=2.9 which floors to y=2 (dry)
    // So head voxel at y=2 is NOT water, but let's use y=3 floor: head at y=2.9 → floor(2.9)=2, not 3.
    // Instead: center at y=2.5, head at y=3.4 → floor(3.4)=3, which IS water.
    const headWaterOnly: PlayerWorld = makeWorld(
      () => false,
      (_x, y) => y >= 3,
    );
    const inWater = new PlayerController({ x: 0, y: 2.5, z: 0 }, false);
    const onLand = new PlayerController({ x: 0, y: 2.5, z: 0 }, false);
    inWater.update(0.1, input({ forward: true }), 0, headWaterOnly);
    onLand.update(0.1, input({ forward: true }), 0, FLOOR);
    expect(Math.abs(inWater.position.z)).toBeLessThan(Math.abs(onLand.position.z));
  });
});

describe('PlayerController (swimming)', () => {
  it('swims up with Space while submerged', () => {
    const p = new PlayerController({ x: 0, y: 50, z: 0 }, false);
    p.update(0.1, input({ up: true }), 0, WATER);
    expect(p.position.y).toBeGreaterThan(50);
    expect(p.grounded).toBe(false);
  });

  it('sinks gently with no input while submerged', () => {
    const p = new PlayerController({ x: 0, y: 50, z: 0 }, false);
    p.update(0.1, input(), 0, WATER);
    expect(p.position.y).toBeLessThan(50);
  });

  it('sinks faster holding Shift than drifting', () => {
    const drift = new PlayerController({ x: 0, y: 50, z: 0 }, false);
    const sink = new PlayerController({ x: 0, y: 50, z: 0 }, false);
    drift.update(0.1, input(), 0, WATER);
    sink.update(0.1, input({ down: true }), 0, WATER);
    expect(sink.position.y).toBeLessThan(drift.position.y);
  });

  it('moves slower horizontally in water than walking on land', () => {
    const inWater = new PlayerController({ x: 0, y: 50, z: 0 }, false);
    const onLand = new PlayerController({ x: 0, y: 50, z: 0 }, false);
    inWater.update(0.1, input({ forward: true }), 0, WATER);
    onLand.update(0.1, input({ forward: true }), 0, FLOOR);
    expect(Math.abs(inWater.position.z)).toBeLessThan(Math.abs(onLand.position.z));
  });

  it('ignores water while flying', () => {
    const p = new PlayerController({ x: 0, y: 50, z: 0 }, true);
    p.update(0.1, input(), 0, WATER);
    expect(p.position.y).toBeCloseTo(50, 5); // no buoyancy/gravity while flying
  });
});
