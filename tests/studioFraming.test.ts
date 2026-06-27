import { describe, it, expect } from 'vitest';
import { frameBox } from '../src/app/studioFraming';
import type { Vec3 } from '../src/core/types';

function dist(a: Vec3, b: Vec3): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function expectedDistance(
  min: Vec3,
  max: Vec3,
  fovDegrees: number,
  aspect: number,
  margin = 1.2,
): number {
  const dx = max.x - min.x;
  const dy = max.y - min.y;
  const dz = max.z - min.z;
  const r = 0.5 * Math.sqrt(dx * dx + dy * dy + dz * dz);
  const vfov = (fovDegrees * Math.PI) / 180;
  const hfov = 2 * Math.atan(Math.tan(vfov / 2) * aspect);
  const limiting = Math.min(vfov, hfov);
  if (r === 0) {
    return margin;
  }
  return (r / Math.sin(limiting / 2)) * margin;
}

describe('frameBox', () => {
  it('returns target at the box center', () => {
    const { target } = frameBox({ x: -2, y: 0, z: 4 }, { x: 6, y: 10, z: 8 }, 60, 1.6);
    expect(target.x).toBeCloseTo(2);
    expect(target.y).toBeCloseTo(5);
    expect(target.z).toBeCloseTo(6);
  });

  it('places the eye at the analytically expected distance for a known cube', () => {
    const min: Vec3 = { x: 0, y: 0, z: 0 };
    const max: Vec3 = { x: 2, y: 2, z: 2 };
    const fovDegrees = 50;
    const aspect = 1;
    const { eye, target } = frameBox(min, max, fovDegrees, aspect);
    const expected = expectedDistance(min, max, fovDegrees, aspect);
    expect(dist(eye, target)).toBeCloseTo(expected);
  });

  it('puts the eye along the normalized dir vector from the target', () => {
    const dir: Vec3 = { x: 2, y: 0, z: -1 };
    const { eye, target } = frameBox({ x: 0, y: 0, z: 0 }, { x: 4, y: 4, z: 4 }, 45, 1.5, dir);
    const v: Vec3 = { x: eye.x - target.x, y: eye.y - target.y, z: eye.z - target.z };
    // cross product of v and dir should be ~ zero (parallel vectors)
    const cx = v.y * dir.z - v.z * dir.y;
    const cy = v.z * dir.x - v.x * dir.z;
    const cz = v.x * dir.y - v.y * dir.x;
    expect(cx).toBeCloseTo(0);
    expect(cy).toBeCloseTo(0);
    expect(cz).toBeCloseTo(0);
    // and same direction (positive dot product)
    const dot = v.x * dir.x + v.y * dir.y + v.z * dir.z;
    expect(dot).toBeGreaterThan(0);
  });

  it('roughly doubles the eye-target distance when box dimensions double', () => {
    const fovDegrees = 60;
    const aspect = 1.5;
    const small = frameBox({ x: 0, y: 0, z: 0 }, { x: 1, y: 1, z: 1 }, fovDegrees, aspect);
    const big = frameBox({ x: 0, y: 0, z: 0 }, { x: 2, y: 2, z: 2 }, fovDegrees, aspect);
    const dSmall = dist(small.eye, small.target);
    const dBig = dist(big.eye, big.target);
    expect(dBig / dSmall).toBeCloseTo(2);
  });

  it('yields a smaller distance for a larger fov, all else equal', () => {
    const min: Vec3 = { x: 0, y: 0, z: 0 };
    const max: Vec3 = { x: 3, y: 3, z: 3 };
    const aspect = 1.4;
    const narrow = frameBox(min, max, 40, aspect);
    const wide = frameBox(min, max, 80, aspect);
    expect(dist(wide.eye, wide.target)).toBeLessThan(dist(narrow.eye, narrow.target));
  });

  it('places the default-dir eye above the box center', () => {
    const { eye, target } = frameBox({ x: 0, y: 0, z: 0 }, { x: 5, y: 5, z: 5 }, 55, 1.3);
    expect(eye.y).toBeGreaterThan(target.y);
  });

  it('yields a larger distance for a portrait aspect than for aspect 1', () => {
    const min: Vec3 = { x: 0, y: 0, z: 0 };
    const max: Vec3 = { x: 2, y: 2, z: 2 };
    const fovDegrees = 50;
    const square = frameBox(min, max, fovDegrees, 1);
    const portrait = frameBox(min, max, fovDegrees, 0.5);
    expect(dist(portrait.eye, portrait.target)).toBeGreaterThan(dist(square.eye, square.target));
  });

  it('keeps eye distinct from target for a degenerate zero-size box', () => {
    const p: Vec3 = { x: 1, y: 1, z: 1 };
    const margin = 1.2;
    const { eye, target } = frameBox(p, p, 60, 1, undefined, margin);
    expect(dist(eye, target)).toBeCloseTo(margin);
    expect(target).toEqual(p);
  });
});
