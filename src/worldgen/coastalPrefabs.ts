import {
  AIR,
  STONE,
  BRICK,
  SNOW,
  GLASS,
  GLOWSTONE,
  PLANKS,
  PLANK_SLAB,
  STONE_SLAB,
  WOOD,
  SAND,
  LANTERN,
  OAK_FENCE,
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
// 1. lighthouse — tapering striped tower with a glass lamp room on top
// ---------------------------------------------------------------------------
export function lighthouse(): Prefab {
  const SIZE = 7; // footprint, centred at (3, 3)
  const { put, blocks } = builder();

  // Octagonal fill test: square of radius r with the corners cut off
  const inOctagon = (x: number, z: number, r: number): boolean => {
    const adx = Math.abs(x - 3);
    const adz = Math.abs(z - 3);
    return adx <= r && adz <= r && adx + adz <= r + 1;
  };
  // Alternating painted bands, two courses each: snow, brick, snow, ...
  const band = (y: number): BlockId => (Math.floor(y / 2) % 2 === 0 ? SNOW : BRICK);

  // Solid tapering body: radius 3 -> 2 -> 1 (interior solid, as a simple tower)
  for (let y = 0; y <= 11; y++) {
    const r = y <= 3 ? 3 : y <= 7 ? 2 : 1;
    for (let z = 0; z < SIZE; z++) {
      for (let x = 0; x < SIZE; x++) {
        if (!inOctagon(x, z, r)) continue;
        const door = z === 0 && x === 3 && (y === 1 || y === 2);
        put(x, y, z, door ? AIR : band(y)); // small recessed doorway at the base
      }
    }
  }

  // Gallery deck under the lamp room
  for (let z = 1; z <= 5; z++) for (let x = 1; x <= 5; x++) put(x, 12, z, STONE);

  // Glass-enclosed lamp room with a glowstone light at its heart
  for (let z = 2; z <= 4; z++)
    for (let x = 2; x <= 4; x++) put(x, 13, z, x === 3 && z === 3 ? GLOWSTONE : GLASS);

  // Slab cap
  for (let z = 2; z <= 4; z++) for (let x = 2; x <= 4; x++) put(x, 14, z, STONE_SLAB);

  return { dims: [SIZE, 15, SIZE], blocks };
}

// ---------------------------------------------------------------------------
// 2. rowboat — tiny planks dinghy with a bench, meant to sit in water
// ---------------------------------------------------------------------------
export function rowboat(): Prefab {
  const { put, blocks } = builder();

  // Hull bottom: planks midsection with pointed wood bow/stern tips
  for (let z = 0; z < 3; z++) for (let x = 1; x <= 3; x++) put(x, 0, z, PLANKS);
  put(0, 0, 1, WOOD); // bow tip
  put(4, 0, 1, WOOD); // stern tip

  // Gunwales + posts, a slab bench amidships, explicit AIR bilge
  for (let x = 1; x <= 3; x++) {
    put(x, 1, 0, PLANKS);
    put(x, 1, 2, PLANKS);
  }
  put(0, 1, 1, WOOD); // bow post
  put(4, 1, 1, WOOD); // stern post
  put(2, 1, 1, PLANK_SLAB); // rower's bench
  put(1, 1, 1, AIR); // hollow interior so the boat isn't a solid brick
  put(3, 1, 1, AIR);

  return { dims: [5, 2, 3], blocks };
}

// ---------------------------------------------------------------------------
// 3. shipwreck — broken listing hull section, rotted gaps, silted with sand
// ---------------------------------------------------------------------------
export function shipwreck(): Prefab {
  const L = 11; // length along x
  const D = 5;
  const H = 5;
  const { put, blocks } = builder();

  // Wood keel line, snapped at x=7
  for (let x = 0; x < L; x++) if (x !== 7) put(x, 0, 2, WOOD);

  // Hull floor either side of the keel, with rot gaps
  for (const z of [1, 3])
    for (let x = 1; x <= 9; x++) if ((x * 3 + z) % 5 !== 0) put(x, 0, z, PLANKS);

  // Bilge strakes closing the outer bottom edges
  for (const z of [0, 4]) for (let x = 2; x <= 8; x++) if ((x * 3) % 4 !== 0) put(x, 0, z, PLANKS);

  // Bow stem (intact) and a stub of stern post
  put(0, 1, 2, WOOD);
  put(0, 2, 2, WOOD);
  put(10, 1, 2, WOOD);

  // Port side (z=0) survives high — wood ribs with rotted planking between
  for (const rx of [1, 3, 5, 7, 9]) for (let y = 1; y <= 3; y++) put(rx, y, 0, WOOD);
  put(3, 4, 0, WOOD); // two rib tips reach higher, giving the listing silhouette
  put(5, 4, 0, WOOD);
  for (const px of [2, 4, 6, 8])
    for (let y = 1; y <= 2; y++) if ((px * 5 + y) % 4 !== 0) put(px, y, 0, PLANKS);

  // Starboard side (z=4) has collapsed to scattered y=1 remnants
  for (const px of [2, 3, 5, 6, 8]) put(px, 1, 4, PLANKS);

  // Silt: sand drifted into the hold amidships (no interior AIR — when placed
  // half-submerged the surrounding water should flood the open hull)
  put(3, 1, 2, SAND);
  put(4, 1, 1, SAND);
  put(4, 1, 2, SAND);
  put(5, 1, 2, SAND);
  put(5, 1, 3, SAND);
  put(6, 1, 2, SAND);
  put(4, 2, 2, SAND); // crest of the drift

  return { dims: [L, H, D], blocks };
}

// ---------------------------------------------------------------------------
// 4. fishingHut — stilt hut over the water: deck, railing, lantern, slab roof
// ---------------------------------------------------------------------------
export function fishingHut(): Prefab {
  const W = 7;
  const D = 5;
  const H = 8;
  const { put, blocks } = builder();

  // Wood stilts, 3 tall so the platform clears water level when stamped at
  // the water surface
  for (const [sx, sz] of [
    [1, 1],
    [5, 1],
    [1, 3],
    [5, 3],
  ] as const) {
    for (let y = 0; y <= 2; y++) put(sx, y, sz, WOOD);
  }

  // Planks platform
  for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) put(x, 3, z, PLANKS);

  // Hut shell on the back half (x=3..6), door facing the deck, two windows
  for (let y = 4; y <= 6; y++) {
    for (let z = 0; z < D; z++) {
      for (let x = 3; x <= 6; x++) {
        const onWall = x === 3 || x === 6 || z === 0 || z === D - 1;
        if (!onWall) continue;
        const door = x === 3 && z === 2 && y <= 5;
        if (door) {
          put(x, y, z, AIR);
          continue;
        }
        const window_ = y === 5 && ((x === 6 && z === 2) || (x === 5 && (z === 0 || z === 4)));
        put(x, y, z, window_ ? GLASS : PLANKS);
      }
    }
  }

  // Hut interior explicitly AIR (hollow even when stamped against a bank)
  for (let y = 4; y <= 6; y++)
    for (let z = 1; z <= 3; z++) for (let x = 4; x <= 5; x++) put(x, y, z, AIR);

  // Slab roof with a one-block overhang sheltering the deck side
  for (let z = 0; z < D; z++) for (let x = 2; x <= 6; x++) put(x, 7, z, PLANK_SLAB);

  // Lantern hung under the roof overhang, over the deck
  put(2, 6, 2, LANTERN);

  // Fence railing around the open deck, with a boarding gap at the front
  for (let z = 0; z < D; z++) if (z !== 2) put(0, 4, z, OAK_FENCE);
  for (const rx of [1, 2]) {
    put(rx, 4, 0, OAK_FENCE);
    put(rx, 4, 4, OAK_FENCE);
  }

  return { dims: [W, H, D], blocks };
}

// ---------------------------------------------------------------------------
// 5. buoy — tiny floating marker: planks float, post, lantern on top
// ---------------------------------------------------------------------------
export function buoy(): Prefab {
  const { put, blocks } = builder();

  // Plus-shaped planks float
  put(1, 0, 0, PLANKS);
  put(0, 0, 1, PLANKS);
  put(1, 0, 1, PLANKS);
  put(2, 0, 1, PLANKS);
  put(1, 0, 2, PLANKS);

  // Post + lantern
  put(1, 1, 1, WOOD);
  put(1, 2, 1, WOOD);
  put(1, 3, 1, LANTERN);

  return { dims: [3, 4, 3], blocks };
}
