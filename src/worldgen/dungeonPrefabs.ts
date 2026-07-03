import {
  AIR,
  STONE,
  COBBLESTONE,
  DEEPSLATE,
  GRAVEL,
  STONE_SLAB,
  GLOWSTONE,
  LANTERN,
  CRYSTAL,
  GOLD_ORE,
  EMERALD_ORE,
  FURNACE,
  OAK_FENCE,
  OAK_FENCE_GATE,
} from '../blocks/blocks';
import type { Prefab, PrefabVoxel } from '../core/Prefab';
import type { BlockId } from '../core/types';

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------
function builder(): {
  put: (x: number, y: number, z: number, id: BlockId) => void;
  blocks: PrefabVoxel[];
} {
  const blocks: PrefabVoxel[] = [];
  const put = (x: number, y: number, z: number, id: BlockId): void => {
    blocks.push([x, y, z, id]);
  };
  return { put, blocks };
}

// ---------------------------------------------------------------------------
// 1. crypt — small stone burial chamber with a raised coffin, lantern, doorway
// ---------------------------------------------------------------------------
export function crypt(): Prefab {
  const W = 7;
  const D = 7;
  const H = 5;
  const { put, blocks } = builder();

  // Deepslate floor
  for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) put(x, 0, z, DEEPSLATE);

  // Shell walls (stone/deepslate mix), doorway gap at front centre
  for (let y = 1; y <= 3; y++) {
    for (let z = 0; z < D; z++) {
      for (let x = 0; x < W; x++) {
        const onWall = x === 0 || x === W - 1 || z === 0 || z === D - 1;
        if (!onWall) continue;
        const doorway = z === 0 && x === 3 && y <= 2;
        if (doorway) {
          put(x, y, z, AIR); // explicit AIR so hillside stamps still open the entrance
        } else {
          put(x, y, z, (x * 3 + z * 5 + y) % 4 === 0 ? DEEPSLATE : STONE);
        }
      }
    }
  }

  // Stone ceiling
  for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) put(x, 4, z, STONE);

  // Interior: coffin (deepslate base + stone-slab lid), a lantern, rest AIR
  for (let y = 1; y <= 3; y++) {
    for (let z = 1; z <= 5; z++) {
      for (let x = 1; x <= 5; x++) {
        const coffinBase = x === 3 && y === 1 && z >= 2 && z <= 4;
        const coffinLid = x === 3 && y === 2 && z >= 2 && z <= 4;
        const lantern = x === 1 && y === 3 && z === 1;
        if (coffinBase) put(x, y, z, DEEPSLATE);
        else if (coffinLid) put(x, y, z, STONE_SLAB);
        else if (lantern) put(x, y, z, LANTERN);
        else put(x, y, z, AIR); // hollow chamber even when stamped into a hillside
      }
    }
  }

  return { dims: [W, H, D], blocks };
}

// ---------------------------------------------------------------------------
// 2. dungeonCell — tiny barred prison cell: fence bars + gate, cracked floor
// ---------------------------------------------------------------------------
export function dungeonCell(): Prefab {
  const W = 5;
  const D = 5;
  const H = 4;
  const { put, blocks } = builder();

  // Cracked floor: cobble with gravel patches
  for (let z = 0; z < D; z++)
    for (let x = 0; x < W; x++) put(x, 0, z, (x * 3 + z) % 4 === 0 ? GRAVEL : COBBLESTONE);

  // Walls (cobble/deepslate mix); the front wall (z=0) is fence bars + gate
  for (let y = 1; y <= 2; y++) {
    for (let z = 0; z < D; z++) {
      for (let x = 0; x < W; x++) {
        const onWall = x === 0 || x === W - 1 || z === 0 || z === D - 1;
        if (!onWall) continue;
        const barWall = z === 0 && x >= 1 && x <= 3;
        if (barWall) {
          const gate = x === 2 && y === 1;
          put(x, y, z, gate ? OAK_FENCE_GATE : OAK_FENCE);
        } else {
          put(x, y, z, (x * 2 + z + y) % 3 === 0 ? DEEPSLATE : COBBLESTONE);
        }
      }
    }
  }

  // Deepslate ceiling seals the cell
  for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) put(x, 3, z, DEEPSLATE);

  // Interior explicitly AIR (hollow even when stamped into a hillside)
  for (let y = 1; y <= 2; y++)
    for (let z = 1; z <= 3; z++) for (let x = 1; x <= 3; x++) put(x, y, z, AIR);

  return { dims: [W, H, D], blocks };
}

