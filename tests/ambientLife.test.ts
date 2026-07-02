import { describe, it, expect } from 'vitest';
import { AmbientLife, isAnchor, kindActive } from '../src/render/AmbientLife';
import { AIR, FLOWER, GRASS, LEAVES, TALL_GRASS, WATER, STONE } from '../src/blocks/blocks';

const CAM = { x: 0, y: 64, z: 0 };

/** World: grass floor at y=63, flowers at y=64 on even cells, leaves slab at y=70. */
function garden(x: number, y: number, z: number): number {
  if (y === 63) return GRASS;
  if (y === 64 && x % 2 === 0 && z % 2 === 0) return FLOWER;
  if (y === 70) return LEAVES;
  return AIR;
}

describe('kindActive', () => {
  it('butterflies fly by day, fireflies by night, leaves always', () => {
    expect(kindActive('butterfly', 1)).toBe(true);
    expect(kindActive('butterfly', 0.2)).toBe(false);
    expect(kindActive('firefly', 0.2)).toBe(true);
    expect(kindActive('firefly', 1)).toBe(false);
    expect(kindActive('leaf', 1)).toBe(true);
    expect(kindActive('leaf', 0.2)).toBe(true);
  });

  it('no overlap: butterflies and fireflies are never out together', () => {
    for (let d = 0; d <= 1; d += 0.05) {
      expect(kindActive('butterfly', d) && kindActive('firefly', d)).toBe(false);
    }
  });
});

describe('isAnchor', () => {
  it('butterflies home on flowers and tall grass only', () => {
    const world = (id: number) => (x: number, y: number, z: number) =>
      x === 0 && y === 0 && z === 0 ? id : AIR;
    expect(isAnchor('butterfly', world(FLOWER), 0, 0, 0)).toBe(true);
    expect(isAnchor('butterfly', world(TALL_GRASS), 0, 0, 0)).toBe(true);
    expect(isAnchor('butterfly', world(GRASS), 0, 0, 0)).toBe(false);
  });

  it('fireflies need grass or water with open air above', () => {
    const openGrass = (_x: number, y: number, _z: number): number => (y === 0 ? GRASS : AIR);
    const cappedGrass = (_x: number, y: number, _z: number): number => (y === 0 ? GRASS : STONE);
    const openWater = (_x: number, y: number, _z: number): number => (y === 0 ? WATER : AIR);
    expect(isAnchor('firefly', openGrass, 0, 0, 0)).toBe(true);
    expect(isAnchor('firefly', cappedGrass, 0, 0, 0)).toBe(false);
    expect(isAnchor('firefly', openWater, 0, 0, 0)).toBe(true);
  });

  it('leaves detach only from canopy undersides (air below)', () => {
    const canopy = (_x: number, y: number, _z: number): number => (y >= 5 ? LEAVES : AIR);
    expect(isAnchor('leaf', canopy, 0, 5, 0)).toBe(true); // air below
    expect(isAnchor('leaf', canopy, 0, 6, 0)).toBe(false); // leaves below
  });
});

describe('AmbientLife population', () => {
  it('spawns butterflies and leaves by day in a garden, no fireflies', () => {
    const life = new AmbientLife(mulberry(7));
    for (let i = 0; i < 4; i++) life.update(1.3, CAM, 1, garden); // several anchor scans
    const census = life.census();
    expect(census.butterfly).toBeGreaterThan(0);
    expect(census.leaf).toBeGreaterThan(0);
    expect(census.firefly).toBe(0);
  });

  it('nightfall swaps butterflies for fireflies', () => {
    const life = new AmbientLife(mulberry(3));
    life.update(0.016, CAM, 1, garden);
    expect(life.census().butterfly).toBeGreaterThan(0);
    // Night: existing butterflies despawn on the next update; fireflies appear on the next scan.
    life.update(0.016, CAM, 0.1, garden);
    expect(life.census().butterfly).toBe(0);
    life.update(1.5, CAM, 0.1, garden); // crosses the scan interval
    expect(life.census().firefly).toBeGreaterThan(0);
  });

  it('spawns nothing in a barren world', () => {
    const life = new AmbientLife(mulberry(5));
    life.update(0.016, CAM, 1, () => AIR);
    life.update(1.5, CAM, 1, () => AIR);
    expect(life.census()).toEqual({ butterfly: 0, firefly: 0, leaf: 0 });
  });

  it('agents despawn when the camera leaves them behind', () => {
    const life = new AmbientLife(mulberry(9));
    life.update(0.016, CAM, 1, garden);
    expect(life.census().butterfly).toBeGreaterThan(0);
    life.update(0.016, { x: 500, y: 64, z: 500 }, 1, () => AIR);
    expect(life.census().butterfly).toBe(0);
  });
});

/** Tiny deterministic PRNG for reproducible sampling in tests. */
function mulberry(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
