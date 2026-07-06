import { describe, it, expect } from 'vitest';
import { lookDirectionFromYawPitch, interactionRay, clipCameraDistance } from '../src/app/aim';
import { raycastVoxels } from '../src/edit/VoxelRaycast';
import { AIR } from '../src/blocks/blocks';

describe('lookDirectionFromYawPitch', () => {
  it('points along −Z at yaw/pitch 0', () => {
    const d = lookDirectionFromYawPitch(0, 0);
    expect(d.x).toBeCloseTo(0, 6);
    expect(d.y).toBeCloseTo(0, 6);
    expect(d.z).toBeCloseTo(-1, 6);
  });

  it('yaws toward −X and pitches toward +Y', () => {
    const d = lookDirectionFromYawPitch(Math.PI / 2, 0);
    expect(d.x).toBeCloseTo(-1, 6);
    expect(d.z).toBeCloseTo(0, 6);

    const up = lookDirectionFromYawPitch(0, Math.PI / 4);
    expect(up.y).toBeCloseTo(Math.sin(Math.PI / 4), 6);
  });

  it('returns a unit vector', () => {
    const d = lookDirectionFromYawPitch(1.3, -0.6);
    expect(Math.hypot(d.x, d.y, d.z)).toBeCloseTo(1, 6);
  });
});

describe('interactionRay', () => {
  it('originates at the eye, not the camera', () => {
    const eye = { x: 3, y: 64, z: -7 };
    const ray = interactionRay(eye, 0.4, -0.1);
    expect(ray.origin).toBe(eye);
    expect(ray.dir).toEqual(lookDirectionFromYawPitch(0.4, -0.1));
  });

  it('hits the same block regardless of where the render camera sits (reach unchanged)', () => {
    // A single solid voxel straight ahead of the eye.
    const sampler = {
      getBlock: (x: number, y: number, z: number) => (x === 0 && y === 0 && z === -5 ? 1 : AIR),
    };
    const eye = { x: 0.5, y: 0.5, z: 0.5 };
    const ray = interactionRay(eye, 0, 0); // looking −Z
    const hit = raycastVoxels(sampler, ray.origin, ray.dir, 8);
    // The ray uses only the eye + look; a third-person camera offset never enters raycastVoxels.
    expect(hit?.block).toEqual({ x: 0, y: 0, z: -5 });
  });
});

describe('clipCameraDistance', () => {
  it('returns the full distance when the path is clear', () => {
    expect(clipCameraDistance(() => false, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: -1 }, 4)).toBe(4);
  });

  it('stops short of a wall behind the player', () => {
    // Solid only at the cell two blocks back along −Z.
    const isSolid = (x: number, y: number, z: number) => x === 0 && y === 0 && z === -2;
    const d = clipCameraDistance(isSolid, { x: 0.5, y: 0.5, z: 0.5 }, { x: 0, y: 0, z: -1 }, 4);
    expect(d).toBeLessThan(4);
    expect(d).toBeCloseTo(1.45, 5); // 1.75 marched − 0.3 margin
  });

  it('never collapses below the minimum standoff', () => {
    const d = clipCameraDistance(() => true, { x: 0.5, y: 0.5, z: 0.5 }, { x: 0, y: 0, z: -1 }, 4);
    expect(d).toBeGreaterThanOrEqual(0.4);
  });
});
