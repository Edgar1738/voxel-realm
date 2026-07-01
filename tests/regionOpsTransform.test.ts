// tests/regionOpsTransform.test.ts
//
// Regression tests for the DevControls __vr.mirror / __vr.rotate fix: both ops must clear the
// source box before pasting the transformed result, within one edit.group() so a single undo()
// restores the exact original state. This mirrors __vr.move's clear-then-paste pattern, exercised
// here directly against EditService + RegionOps/Prefab (the same primitives DevControls composes)
// rather than through the full installDevControls() wiring.
import { describe, it, expect } from 'vitest';
import { EditService } from '../src/edit/EditService';
import type { EditableWorld, SetVoxel, VoxelChange } from '../src/edit/EditTypes';
import { AIR, STONE, GRASS } from '../src/blocks/blocks';
import { boxVoxels } from '../src/edit/Brushes';
import { captureRegion, prefabToVoxels } from '../src/app/RegionOps';
import { rotateY, mirror as mirrorPrefab } from '../src/core/Prefab';

/** A Map-backed fake world implementing EditableWorld (same shape as editService.test.ts). */
function makeFakeWorld(initial: Record<string, number> = {}): EditableWorld & {
  store: Map<string, number>;
} {
  const store = new Map<string, number>(Object.entries(initial).map(([k, v]) => [k, v]));
  const key = (x: number, y: number, z: number): string => `${x},${y},${z}`;
  return {
    store,
    applyEdits(edits: SetVoxel[]): VoxelChange[] {
      const changes: VoxelChange[] = [];
      for (const edit of edits) {
        const before = store.get(key(edit.x, edit.y, edit.z)) ?? AIR;
        if (before === edit.id) continue;
        store.set(key(edit.x, edit.y, edit.z), edit.id);
        changes.push({
          x: edit.x,
          y: edit.y,
          z: edit.z,
          before,
          after: edit.id,
          beforeState: 0,
          afterState: 0,
        });
      }
      return changes;
    },
    canApply(): boolean {
      return true;
    },
  };
}

/** Snapshot every voxel in a box (inclusive corners, order-independent) as a coord->id map. */
function snapshotBox(
  world: Map<string, number>,
  x1: number,
  z1: number,
  x2: number,
  z2: number,
): Record<string, number> {
  const [ax, bx] = [Math.min(x1, x2), Math.max(x1, x2)];
  const [az, bz] = [Math.min(z1, z2), Math.max(z1, z2)];
  const out: Record<string, number> = {};
  for (let x = ax; x <= bx; x++)
    for (let z = az; z <= bz; z++) out[`${x},0,${z}`] = world.get(`${x},0,${z}`) ?? AIR;
  return out;
}

describe('mirror/rotate: clear-then-paste (no residual source voxels)', () => {
  it('rotate on a non-square box leaves no residue outside the new footprint, and one undo restores the original', () => {
    // A 2(x) x 1(y) x 1(z) box: (0,0,0)=STONE, (1,0,0)=GRASS.
    const world = makeFakeWorld({ '0,0,0': STONE, '1,0,0': GRASS });
    const service = new EditService(world);
    const read = (x: number, y: number, z: number): number =>
      world.store.get(`${x},${y},${z}`) ?? AIR;

    const before = snapshotBox(world.store, -1, -1, 2, 2);

    service.group(() => {
      const bp = captureRegion(read, { x1: 0, y1: 0, z1: 0, x2: 1, y2: 0, z2: 0 });
      const clear = boxVoxels({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }).map((v) => ({
        ...v,
        id: AIR,
      }));
      const paste = prefabToVoxels(rotateY(bp, 1), 0, 0, 0);
      service.apply([...clear, ...paste]);
    });

    // 90-degree rotation of a 2x1x1 (x by z) box yields a 1x1x2 footprint at the same origin:
    // (0,0,0)=GRASS, (0,0,1)=STONE. The old x=1,z=0 cell (outside the new footprint) must be AIR.
    expect(world.store.get('0,0,0')).toBe(GRASS);
    expect(world.store.get('0,0,1')).toBe(STONE);
    expect(world.store.get('1,0,0')).toBe(AIR); // no residual source voxel

    // Single undo() restores the exact original state.
    expect(service.undo()).toBe('ok');
    expect(snapshotBox(world.store, -1, -1, 2, 2)).toEqual(before);
  });

  it('mirror (out-of-place across a wider box) leaves no residue, and one undo restores the original', () => {
    // Mirror doesn't change footprint shape, but verify the clear+paste contract holds and undo
    // is exact even when the source box is non-square.
    const world = makeFakeWorld({ '0,0,0': STONE, '1,0,0': GRASS, '0,0,1': AIR, '1,0,1': STONE });
    const service = new EditService(world);
    const read = (x: number, y: number, z: number): number =>
      world.store.get(`${x},${y},${z}`) ?? AIR;

    const before = snapshotBox(world.store, -1, -1, 2, 2);

    service.group(() => {
      const bp = captureRegion(read, { x1: 0, y1: 0, z1: 0, x2: 1, y2: 0, z2: 1 });
      const clear = boxVoxels({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 1 }).map((v) => ({
        ...v,
        id: AIR,
      }));
      const paste = prefabToVoxels(mirrorPrefab(bp, 'x'), 0, 0, 0);
      service.apply([...clear, ...paste]);
    });

    // Mirrored across x: column x=0 <-> x=1 swap within the box.
    expect(world.store.get('0,0,0')).toBe(GRASS);
    expect(world.store.get('1,0,0')).toBe(STONE);
    expect(world.store.get('0,0,1')).toBe(STONE);
    expect(world.store.get('1,0,1')).toBe(AIR);

    expect(service.undo()).toBe('ok');
    expect(snapshotBox(world.store, -1, -1, 2, 2)).toEqual(before);
  });
});
