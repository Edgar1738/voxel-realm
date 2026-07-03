import { describe, it, expect } from 'vitest';
import {
  crypt,
  dungeonCell,
  collapsedHall,
  treasureVault,
  catacombNook,
} from '../src/worldgen/dungeonPrefabs';
import { validatePrefab } from '../src/core/Prefab';
import {
  AIR,
  BLOCK_DEFS,
  STONE_SLAB,
  DEEPSLATE,
  COBBLESTONE,
  GRAVEL,
  LANTERN,
  GLOWSTONE,
  CRYSTAL,
  GOLD_ORE,
  EMERALD_ORE,
  FURNACE,
  OAK_FENCE,
  OAK_FENCE_GATE,
} from '../src/blocks/blocks';

const ALL = [
  ['crypt', crypt],
  ['dungeonCell', dungeonCell],
  ['collapsedHall', collapsedHall],
  ['treasureVault', treasureVault],
  ['catacombNook', catacombNook],
] as const;

const KNOWN_IDS = new Set(BLOCK_DEFS.map((d) => d.id));

// ---------------------------------------------------------------------------
// Structural invariant: every prefab must pass validatePrefab (null = valid)
// ---------------------------------------------------------------------------
describe('dungeonPrefabs — validatePrefab', () => {
  for (const [name, make] of ALL) {
    it(`${name}: validatePrefab returns null (fully valid)`, () => {
      expect(validatePrefab(make())).toBeNull();
    });
  }
});

// ---------------------------------------------------------------------------
// dims bounds + known ids: non-empty, inside dims, only real block ids
// ---------------------------------------------------------------------------
describe('dungeonPrefabs — all blocks within dims, all ids known', () => {
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
// Sealed-interior regression guard: enclosed rooms must carry explicit AIR
// voxels strictly inside their shell (same class of bug as the pond fix —
// without them a hillside stamp leaves the room full of pre-existing ground).
// ---------------------------------------------------------------------------
describe('dungeonPrefabs — interiors contain explicit AIR', () => {
  for (const [name, make] of [
    ['crypt', crypt],
    ['dungeonCell', dungeonCell],
    ['treasureVault', treasureVault],
  ] as const) {
    it(`${name}: has AIR voxels strictly inside the shell`, () => {
      const p = make();
      const [sx, sy, sz] = p.dims;
      const interiorAir = p.blocks.filter(
        ([x, y, z, id]) =>
          id === AIR && x > 0 && x < sx - 1 && y > 0 && y < sy - 1 && z > 0 && z < sz - 1,
      );
      expect(interiorAir.length).toBeGreaterThan(0);
    });
  }
});

// ---------------------------------------------------------------------------
// Targeted asserts
// ---------------------------------------------------------------------------
describe('dungeonPrefabs — targeted properties', () => {
  it('crypt has a raised coffin (STONE_SLAB lid on a DEEPSLATE base) and a LANTERN', () => {
    const { blocks } = crypt();
    expect(blocks.some(([, , , id]) => id === STONE_SLAB)).toBe(true);
    expect(blocks.some(([, , , id]) => id === DEEPSLATE)).toBe(true);
    expect(blocks.some(([, , , id]) => id === LANTERN)).toBe(true);
  });

  it('crypt has an entrance gap (explicit AIR in the front wall)', () => {
    const { blocks } = crypt();
    expect(blocks.some(([, , z, id]) => id === AIR && z === 0)).toBe(true);
  });

  it('dungeonCell has fence bars and a gate on the door wall', () => {
    const { blocks } = dungeonCell();
    expect(blocks.some(([, , z, id]) => id === OAK_FENCE && z === 0)).toBe(true);
    expect(blocks.some(([, , z, id]) => id === OAK_FENCE_GATE && z === 0)).toBe(true);
  });

  it('dungeonCell floor mixes gravel into the cobble', () => {
    const { blocks } = dungeonCell();
    expect(blocks.some(([, y, , id]) => id === GRAVEL && y === 0)).toBe(true);
    expect(blocks.some(([, y, , id]) => id === COBBLESTONE && y === 0)).toBe(true);
  });

  it('collapsedHall keeps its centre lane walkable (only AIR at z=2, y=1..3)', () => {
    const { blocks } = collapsedHall();
    const laneSolids = blocks.filter(([, y, z, id]) => z === 2 && y >= 1 && y <= 3 && id !== AIR);
    expect(laneSolids).toEqual([]);
  });

  it('collapsedHall has rubble heaps and only a partial roof', () => {
    const p = collapsedHall();
    expect(p.blocks.some(([, y, , id]) => id === GRAVEL && y >= 1)).toBe(true);
    const roofY = p.dims[1] - 1;
    const roofCells = p.blocks.filter(([, y]) => y === roofY).length;
    expect(roofCells).toBeGreaterThan(0);
    expect(roofCells).toBeLessThan(p.dims[0] * p.dims[2]); // some of it has fallen
  });

  it('treasureVault holds a hoard: gold, emerald, crystal, a furnace strongbox, glowstone light', () => {
    const { blocks } = treasureVault();
    for (const want of [GOLD_ORE, EMERALD_ORE, CRYSTAL, FURNACE, GLOWSTONE]) {
      expect(blocks.some(([, , , id]) => id === want)).toBe(true);
    }
  });

  it('treasureVault has exactly one narrow entrance column of AIR in the shell', () => {
    const { blocks } = treasureVault();
    const entranceAir = blocks.filter(([, , z, id]) => id === AIR && z === 0);
    expect(entranceAir.length).toBe(2); // 1 wide x 2 tall
  });

  it('catacombNook has open AIR niches, cobble-sealed niches, and a lantern', () => {
    const { blocks } = catacombNook();
    expect(blocks.some(([, , z, id]) => id === AIR && z === 0)).toBe(true);
    expect(blocks.some(([, , z, id]) => id === COBBLESTONE && z === 0)).toBe(true);
    expect(blocks.some(([, , , id]) => id === LANTERN)).toBe(true);
    // niches are recesses: the backing layer behind every front cell is solid deepslate
    const backing = blocks.filter(([, , z, id]) => z === 1 && id === DEEPSLATE);
    expect(backing.length).toBe(catacombNook().dims[0] * catacombNook().dims[1]);
  });
});
