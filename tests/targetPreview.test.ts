import { describe, it, expect } from 'vitest';
import { resolveTarget, type PreviewDeps } from '../src/app/targetPreview';
import type { VoxelRaycastHit } from '../src/edit/VoxelRaycast';

const CUBE = 1 as const;
const STAIR = 2 as const;
const GATE = 3 as const;
const PLANT = 4 as const;

function hit(id: number, block = { x: 5, y: 6, z: 7 }, adjacent = { x: 5, y: 7, z: 7 }): VoxelRaycastHit {
  return { block, adjacent, normal: { x: 0, y: 1, z: 0 }, id: id as never };
}

const deps: PreviewDeps = {
  isToggleable: (id) => id === GATE,
  shapeOf: (id) => (id === STAIR ? 'stair' : id === GATE ? 'gate' : id === PLANT ? 'cross' : 'cube'),
  stateFromYaw: () => 3,
  canPlaceAt: (x) => x >= 0, // simulate unloaded/out-of-range when x < 0
};

describe('resolveTarget', () => {
  it('normal adjacent placement: outline on target, valid ghost on adjacent', () => {
    const r = resolveTarget(hit(CUBE), CUBE as never, 0, deps);
    expect(r.kind).toBe('place');
    expect(r.outline).toEqual({ x: 5, y: 6, z: 7 });
    if (r.kind === 'place') {
      expect(r.ghost).toEqual({ x: 5, y: 7, z: 7, id: CUBE, state: 0, valid: true });
    }
  });

  it('toggleable target (gate) resolves to toggle with outline and no ghost', () => {
    const r = resolveTarget(hit(GATE), CUBE as never, 0, deps);
    expect(r.kind).toBe('toggle');
    expect(r.outline).toEqual({ x: 5, y: 6, z: 7 });
    if (r.kind === 'toggle') expect(r.targetId).toBe(GATE);
  });

  it('stair/gate selected block gets yaw-derived state', () => {
    const r = resolveTarget(hit(CUBE), STAIR as never, 1.2, deps);
    if (r.kind === 'place') expect(r.ghost.state).toBe(3);
  });

  it('unloaded/out-of-range adjacent target is marked invalid, not hidden', () => {
    const r = resolveTarget(hit(CUBE, { x: 5, y: 6, z: 7 }, { x: -1, y: 7, z: 7 }), CUBE as never, 0, deps);
    if (r.kind === 'place') {
      expect(r.ghost.valid).toBe(false);
      expect(r.ghost).toMatchObject({ x: -1, y: 7, z: 7 });
    }
  });

  it('zero-collision block (plant) still yields a usable outline + ghost', () => {
    const r = resolveTarget(hit(PLANT), PLANT as never, 0, deps);
    expect(r.kind).toBe('place');
    if (r.kind === 'place') expect(r.ghost.valid).toBe(true);
  });
});
