import { describe, it, expect } from 'vitest';
import {
  parseWaypoint,
  serializeWaypoint,
  loadWaypoint,
  saveWaypoint,
  clearWaypoint,
  waypointKey,
  waypointBearing,
  mapClickToWorld,
  worldToMapPixel,
  nearestWithin,
  WAYPOINT_VERSION,
  WAYPOINT_ARRIVE_DIST,
  type WaypointStore,
} from '../src/app/waypoint';

const HALF_PI = Math.PI / 2;

function fakeStore(init: Record<string, string> = {}): WaypointStore & { data: Record<string, string> } {
  const data = { ...init };
  return {
    data,
    getItem: (k) => data[k] ?? null,
    setItem: (k, v) => {
      data[k] = v;
    },
    removeItem: (k) => {
      delete data[k];
    },
  };
}

describe('waypoint storage', () => {
  it('round-trips and keys per world', () => {
    const store = fakeStore();
    saveWaypoint(store, 'giza', { x: 12, z: -8 });
    expect(store.data[waypointKey('giza')]).toBeDefined();
    expect(loadWaypoint(store, 'giza')).toEqual({ x: 12, z: -8 });
    expect(loadWaypoint(store, 'town')).toBeUndefined();
  });

  it('rejects wrong version, non-finite, non-JSON', () => {
    expect(parseWaypoint(null)).toBeUndefined();
    expect(parseWaypoint('nope')).toBeUndefined();
    expect(parseWaypoint(JSON.stringify({ v: WAYPOINT_VERSION + 1, x: 1, z: 2 }))).toBeUndefined();
    expect(parseWaypoint(JSON.stringify({ v: WAYPOINT_VERSION, x: 'a', z: 2 }))).toBeUndefined();
    expect(parseWaypoint(serializeWaypoint({ x: 1, z: 2 }))).toEqual({ x: 1, z: 2 });
  });

  it('clears one world and fails open when storage throws', () => {
    const store = fakeStore();
    saveWaypoint(store, 'giza', { x: 1, z: 1 });
    clearWaypoint(store, 'giza');
    expect(loadWaypoint(store, 'giza')).toBeUndefined();

    const throwing: WaypointStore = {
      getItem: () => {
        throw new Error('x');
      },
      setItem: () => {
        throw new Error('x');
      },
      removeItem: () => {
        throw new Error('x');
      },
    };
    expect(loadWaypoint(throwing, 'giza')).toBeUndefined();
    expect(() => saveWaypoint(throwing, 'giza', { x: 1, z: 1 })).not.toThrow();
  });
});

describe('waypointBearing', () => {
  it('points at each cardinal correctly while facing north (yaw 0)', () => {
    // yaw 0 faces -Z (map up). 0 = ahead, +pi/2 = right, +/-pi = behind, -pi/2 = left.
    expect(waypointBearing(0, 0, 0, { x: 0, z: -10 }).angle).toBeCloseTo(0); // north = ahead
    expect(waypointBearing(0, 0, 0, { x: 10, z: 0 }).angle).toBeCloseTo(HALF_PI); // east = right
    expect(Math.abs(waypointBearing(0, 0, 0, { x: 0, z: 10 }).angle)).toBeCloseTo(Math.PI); // south = behind
    expect(waypointBearing(0, 0, 0, { x: -10, z: 0 }).angle).toBeCloseTo(-HALF_PI); // west = left
  });

  it('is relative to the look direction', () => {
    // Facing east is yaw -pi/2 (forward = (-sin y, -cos y) = (1, 0)).
    const facingEast = -HALF_PI;
    expect(waypointBearing(0, 0, facingEast, { x: 10, z: 0 }).angle).toBeCloseTo(0); // east now ahead
    expect(waypointBearing(0, 0, facingEast, { x: 0, z: -10 }).angle).toBeCloseTo(-HALF_PI); // north now left
  });

  it('reports horizontal distance and arrival', () => {
    expect(waypointBearing(0, 0, 0, { x: 3, z: 4 }).distance).toBeCloseTo(5);
    expect(waypointBearing(0, 0, 0, { x: WAYPOINT_ARRIVE_DIST - 1, z: 0 }).arrived).toBe(true);
    expect(waypointBearing(0, 0, 0, { x: WAYPOINT_ARRIVE_DIST + 1, z: 0 }).arrived).toBe(false);
  });
});

describe('map coordinate conversion', () => {
  const center = { x: 100, z: 200 };
  const radius = 10;
  const canvasSize = 2 * radius + 1; // 21
  const rect = { left: 0, top: 0, width: 210, height: 210 }; // canvas CSS-scaled 10x

  it('maps a center click back to the map center', () => {
    const c = mapClickToWorld(105, 105, rect, canvasSize, center, radius);
    expect(c).toEqual({ x: 100, z: 200, px: 10, pz: 10 });
  });

  it('maps the top-left corner to center - radius', () => {
    const c = mapClickToWorld(0, 0, rect, canvasSize, center, radius);
    expect(c.x).toBe(center.x - radius);
    expect(c.z).toBe(center.z - radius);
  });

  it('worldToMapPixel is the inverse the drawing uses (center -> radius + 0.5)', () => {
    expect(worldToMapPixel(100, 200, center, radius)).toEqual({ px: 10.5, pz: 10.5 });
  });

  it('nearestWithin picks the closest point inside the radius, else -1', () => {
    const pts = [
      { px: 5, pz: 5 },
      { px: 20, pz: 20 },
    ];
    expect(nearestWithin(6, 6, pts, 3)).toBe(0);
    expect(nearestWithin(21, 19, pts, 3)).toBe(1);
    expect(nearestWithin(12, 12, pts, 3)).toBe(-1); // between both, outside radius
  });
});
