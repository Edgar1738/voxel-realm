import { describe, it, expect } from 'vitest';
import { PlayerController, type InputState } from '../src/player/PlayerController';
import type { SoliditySampler } from '../src/player/Collision';

const NEVER: SoliditySampler = { isSolid: () => false };
const FLOOR: SoliditySampler = { isSolid: (_x, y) => y < 0 };

function input(partial: Partial<InputState> = {}): InputState {
  return {
    forward: false,
    back: false,
    left: false,
    right: false,
    up: false,
    down: false,
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
