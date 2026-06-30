import { describe, it, expect } from 'vitest';
import { roamStep, RoamDriver } from '../src/app/RoamBench';

/** Runs roamStep across a dt sequence until done; returns total advance. */
function runPath(distance: number, speed: number, dts: number[]): number {
  let remaining = distance;
  let total = 0;
  for (const dt of dts) {
    if (remaining <= 0) break;
    const r = roamStep(remaining, speed, dt);
    expect(r.advance).toBeLessThanOrEqual(remaining + 1e-9); // never overshoots
    total += r.advance;
    remaining = r.remaining;
  }
  return total;
}

describe('roamStep', () => {
  it('advances by speed*dt while distance remains', () => {
    expect(roamStep(10, 5, 1)).toEqual({ advance: 5, remaining: 5, done: false });
  });

  it('caps the final step to the remaining distance and reports done', () => {
    expect(roamStep(3, 5, 1)).toEqual({ advance: 3, remaining: 0, done: true });
  });

  it('covers the same total distance regardless of frame-rate partition', () => {
    const coarse = runPath(10, 5, [1, 1, 1]); // 5,5
    const fine = runPath(10, 5, [0.5, 0.5, 0.5, 0.5, 0.5]); // 2.5 x4
    expect(coarse).toBeCloseTo(10, 9);
    expect(fine).toBeCloseTo(10, 9);
  });
});

describe('RoamDriver', () => {
  it('advances the player along the chosen axis and resolves when the distance is covered', async () => {
    const player = { position: { x: 1, y: 2, z: 3 } };
    const driver = new RoamDriver(player);

    let resolved = false;
    const done = driver.start({ axis: 'x', distance: 10, speed: 5 }).then(() => {
      resolved = true;
    });

    expect(driver.active).toBe(true);
    driver.step(1);
    expect(player.position.x).toBe(6);
    expect(resolved).toBe(false);

    driver.step(1);
    expect(player.position.x).toBe(11);
    await done;
    expect(resolved).toBe(true);
    expect(driver.active).toBe(false);
  });

  it('drives the z axis and never overshoots the target', async () => {
    const player = { position: { x: 0, y: 0, z: 0 } };
    const driver = new RoamDriver(player);
    const done = driver.start({ axis: 'z', distance: 7, speed: 5 });

    driver.step(1); // +5 -> z=5
    expect(player.position.z).toBe(5);
    driver.step(1); // capped +2 -> z=7
    expect(player.position.z).toBe(7);
    await done;
    expect(driver.active).toBe(false);
  });

  it('ignores step() when no roam is active', () => {
    const player = { position: { x: 4, y: 0, z: 0 } };
    const driver = new RoamDriver(player);
    driver.step(1);
    expect(player.position.x).toBe(4);
  });
});
