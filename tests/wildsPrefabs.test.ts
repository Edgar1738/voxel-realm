import { describe, it, expect } from 'vitest';
import {
  ruinedWatchtower,
  standingStones,
  obelisk,
  ruinedCottage,
  deadTree,
  campShrine,
  brokenBridge,
  statue,
} from '../src/worldgen/wildsPrefabs';
import { validatePrefab } from '../src/core/Prefab';
import { GLOWSTONE, CRYSTAL, LANTERN } from '../src/blocks/blocks';

// ---------------------------------------------------------------------------
// Structural invariant: every prefab must pass validatePrefab (null = valid)
// ---------------------------------------------------------------------------
describe('wildsPrefabs — validatePrefab', () => {
  for (const [name, make] of [
    ['ruinedWatchtower', ruinedWatchtower],
    ['standingStones', standingStones],
    ['obelisk', obelisk],
    ['ruinedCottage', ruinedCottage],
    ['deadTree', deadTree],
    ['campShrine', campShrine],
    ['brokenBridge', brokenBridge],
    ['statue', statue],
  ] as const) {
    it(`${name}: validatePrefab returns null (fully valid)`, () => {
      expect(validatePrefab(make())).toBeNull();
    });
  }
});

// ---------------------------------------------------------------------------
// dims bounds: every block offset must sit inside the declared dims
// ---------------------------------------------------------------------------
describe('wildsPrefabs — all blocks within dims', () => {
  for (const [name, make] of [
    ['ruinedWatchtower', ruinedWatchtower],
    ['standingStones', standingStones],
    ['obelisk', obelisk],
    ['ruinedCottage', ruinedCottage],
    ['deadTree', deadTree],
    ['campShrine', campShrine],
    ['brokenBridge', brokenBridge],
    ['statue', statue],
  ] as const) {
    it(`${name}: blocks.length > 0 and all within dims`, () => {
      const p = make();
      const [sx, sy, sz] = p.dims;
      expect(p.blocks.length).toBeGreaterThan(0);
      for (const [dx, dy, dz] of p.blocks) {
        expect(dx >= 0 && dx < sx, `dx=${dx} out of [0,${sx})`).toBe(true);
        expect(dy >= 0 && dy < sy, `dy=${dy} out of [0,${sy})`).toBe(true);
        expect(dz >= 0 && dz < sz, `dz=${dz} out of [0,${sz})`).toBe(true);
      }
    });
  }
});

// ---------------------------------------------------------------------------
// Targeted asserts
// ---------------------------------------------------------------------------
describe('wildsPrefabs — targeted properties', () => {
  it('obelisk contains a light source (GLOWSTONE or CRYSTAL)', () => {
    const { blocks } = obelisk();
    const hasLight = blocks.some(([, , , id]) => id === GLOWSTONE || id === CRYSTAL);
    expect(hasLight).toBe(true);
  });

  it('campShrine contains a LANTERN', () => {
    const { blocks } = campShrine();
    expect(blocks.some(([, , , id]) => id === LANTERN)).toBe(true);
  });

  it('statue is at least 6 blocks tall (dims[1] >= 6)', () => {
    expect(statue().dims[1]).toBeGreaterThanOrEqual(6);
  });

  it('standingStones has many blocks (monolith cluster threshold)', () => {
    // 7 monoliths * ~3-5 blocks + gravel base = well above 40
    expect(standingStones().blocks.length).toBeGreaterThan(40);
  });

  it('ruinedWatchtower is taller than the existing ruinedTower (dims[1] >= 12)', () => {
    expect(ruinedWatchtower().dims[1]).toBeGreaterThanOrEqual(12);
  });

  it('brokenBridge has a deck at least 9 long (dims[0] >= 9)', () => {
    expect(brokenBridge().dims[0]).toBeGreaterThanOrEqual(9);
  });

  it('obelisk is a tall slender monument (dims[1] >= 12)', () => {
    expect(obelisk().dims[1]).toBeGreaterThanOrEqual(12);
  });

  it('deadTree has no leaves — pure wood branch structure', () => {
    const { blocks } = deadTree();
    // id 6 = LEAVES — must be absent
    expect(blocks.some(([, , , id]) => id === 6)).toBe(false);
  });
});
