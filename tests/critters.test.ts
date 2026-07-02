import { describe, it, expect } from 'vitest';
import { Critters, critterAnchor, fleeDirection, FLEE_RADIUS } from '../src/render/Critters';
import { AIR, GRASS, LEAVES, STONE, WATER } from '../src/blocks/blocks';

const CAM = { x: 0, y: 64, z: 0 };
const FAR_PLAYER = { x: 100, y: 64, z: 100 };

/** Meadow with a pond: grass plane at y=63, water pool 3 deep at x,z in [6,12]. */
function meadow(x: number, y: number, z: number): number {
  const pond = x >= 6 && x <= 12 && z >= 6 && z <= 12;
  if (pond && y >= 61 && y <= 63) return WATER;
  if (y === 63) return GRASS;
  if (y < 63) return STONE;
  return AIR;
}

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

function settle(
  critters: Critters,
  env: { getBlock: typeof meadow; player: typeof FAR_PLAYER },
): void {
  for (let i = 0; i < 4; i++) critters.update(1.7, CAM, env);
}

describe('critterAnchor', () => {
  it('birds perch on grass or leaf tops with headroom', () => {
    const tree = (_x: number, y: number, _z: number): number => (y === 5 ? LEAVES : AIR);
    expect(critterAnchor('bird', tree, 0, 5, 0)).toBe(true);
    expect(critterAnchor('bird', meadow, 0, 63, 0)).toBe(true);
    expect(critterAnchor('rabbit', tree, 0, 5, 0)).toBe(false); // rabbits don't climb trees
  });

  it('fish need open water above them (2-deep)', () => {
    expect(critterAnchor('fish', meadow, 8, 61, 8)).toBe(true); // deep pond cell
    expect(critterAnchor('fish', meadow, 8, 63, 8)).toBe(false); // surface, air above
  });
});

describe('fleeDirection', () => {
  it('points directly away from the player', () => {
    const [dx, dz] = fleeDirection(5, 0, 2, 0);
    expect(dx).toBeCloseTo(1);
    expect(dz).toBeCloseTo(0);
  });

  it('degrades gracefully when standing on the player', () => {
    const [dx, dz] = fleeDirection(3, 3, 3, 3);
    expect(Math.hypot(dx, dz)).toBeCloseTo(1);
  });
});

describe('Critters population & behavior', () => {
  it('populates a meadow with birds, rabbits and pond fish', () => {
    const critters = new Critters(() => {}, mulberry(11));
    settle(critters, { getBlock: meadow, player: FAR_PLAYER });
    const census = critters.census();
    expect(census.bird).toBeGreaterThan(0);
    expect(census.rabbit).toBeGreaterThan(0);
    expect(census.fish).toBeGreaterThan(0);
  });

  it('spawns no fish without water and no critters in a barren world', () => {
    const dry = (_x: number, y: number, _z: number): number => (y === 63 ? GRASS : AIR);
    const critters = new Critters(() => {}, mulberry(13));
    settle(critters, { getBlock: dry, player: FAR_PLAYER });
    expect(critters.census().fish).toBe(0);

    const barren = new Critters(() => {}, mulberry(17));
    settle(barren, { getBlock: () => STONE, player: FAR_PLAYER });
    expect(barren.census()).toEqual({ bird: 0, fish: 0, rabbit: 0 });
  });

  it('a nearby player startles critters into moving away', () => {
    const critters = new Critters(() => {}, mulberry(19));
    const calm = { getBlock: meadow, player: FAR_PLAYER };
    settle(critters, calm);
    // Let everyone finish their current move and go idle.
    for (let i = 0; i < 40; i++) critters.update(0.25, CAM, calm);
    const positionsOf = (): Map<string, { x: number; z: number }> => {
      const snapshot = new Map<string, { x: number; z: number }>();
      (
        critters as unknown as { critters: { kind: string; pos: { x: number; z: number } }[] }
      ).critters.forEach((c, i) => snapshot.set(`${c.kind}${i}`, { x: c.pos.x, z: c.pos.z }));
      return snapshot;
    };
    const before = positionsOf();
    expect(before.size).toBeGreaterThan(0);
    // Drop the player onto the first critter.
    const first = [...before.values()][0];
    const scary = { getBlock: meadow, player: { x: first.x, y: 64, z: first.z } };
    let moved = 0;
    for (let i = 0; i < 30; i++) critters.update(0.1, CAM, scary);
    const after = positionsOf();
    for (const [key, p] of before) {
      const q = after.get(key);
      if (q && Math.hypot(q.x - p.x, q.z - p.z) > 0.5) moved++;
    }
    expect(moved).toBeGreaterThan(0);
    // And whoever was under the player is now outside the flee radius or moving out.
    const distances = [...after.values()].map((q) =>
      Math.hypot(q.x - scary.player.x, q.z - scary.player.z),
    );
    expect(Math.max(...distances)).toBeGreaterThan(FLEE_RADIUS * 0.8);
  });

  it('fish never leave the pond', () => {
    const critters = new Critters(() => {}, mulberry(23));
    const env = { getBlock: meadow, player: FAR_PLAYER };
    settle(critters, env);
    for (let i = 0; i < 400; i++) critters.update(0.12, CAM, env);
    const list = (
      critters as unknown as {
        critters: { kind: string; pos: { x: number; y: number; z: number } }[];
      }
    ).critters;
    const fish = list.filter((c) => c.kind === 'fish');
    expect(fish.length).toBeGreaterThan(0);
    for (const f of fish) {
      // Body center stays inside the pond volume (a lerp can graze the rim cell).
      expect(f.pos.x).toBeGreaterThan(5.5);
      expect(f.pos.x).toBeLessThan(13.5);
      expect(f.pos.y).toBeGreaterThan(60.5);
      expect(f.pos.y).toBeLessThan(64.5);
    }
  });

  it('critters despawn when left behind', () => {
    const critters = new Critters(() => {}, mulberry(29));
    settle(critters, { getBlock: meadow, player: FAR_PLAYER });
    expect(critters.census().bird + critters.census().rabbit).toBeGreaterThan(0);
    critters.update(
      0.016,
      { x: 400, y: 64, z: 400 },
      { getBlock: () => STONE, player: FAR_PLAYER },
    );
    expect(critters.census()).toEqual({ bird: 0, fish: 0, rabbit: 0 });
  });
});
