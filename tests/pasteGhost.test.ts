import { describe, it, expect } from 'vitest';
import type { InstancedMesh, Object3D } from 'three';
import { PasteGhost, GHOST_VOXEL_CAP } from '../src/render/PasteGhost';
import type { Prefab } from '../src/core/Prefab';

const PREFAB: Prefab = {
  dims: [2, 1, 3],
  blocks: [
    [0, 0, 0, 3],
    [1, 0, 2, 11],
  ],
};

/** The instanced voxel mesh the ghost swapped into the scene (undefined if none). */
function voxelMesh(added: Object3D[]): InstancedMesh | undefined {
  return added.find((o) => (o as InstancedMesh).isInstancedMesh) as InstancedMesh | undefined;
}

function makeGhost(): { ghost: PasteGhost; added: Object3D[] } {
  const ghost = new PasteGhost(new Map([[3, [128, 128, 132] as const]]));
  const added: Object3D[] = [];
  ghost.attach((o) => added.push(o as Object3D));
  return { ghost, added };
}

describe('PasteGhost', () => {
  it('starts hidden with only the outline attached', () => {
    const { ghost, added } = makeGhost();
    expect(ghost.edges.visible).toBe(false);
    expect(added).toEqual([ghost.edges]);
  });

  it('builds one translucent instance per clipboard voxel at the paste origin', () => {
    const { ghost, added } = makeGhost();
    ghost.update(PREFAB, { x: 10, y: 4, z: 20 }, true, 1);
    const mesh = voxelMesh(added);
    expect(mesh?.count).toBe(2);
    expect(mesh?.visible).toBe(true);
    expect([mesh?.position.x, mesh?.position.y, mesh?.position.z]).toEqual([10, 4, 20]);
    // The bounds outline still frames the whole prefab (min corner at origin).
    expect([ghost.edges.scale.x, ghost.edges.scale.y, ghost.edges.scale.z]).toEqual([2, 1, 3]);
    expect([ghost.edges.position.x, ghost.edges.position.y, ghost.edges.position.z]).toEqual([
      11, 4.5, 21.5,
    ]);
  });

  it('repositions without rebuilding while the revision is unchanged', () => {
    const { ghost, added } = makeGhost();
    ghost.update(PREFAB, { x: 0, y: 0, z: 0 }, true, 1);
    const first = voxelMesh(added);
    ghost.update(PREFAB, { x: 5, y: 1, z: 5 }, true, 1);
    expect(voxelMesh(added)).toBe(first); // same mesh, just moved
    expect(first?.position.x).toBe(5);
  });

  it('rebuilds when the revision changes (rotate/mirror/array/copy)', () => {
    const { ghost, added } = makeGhost();
    ghost.update(PREFAB, { x: 0, y: 0, z: 0 }, true, 1);
    const first = voxelMesh(added);
    const rotated: Prefab = { dims: [3, 1, 2], blocks: [[0, 0, 0, 3]] };
    ghost.update(rotated, { x: 0, y: 0, z: 0 }, true, 2);
    const rebuilt = added.filter((o) => (o as InstancedMesh).isInstancedMesh);
    expect(rebuilt[rebuilt.length - 1]).not.toBe(first);
    expect((rebuilt[rebuilt.length - 1] as InstancedMesh).count).toBe(1);
  });

  it('falls back to the outline alone above the voxel cap', () => {
    const { ghost, added } = makeGhost();
    const huge: Prefab = {
      dims: [200, 200, 200],
      blocks: Array.from(
        { length: GHOST_VOXEL_CAP + 1 },
        (_, i) => [i % 200, 0, 0, 3] as Prefab['blocks'][number],
      ),
    };
    ghost.update(huge, { x: 0, y: 0, z: 0 }, true, 1);
    expect(voxelMesh(added)).toBeUndefined();
    expect(ghost.edges.visible).toBe(true);
  });

  it('hides on show=false or missing prefab/origin', () => {
    const { ghost, added } = makeGhost();
    ghost.update(PREFAB, { x: 0, y: 0, z: 0 }, true, 1);
    ghost.update(undefined, { x: 0, y: 0, z: 0 }, true, 1);
    expect(ghost.edges.visible).toBe(false);
    expect(voxelMesh(added)?.visible).toBe(false);
    ghost.update(PREFAB, undefined, true, 1);
    expect(ghost.edges.visible).toBe(false);
    ghost.update(PREFAB, { x: 0, y: 0, z: 0 }, false, 1);
    expect(ghost.edges.visible).toBe(false);
  });
});
