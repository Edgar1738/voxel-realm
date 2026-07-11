import { describe, it, expect } from 'vitest';
import { LandmarkDiscovery, DISCOVERY_RADIUS } from '../src/app/landmarkDiscovery';

const LANDMARKS = [
  { name: 'Lighthouse Point', x: 0, y: 70, z: 0 },
  { name: 'The Wreck', x: 100, y: 60, z: 0 },
  { name: 'Sea Cave', x: 0, y: 40, z: 100 },
];

function memoryStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    dump: () => Object.fromEntries(map),
  };
}

describe('LandmarkDiscovery', () => {
  it('discovers a landmark inside the radius, horizontally only', () => {
    const d = new LandmarkDiscovery(LANDMARKS, 'k', memoryStorage());
    expect(d.tick(500, 500)).toEqual([]); // far away
    const found = d.tick(DISCOVERY_RADIUS - 1, 0); // near the lighthouse, y ignored
    expect(found.map((l) => l.name)).toEqual(['Lighthouse Point']);
    expect(d.foundCount).toBe(1);
    expect(d.isFound('Lighthouse Point')).toBe(true);
    expect(d.isFound('The Wreck')).toBe(false);
  });

  it('never rediscovers and reports completion', () => {
    const d = new LandmarkDiscovery(LANDMARKS, 'k', memoryStorage());
    d.tick(0, 0);
    expect(d.tick(0, 0)).toEqual([]); // already found
    expect(d.complete).toBe(false);
    d.tick(100, 0);
    d.tick(0, 100);
    expect(d.complete).toBe(true);
    expect(d.foundCount).toBe(3);
  });

  it('persists to storage and reloads', () => {
    const storage = memoryStorage();
    const first = new LandmarkDiscovery(LANDMARKS, 'vr.landmarksFound.test', storage);
    first.tick(100, 0);
    const second = new LandmarkDiscovery(LANDMARKS, 'vr.landmarksFound.test', storage);
    expect(second.isFound('The Wreck')).toBe(true);
    expect(second.foundCount).toBe(1);
  });

  it('drops stored names that no longer exist in the world meta', () => {
    const storage = memoryStorage({ k: JSON.stringify(['Ghost Tower', 'Sea Cave']) });
    const d = new LandmarkDiscovery(LANDMARKS, 'k', storage);
    expect(d.foundCount).toBe(1); // only Sea Cave survives
    expect(d.isFound('Ghost Tower')).toBe(false);
  });

  it('survives corrupt storage and works without storage at all', () => {
    const corrupt = memoryStorage({ k: '{not json' });
    expect(new LandmarkDiscovery(LANDMARKS, 'k', corrupt).foundCount).toBe(0);
    const none = new LandmarkDiscovery(LANDMARKS, 'k', undefined);
    expect(none.tick(0, 0).length).toBe(1); // still discovers, just not persisted
  });

  it('an empty landmark list is never complete and ticks cheaply', () => {
    const d = new LandmarkDiscovery([], 'k', memoryStorage());
    expect(d.total).toBe(0);
    expect(d.complete).toBe(false);
    expect(d.tick(0, 0)).toEqual([]);
  });
});
