import {
  BRICK,
  CARVED_LIMESTONE,
  FLOWER,
  GOLD_TRIM,
  GRASS,
  GRAVEL,
  LEAVES,
  LIMESTONE,
  OAK_FENCE,
  PLANKS,
  SAND,
  STONE_SLAB,
  WATER,
  WOOD,
} from '../blocks/blocks';
import { SEA_LEVEL } from '../core/constants';
import { CitadelStamp } from './CitadelStamp';
import type { Overlay } from './Generator';

const G = SEA_LEVEL;

const FLAGS = [
  { x: -24, z: 2 },
  { x: 24, z: -22 },
  { x: 0, z: -52 },
] as const;

function buildStartPavilion(s: CitadelStamp): void {
  s.slab(-7, 24, 7, 34, G, PLANKS);
  for (const x of [-6, 6]) {
    for (const z of [25, 33]) s.fill(x, G + 1, z, x, G + 5, z, LIMESTONE);
  }
  s.slab(-7, 24, 7, 34, G + 6, CARVED_LIMESTONE);
  s.slab(-4, 25, 4, 33, G + 7, PLANKS);
  s.fill(-3, G + 1, 24, 3, G + 4, 24, CARVED_LIMESTONE);
  s.fill(-2, G + 1, 24, 2, G + 3, 24, GRASS); // open arch toward Piper and the course
  s.set(-4, G + 5, 24, GOLD_TRIM);
  s.set(4, G + 5, 24, GOLD_TRIM);
}

function buildFlag(s: CitadelStamp, x: number, z: number): void {
  s.slab(x - 3, z - 3, x + 3, z + 3, G, GRASS);
  for (let d = -3; d <= 3; d++) {
    s.set(x + d, G, z - 3, GRAVEL);
    s.set(x + d, G, z + 3, GRAVEL);
    s.set(x - 3, G, z + d, GRAVEL);
    s.set(x + 3, G, z + d, GRAVEL);
  }
  s.set(x, G + 1, z, OAK_FENCE);
  s.set(x, G + 2, z, OAK_FENCE);
  s.set(x, G + 3, z, OAK_FENCE);
  s.set(x + 1, G + 3, z, BRICK);
  s.set(x + 2, G + 3, z, BRICK);
  s.set(x + 1, G + 2, z, BRICK);
}

function buildTree(s: CitadelStamp, x: number, z: number): void {
  s.fill(x, G + 1, z, x, G + 4, z, WOOD);
  s.fill(x - 2, G + 4, z - 2, x + 2, G + 5, z + 2, LEAVES);
  s.fill(x - 1, G + 6, z - 1, x + 1, G + 6, z + 1, LEAVES);
}

function buildCourseDressing(s: CitadelStamp): void {
  // Hazards sit away from the timed line, adding a course silhouette without golf physics.
  s.slab(9, -17, 16, -10, G, SAND);
  s.slab(-10, -33, -4, -25, G, WATER);
  for (const [x, z] of [
    [-34, 14],
    [-35, -15],
    [-29, -43],
    [31, 7],
    [36, -33],
    [25, -58],
  ] as const) {
    buildTree(s, x, z);
  }
  for (let z = 14; z >= -50; z -= 8) {
    s.set(-38, G + 1, z, FLOWER);
    s.set(38, G + 1, z - 3, FLOWER);
  }
  // Small stepping pads suggest the route while leaving shortcuts entirely up to the player.
  for (const [x, z] of [
    [-6, 13],
    [-13, 9],
    [-17, 5],
    [-10, -5],
    [2, -12],
    [13, -18],
    [18, -29],
    [11, -39],
    [4, -47],
  ] as const) {
    s.set(x, G + 1, z, STONE_SLAB);
  }
}

/** Compact authored grounds for Piper's navigation challenge, stamped over a flat grass world. */
export function sunmeadowSite(): Overlay {
  return (chunk, cx, cz) => {
    const stamp = new CitadelStamp(chunk, cx, cz);
    buildStartPavilion(stamp);
    for (const flag of FLAGS) buildFlag(stamp, flag.x, flag.z);
    buildCourseDressing(stamp);
  };
}
