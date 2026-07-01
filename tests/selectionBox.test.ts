import { describe, it, expect } from 'vitest';
import { SelectionBox } from '../src/render/SelectionBox';

describe('SelectionBox', () => {
  it('starts hidden', () => {
    expect(new SelectionBox().mesh.visible).toBe(false);
  });

  it('attach adds the mesh once', () => {
    const o = new SelectionBox();
    const added: unknown[] = [];
    o.attach((m) => added.push(m));
    expect(added).toEqual([o.mesh]);
  });

  it('update centers and scales to the inclusive voxel span', () => {
    const o = new SelectionBox();
    // voxels 0..1 on x, 0..0 on y, 0..3 on z → size (2,1,4), center (1, 0.5, 2)
    o.update({ x1: 1, y1: 0, z1: 3, x2: 0, y2: 0, z2: 0 }, true);
    expect(o.mesh.visible).toBe(true);
    expect([o.mesh.scale.x, o.mesh.scale.y, o.mesh.scale.z]).toEqual([2, 1, 4]);
    expect([o.mesh.position.x, o.mesh.position.y, o.mesh.position.z]).toEqual([1, 0.5, 2]);
  });

  it('hides on show=false or undefined box', () => {
    const o = new SelectionBox();
    o.update({ x1: 0, y1: 0, z1: 0, x2: 0, y2: 0, z2: 0 }, true);
    o.update(undefined, true);
    expect(o.mesh.visible).toBe(false);
    o.update({ x1: 0, y1: 0, z1: 0, x2: 0, y2: 0, z2: 0 }, false);
    expect(o.mesh.visible).toBe(false);
  });
});
