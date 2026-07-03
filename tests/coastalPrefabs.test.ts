import { describe, it, expect } from 'vitest';
import { lighthouse, rowboat, shipwreck, fishingHut, buoy } from '../src/worldgen/coastalPrefabs';
import { validatePrefab } from '../src/core/Prefab';
import {
  AIR,
  BLOCK_DEFS,
  SNOW,
  BRICK,
  GLASS,
  GLOWSTONE,
  PLANKS,
  PLANK_SLAB,
  WOOD,
  SAND,
  LANTERN,
  OAK_FENCE,
} from '../src/blocks/blocks';

const ALL = [
  ['lighthouse', lighthouse],
  ['rowboat', rowboat],
  ['shipwreck', shipwreck],
  ['fishingHut', fishingHut],
  ['buoy', buoy],
] as const;

const KNOWN_IDS = new Set(BLOCK_DEFS.map((d) => d.id));

// ---------------------------------------------------------------------------
// Structural invariant: every prefab must pass validatePrefab (null = valid)
// ---------------------------------------------------------------------------
describe('coastalPrefabs — validatePrefab', () => {
  for (const [name, make] of ALL) {
    it(`${name}: validatePrefab returns null (fully valid)`, () => {
      expect(validatePrefab(make())).toBeNull();
    });
  }
});

// ---------------------------------------------------------------------------
// dims bounds + known ids: non-empty, inside dims, only real block ids
// ---------------------------------------------------------------------------
describe('coastalPrefabs — all blocks within dims, all ids known', () => {
  for (const [name, make] of ALL) {
    it(`${name}: blocks.length > 0, all within dims, all ids in BLOCK_DEFS`, () => {
      const p = make();
      const [sx, sy, sz] = p.dims;
      expect(p.blocks.length).toBeGreaterThan(0);
      for (const [dx, dy, dz, id] of p.blocks) {
        expect(dx >= 0 && dx < sx, `dx=${dx} out of [0,${sx})`).toBe(true);
        expect(dy >= 0 && dy < sy, `dy=${dy} out of [0,${sy})`).toBe(true);
        expect(dz >= 0 && dz < sz, `dz=${dz} out of [0,${sz})`).toBe(true);
        expect(KNOWN_IDS.has(id), `unknown block id ${id}`).toBe(true);
      }
    });
  }
});

// ---------------------------------------------------------------------------
// Targeted asserts
// ---------------------------------------------------------------------------
describe('coastalPrefabs — targeted properties', () => {
  it('lighthouse is a tall tower (dims[1] >= 12) with striped SNOW/BRICK bands', () => {
    const p = lighthouse();
    expect(p.dims[1]).toBeGreaterThanOrEqual(12);
    expect(p.blocks.some(([, , , id]) => id === SNOW)).toBe(true);
    expect(p.blocks.some(([, , , id]) => id === BRICK)).toBe(true);
  });

  it('lighthouse has a glass lamp room with a GLOWSTONE light near the top', () => {
    const p = lighthouse();
    const topThird = (p.dims[1] * 2) / 3;
    expect(p.blocks.some(([, y, , id]) => id === GLASS && y > topThird)).toBe(true);
    expect(p.blocks.some(([, y, , id]) => id === GLOWSTONE && y > topThird)).toBe(true);
  });

  it('lighthouse has a doorway (explicit AIR) at the base', () => {
    const { blocks } = lighthouse();
    expect(blocks.some(([, y, , id]) => id === AIR && y <= 2)).toBe(true);
  });

  it('rowboat is tiny and has a hollow interior (explicit AIR inside the hull)', () => {
    const p = rowboat();
    expect(p.dims[0]).toBeLessThanOrEqual(5);
    expect(p.dims[1]).toBeLessThanOrEqual(2);
    expect(p.dims[2]).toBeLessThanOrEqual(3);
    expect(p.blocks.some(([, , , id]) => id === AIR)).toBe(true);
    expect(p.blocks.some(([, , , id]) => id === PLANKS)).toBe(true);
  });

  it('shipwreck is a long hull (dims[0] >= 10) with a WOOD keel and rot gaps', () => {
    const p = shipwreck();
    expect(p.dims[0]).toBeGreaterThanOrEqual(10);
    const keel = p.blocks.filter(([, y, z, id]) => id === WOOD && y === 0 && z === 2);
    expect(keel.length).toBeGreaterThan(5);
    expect(keel.length).toBeLessThan(p.dims[0]); // snapped — at least one gap
  });

  it('shipwreck is silted with SAND and lists to one side (port rises higher)', () => {
    const { blocks } = shipwreck();
    expect(blocks.some(([, , , id]) => id === SAND)).toBe(true);
    const maxY = (z: number): number =>
      Math.max(0, ...blocks.filter(([, , bz]) => bz === z).map(([, y]) => y));
    expect(maxY(0)).toBeGreaterThan(maxY(4));
  });

  it('fishingHut stands on WOOD stilts with the platform 3 up (clear of water level)', () => {
    const { blocks } = fishingHut();
    expect(blocks.some(([, y, , id]) => id === WOOD && y === 0)).toBe(true);
    expect(blocks.some(([, y, , id]) => id === PLANKS && y === 3)).toBe(true);
  });

  it('fishingHut has a lantern, a fence railing, a slab roof, and a hollow hut interior', () => {
    const p = fishingHut();
    expect(p.blocks.some(([, , , id]) => id === LANTERN)).toBe(true);
    expect(p.blocks.some(([, , , id]) => id === OAK_FENCE)).toBe(true);
    expect(p.blocks.some(([, , , id]) => id === PLANK_SLAB)).toBe(true);
    const [sx, sy, sz] = p.dims;
    const interiorAir = p.blocks.filter(
      ([x, y, z, id]) =>
        id === AIR && x > 0 && x < sx - 1 && y > 0 && y < sy - 1 && z > 0 && z < sz - 1,
    );
    expect(interiorAir.length).toBeGreaterThan(0);
  });

  it('buoy is a cheap scatter piece: tiny footprint, LANTERN on top', () => {
    const p = buoy();
    expect(p.dims[0]).toBeLessThanOrEqual(3);
    expect(p.dims[2]).toBeLessThanOrEqual(3);
    expect(p.blocks.length).toBeLessThan(12);
    const topY = p.dims[1] - 1;
    expect(p.blocks.some(([, y, , id]) => id === LANTERN && y === topY)).toBe(true);
  });
});