// ---------------------------------------------------------------------------
// 3. collapsedHall — ruined pillared corridor, partial roof, rubble heaps
// ---------------------------------------------------------------------------
export function collapsedHall(): Prefab {
  const L = 9; // length along x
  const D = 5; // width along z
  const H = 5;
  const { put, blocks } = builder();

  // Floor: worn cobble with gravel patches
  for (let z = 0; z < D; z++)
    for (let x = 0; x < L; x++) put(x, 0, z, (x * 5 + z * 3) % 6 === 0 ? GRAVEL : COBBLESTONE);

  // Two rows of pillars (z=1 and z=3) with ragged surviving heights
  const pillars: Array<[number, number, number]> = [
    // [x, z, height] — height 3 = intact, shorter = collapsed stump
    [1, 1, 3],
    [3, 1, 3],
    [5, 1, 1],
    [7, 1, 3],
    [1, 3, 3],
    [3, 3, 2],
    [5, 3, 3],
    [7, 3, 1],
  ];
  const solid = new Set<string>();
  for (const [px, pz, ph] of pillars) {
    for (let y = 1; y <= ph; y++) {
      put(px, y, pz, y === 1 ? COBBLESTONE : STONE);
      solid.add(`${px},${y},${pz}`);
    }
  }

  // Rubble heaps where the roof fell (kept out of the centre lane z=2)
  const rubble: Array<[number, number, number, BlockId]> = [
    [4, 1, 1, GRAVEL],
    [6, 1, 1, GRAVEL],
    [4, 1, 3, GRAVEL],
    [6, 1, 3, COBBLESTONE],
    [4, 1, 0, COBBLESTONE],
    [6, 1, 4, GRAVEL],
    [4, 2, 3, COBBLESTONE], // chunk resting atop a gravel heap
  ];
  for (const [rx, ry, rz, rid] of rubble) {
    put(rx, ry, rz, rid);
    solid.add(`${rx},${ry},${rz}`);
  }

  // Partial slab roof: intact at both ends, collapsed over the middle
  for (let z = 0; z < D; z++) {
    for (let x = 0; x < L; x++) {
      const intactEnd = x <= 2 || x >= 7;
      const raggedEdge = (x === 3 && (z <= 1 || z === 4)) || (x === 6 && (z === 0 || z === 4));
      if ((intactEnd && !(x === 7 && z === 2)) || raggedEdge) put(x, 4, z, STONE_SLAB);
    }
  }

  // Explicit AIR through the corridor interior so the hall stays walkable
  // when stamped into a hillside (same class of fix as the pond prefabs).
  for (let y = 1; y <= 3; y++)
    for (let z = 1; z <= 3; z++)
      for (let x = 0; x < L; x++) if (!solid.has(`${x},${y},${z}`)) put(x, y, z, AIR);

  return { dims: [L, H, D], blocks };
}

// ---------------------------------------------------------------------------
// 4. treasureVault — sealed hoard room: ores, crystal, furnace strongbox
// ---------------------------------------------------------------------------
export function treasureVault(): Prefab {
  const W = 7;
  const D = 7;
  const H = 5;
  const { put, blocks } = builder();

  // Floor: stone with deepslate flecks
  for (let z = 0; z < D; z++)
    for (let x = 0; x < W; x++) put(x, 0, z, (x + z) % 5 === 0 ? DEEPSLATE : STONE);

  // Shell walls: deepslate corner columns, stone elsewhere; one narrow entrance
  for (let y = 1; y <= 3; y++) {
    for (let z = 0; z < D; z++) {
      for (let x = 0; x < W; x++) {
        const onWall = x === 0 || x === W - 1 || z === 0 || z === D - 1;
        if (!onWall) continue;
        const entrance = z === 0 && x === 3 && y <= 2;
        if (entrance) {
          put(x, y, z, AIR); // explicit AIR keeps the entrance open in a hillside
          continue;
        }
        const corner = (x === 0 || x === W - 1) && (z === 0 || z === D - 1);
        put(x, y, z, corner || (x * 5 + z * 3 + y) % 6 === 0 ? DEEPSLATE : STONE);
      }
    }
  }

  // Ceiling with a glowstone panel at the centre
  for (let z = 0; z < D; z++)
    for (let x = 0; x < W; x++) put(x, 4, z, x === 3 && z === 3 ? GLOWSTONE : STONE);

  // Interior hoard along the walls, furnace strongbox at the back, rest AIR
  const hoard = new Map<string, BlockId>([
    ['1,1,1', GOLD_ORE],
    ['2,1,1', GOLD_ORE],
    ['1,1,2', EMERALD_ORE],
    ['5,1,1', CRYSTAL],
    ['5,1,2', GOLD_ORE],
    ['1,1,4', EMERALD_ORE],
    ['1,1,5', GOLD_ORE],
    ['5,1,4', GOLD_ORE],
    ['5,1,5', CRYSTAL],
    ['2,1,5', EMERALD_ORE],
    ['4,1,5', GOLD_ORE],
    ['3,1,5', FURNACE], // the vault's strongbox
    ['1,2,1', CRYSTAL],
    ['5,2,5', GOLD_ORE],
    ['1,2,5', EMERALD_ORE],
  ]);
  for (let y = 1; y <= 3; y++)
    for (let z = 1; z <= 5; z++)
      for (let x = 1; x <= 5; x++) put(x, y, z, hoard.get(`${x},${y},${z}`) ?? AIR);

  return { dims: [W, H, D], blocks };
}

// ---------------------------------------------------------------------------
// 5. catacombNook — deepslate wall segment with recessed burial niches
// ---------------------------------------------------------------------------
export function catacombNook(): Prefab {
  const W = 7;
  const H = 4;
  const D = 2; // front face (z=0) carries the niches, back layer (z=1) is solid
  const { put, blocks } = builder();

  // Solid deepslate backing layer
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) put(x, y, 1, DEEPSLATE);

  // Front face: base course, niche rows, lantern-topped crown
  for (let x = 0; x < W; x++) put(x, 0, 0, DEEPSLATE);
  for (let x = 0; x < W; x++) {
    // y=1 row: open 2x1 niche at x=1..2, cobble-sealed niche at x=4..5
    if (x === 1 || x === 2) put(x, 1, 0, AIR);
    else if (x === 4 || x === 5) put(x, 1, 0, COBBLESTONE);
    else put(x, 1, 0, DEEPSLATE);
    // y=2 row: sealed at x=1..2, open at x=4..5
    if (x === 1 || x === 2) put(x, 2, 0, COBBLESTONE);
    else if (x === 4 || x === 5) put(x, 2, 0, AIR);
    else put(x, 2, 0, DEEPSLATE);
    // y=3 crown with a lantern at the centre
    put(x, 3, 0, x === 3 ? LANTERN : DEEPSLATE);
  }

  return { dims: [W, H, D], blocks };
}
