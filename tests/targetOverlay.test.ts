import { describe, it, expect } from 'vitest';
import { TargetOverlay } from '../src/render/TargetOverlay';
import type { ResolvedTarget } from '../src/app/targetPreview';

const placeValid: ResolvedTarget = {
  kind: 'place',
  outline: { x: 2, y: 3, z: 4 },
  ghost: { x: 2, y: 4, z: 4, id: 1 as never, state: 0, valid: true },
};
const placeInvalid: ResolvedTarget = { ...placeValid, ghost: { ...placeValid.ghost, valid: false } };
const toggle: ResolvedTarget = { kind: 'toggle', outline: { x: 2, y: 3, z: 4 }, targetId: 3 as never };

describe('TargetOverlay', () => {
  it('starts hidden', () => {
    const o = new TargetOverlay();
    expect(o.outline.visible).toBe(false);
    expect(o.ghost.visible).toBe(false);
  });

  it('attach() adds both overlays exactly once', () => {
    const o = new TargetOverlay();
    const added: unknown[] = [];
    o.attach((obj) => added.push(obj));
    expect(added).toContain(o.outline);
    expect(added).toContain(o.ghost);
    expect(added).toHaveLength(2);
  });

  it('place: outline + ghost visible and centered on their voxels', () => {
    const o = new TargetOverlay();
    o.apply(placeValid, true);
    expect(o.outline.visible).toBe(true);
    expect(o.ghost.visible).toBe(true);
    expect([o.outline.position.x, o.outline.position.y, o.outline.position.z]).toEqual([2.5, 3.5, 4.5]);
    expect([o.ghost.position.x, o.ghost.position.y, o.ghost.position.z]).toEqual([2.5, 4.5, 4.5]);
  });

  it('invalid place uses a different material than valid (not color-only)', () => {
    const o = new TargetOverlay();
    o.apply(placeValid, true);
    const validMat = o.ghost.material;
    o.apply(placeInvalid, true);
    expect(o.ghost.material).not.toBe(validMat);
  });

  it('toggle target shows outline only, hides ghost', () => {
    const o = new TargetOverlay();
    o.apply(toggle, true);
    expect(o.outline.visible).toBe(true);
    expect(o.ghost.visible).toBe(false);
  });

  it('show=false hides everything', () => {
    const o = new TargetOverlay();
    o.apply(placeValid, true);
    o.apply(placeValid, false);
    expect(o.outline.visible).toBe(false);
    expect(o.ghost.visible).toBe(false);
  });

  it('reuses the same material instances across frames (no per-frame allocation)', () => {
    const o = new TargetOverlay();
    o.apply(placeInvalid, true);
    const m1 = o.ghost.material;
    o.apply(placeValid, true);
    o.apply(placeInvalid, true);
    expect(o.ghost.material).toBe(m1);
  });
});
