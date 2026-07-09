import { describe, it, expect } from 'vitest';
import { PlayerController, type PlayerWorld } from '../src/player/PlayerController';
import { makeInput } from '../src/player/Simulate';

/** Infinite flat floor at y=0. */
const FLOOR: PlayerWorld = {
  collisionBoxes: (x, y, z) => (y === 0 ? [[x, y, z, x + 1, y + 1, z + 1]] : []),
  isWater: () => false,
};

function runFrames(player: PlayerController, input: ReturnType<typeof makeInput>, frames: number) {
  for (let i = 0; i < frames; i++) player.update(1 / 60, input, 0, FLOOR);
}

function walkDistance(sprint: boolean): number {
  const player = new PlayerController({ x: 0.5, y: 1.9, z: 100.5 }, false);
  runFrames(player, makeInput({ forward: true, sprint }), 120); // 2s
  return 100.5 - player.position.z; // forward at yaw 0 = −Z
}

describe('sprint', () => {
  it('covers ~1.4x the walking distance', () => {
    const walked = walkDistance(false);
    const sprinted = walkDistance(true);
    expect(sprinted / walked).toBeGreaterThan(1.3);
    expect(sprinted / walked).toBeLessThan(1.5);
  });

  it('sets the sprinting flag only while actually sprinting forward', () => {
    const player = new PlayerController({ x: 0.5, y: 1.9, z: 100.5 }, false);
    runFrames(player, makeInput({ forward: true, sprint: true }), 5);
    expect(player.sprinting).toBe(true);
    runFrames(player, makeInput({ forward: true }), 1);
    expect(player.sprinting).toBe(false);
    // sprint intent without forward does nothing
    runFrames(player, makeInput({ sprint: true }), 1);
    expect(player.sprinting).toBe(false);
  });

  it('flying ignores the sprint flag (fly speed already dwarfs it)', () => {
    const player = new PlayerController({ x: 0.5, y: 10, z: 100.5 }, true);
    runFrames(player, makeInput({ forward: true, sprint: true }), 5);
    expect(player.sprinting).toBe(false);
  });
});
