import { describe, it, expect } from 'vitest';
import { tourRoute, tourTick, tourStep, TOUR_ARRIVAL_RADIUS } from '../src/app/tour';
import { REGULAR_USER_MOONSPIRE_META } from './fixtures/curatedMeta';

const ROUTE = [
  { name: 'Start', x: 0, y: 64, z: 0 },
  { name: 'Bridge', x: 20, y: 64, z: 0 },
  { x: 20, y: 64, z: 30 }, // unnamed — HUD falls back to "Waypoint 3"
];

describe('tourRoute', () => {
  it('returns the meta tour when it has 2+ points, else undefined', () => {
    expect(tourRoute(REGULAR_USER_MOONSPIRE_META)).toHaveLength(5);
    expect(tourRoute(undefined)).toBeUndefined();
    expect(tourRoute({ seed: 1, version: 1, preset: 'default' })).toBeUndefined();
    expect(
      tourRoute({ seed: 1, version: 1, preset: 'default', tour: [{ x: 0, y: 0, z: 0 }] }),
    ).toBeUndefined();
  });
});

describe('tourTick', () => {
  it('reports the active waypoint with a horizontal (2D) distance', () => {
    const s = tourTick(ROUTE, 1, 10, 0);
    expect(s).toMatchObject({ index: 1, name: 'Bridge', total: 3, done: false });
    expect(s.distance).toBeCloseTo(10, 5);
  });

  it('ignores the y difference (waypoints on towers still count)', () => {
    // Start sits at y=64; distance is purely horizontal regardless of that height.
    const s = tourTick(ROUTE, 0, 0, 6);
    expect(s.index).toBe(0);
    expect(s.distance).toBeCloseTo(6, 5);
  });

  it('advances past waypoints within the arrival radius, chaining through stacked ones', () => {
    // Standing on Start (also within radius of nothing else) → advance to Bridge.
    const s = tourTick(ROUTE, 0, 1, 0);
    expect(s.index).toBe(1);
    expect(s.name).toBe('Bridge');
  });

  it('completes on arrival at the final waypoint and names unnamed waypoints', () => {
    const s = tourTick(ROUTE, 2, 20, 30 - TOUR_ARRIVAL_RADIUS);
    expect(s.done).toBe(true);
    expect(s.name).toBe('Waypoint 3');
  });

  it('clamps an out-of-range index instead of crashing', () => {
    expect(tourTick(ROUTE, 99, 0, 0).index).toBeLessThan(ROUTE.length);
    expect(tourTick(ROUTE, -5, 500, 500).index).toBe(0);
  });
});

describe('tourStep', () => {
  it('steps forward/backward clamped to the route ends', () => {
    expect(tourStep(ROUTE, 0, -1)).toBe(0);
    expect(tourStep(ROUTE, 0, 1)).toBe(1);
    expect(tourStep(ROUTE, 2, 1)).toBe(2);
  });
});
