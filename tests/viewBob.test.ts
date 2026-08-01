import { describe, expect, it } from 'vitest';
import { ViewBob } from '../src/app/ViewBob';

describe('ViewBob', () => {
  it('stays neutral while inactive', () => {
    const bob = new ViewBob();
    expect(bob.step(1 / 60, 0.1, false, 0)).toEqual({ x: 0, y: 0, z: 0 });
  });

  it('produces bounded stride offsets and eases out after movement stops', () => {
    const bob = new ViewBob();
    const moving = bob.step(1 / 60, 0.2, true, Math.PI / 2);
    expect(Math.abs(moving.x)).toBeLessThanOrEqual(0.022);
    expect(Math.abs(moving.y)).toBeLessThanOrEqual(0.042);
    expect(Math.abs(moving.z)).toBeLessThanOrEqual(0.022);

    const stopping = bob.step(1 / 60, 0, false, Math.PI / 2);
    expect(Math.abs(stopping.y)).toBeLessThanOrEqual(Math.abs(moving.y));
  });
});
