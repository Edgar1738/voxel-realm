import { describe, it, expect } from 'vitest';
import { TourMarker } from '../src/render/TourMarker';

describe('TourMarker', () => {
  it('starts hidden and attaches beam + pad once', () => {
    const m = new TourMarker();
    expect(m.beam.visible).toBe(false);
    expect(m.pad.visible).toBe(false);
    const added: unknown[] = [];
    m.attach((o) => added.push(o));
    expect(added).toContain(m.beam);
    expect(added).toContain(m.pad);
    expect(added).toHaveLength(2);
  });

  it('centers the pad/beam on the waypoint block footprint', () => {
    const m = new TourMarker();
    m.update({ x: 10, y: 64, z: 20 }, true);
    expect(m.beam.visible).toBe(true);
    expect(m.pad.visible).toBe(true);
    expect(m.pad.position.x).toBeCloseTo(10.5, 5);
    expect(m.pad.position.z).toBeCloseTo(20.5, 5);
    expect(m.beam.position.x).toBeCloseTo(10.5, 5);
    expect(m.beam.position.z).toBeCloseTo(20.5, 5);
    // Beam rises from the pad; both share the same horizontal center.
    expect(m.beam.position.y).toBeGreaterThan(m.pad.position.y);
  });

  it('hides when show is false or point is missing', () => {
    const m = new TourMarker();
    m.update({ x: 0, y: 0, z: 0 }, true);
    m.update(undefined, true);
    expect(m.beam.visible).toBe(false);
    expect(m.pad.visible).toBe(false);
    m.update({ x: 0, y: 0, z: 0 }, false);
    expect(m.beam.visible).toBe(false);
  });

  it('dispose frees materials without throwing', () => {
    const m = new TourMarker();
    m.update({ x: 1, y: 2, z: 3 }, true);
    expect(() => m.dispose()).not.toThrow();
  });
});
