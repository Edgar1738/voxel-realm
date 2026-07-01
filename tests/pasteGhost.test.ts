import { describe, it, expect } from 'vitest';
import { PasteGhost } from '../src/render/PasteGhost';

describe('PasteGhost', () => {
  it('starts hidden and attaches both objects once', () => {
    const o = new PasteGhost();
    expect(o.mesh.visible).toBe(false);
    expect(o.edges.visible).toBe(false);
    const added: unknown[] = [];
    o.attach((m) => added.push(m));
    expect(added).toContain(o.mesh);
    expect(added).toContain(o.edges);
    expect(added).toHaveLength(2);
  });

  it('positions the footprint with min corner at origin', () => {
    const o = new PasteGhost();
    o.update([2, 1, 3], { x: 10, y: 4, z: 20 }, true);
    expect(o.mesh.visible).toBe(true);
    expect([o.mesh.scale.x, o.mesh.scale.y, o.mesh.scale.z]).toEqual([2, 1, 3]);
    expect([o.mesh.position.x, o.mesh.position.y, o.mesh.position.z]).toEqual([11, 4.5, 21.5]);
    expect([o.edges.position.x, o.edges.position.y, o.edges.position.z]).toEqual([11, 4.5, 21.5]);
  });

  it('hides on show=false or missing dims/origin', () => {
    const o = new PasteGhost();
    o.update([1, 1, 1], { x: 0, y: 0, z: 0 }, true);
    o.update(undefined, { x: 0, y: 0, z: 0 }, true);
    expect(o.mesh.visible).toBe(false);
    o.update([1, 1, 1], undefined, true);
    expect(o.mesh.visible).toBe(false);
    o.update([1, 1, 1], { x: 0, y: 0, z: 0 }, false);
    expect(o.mesh.visible).toBe(false);
  });
});
