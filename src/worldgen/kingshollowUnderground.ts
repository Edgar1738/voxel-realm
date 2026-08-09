/**
 * The Hollow Below — Kingshollow's authored underground journey.
 *
 * A castle well and quarry converge on old human workings, then descend through water caverns,
 * a crystal bridge, the Great Rift, volcanic tubes, and the Heartforge. The return shaft closes
 * the route beneath the keep. All geometry is world-space and chunk-clipped by CitadelStamp.
 */
import {
  AGED_MASONRY,
  AIR,
  BASALT,
  BOOKSHELF,
  COBBLESTONE,
  COBBLE_WALL,
  CRYSTAL,
  DEEPSLATE,
  EMERALD_ORE,
  GLOWSTONE,
  GOLD_ORE,
  IRON_ORE,
  LANTERN,
  LAVA,
  MAGMA,
  MOSS,
  MOSSY_COBBLE,
  OBSIDIAN,
  OAK_FENCE,
  PLANKS,
  STALACTITE,
  STONE,
  STONE_SLAB,
  TORCH,
  WATER,
  WOOD,
} from '../blocks/blocks';
import { CitadelStamp, hash2, spiralStair } from './CitadelStamp';
import { KINGSHOLLOW } from './KingshollowGenerator';
import type { BlockId } from '../core/types';
import type { Overlay } from './Generator';

type Point3 = readonly [number, number, number];

export const HOLLOW = {
  well: { x: -15, y: 52, z: -49 },
  quarry: { x: 71, y: 52, z: 23 },
  works: { x: -4, y: 50, z: -18 },
  reservoir: { x: 13, y: 42, z: 12 },
  mill: { x: 4, y: 41, z: 46 },
  crystal: { x: 47, y: 34, z: 20 },
  rift: { x: -12, y: 27, z: 30 },
  confluence: { x: -29, y: 15, z: -9 },
  heartforge: { x: 2, y: 12, z: -48 },
  lift: { x: 15, y: 13, z: -51 },
} as const;

function carveEllipsoid(
  s: CitadelStamp,
  cx: number,
  cy: number,
  cz: number,
  rx: number,
  ry: number,
  rz: number,
): void {
  const x0 = Math.max(s.wx0, Math.floor(cx - rx));
  const x1 = Math.min(s.wx1, Math.ceil(cx + rx));
  const z0 = Math.max(s.wz0, Math.floor(cz - rz));
  const z1 = Math.min(s.wz1, Math.ceil(cz + rz));
  for (let x = x0; x <= x1; x++) {
    for (let z = z0; z <= z1; z++) {
      const horizontal = ((x - cx) / rx) ** 2 + ((z - cz) / rz) ** 2;
      if (horizontal >= 1) continue;
      const vertical = Math.sqrt(1 - horizontal) * ry;
      s.fill(x, Math.ceil(cy - vertical), z, x, Math.floor(cy + vertical), z, AIR);
    }
  }
}

function tunnel(s: CitadelStamp, points: readonly Point3[], radius = 3): void {
  for (let p = 0; p < points.length - 1; p++) {
    const [x0, y0, z0] = points[p];
    const [x1, y1, z1] = points[p + 1];
    const distance = Math.hypot(x1 - x0, y1 - y0, z1 - z0);
    const steps = Math.max(1, Math.ceil(distance / 2));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      carveEllipsoid(
        s,
        x0 + (x1 - x0) * t,
        y0 + (y1 - y0) * t,
        z0 + (z1 - z0) * t,
        radius + 0.8,
        radius,
        radius + 0.8,
      );
    }
  }
}

function floorDisc(
  s: CitadelStamp,
  cx: number,
  cz: number,
  rx: number,
  rz: number,
  y: number,
  block: BlockId,
): void {
  const x0 = Math.max(s.wx0, cx - rx);
  const x1 = Math.min(s.wx1, cx + rx);
  const z0 = Math.max(s.wz0, cz - rz);
  const z1 = Math.min(s.wz1, cz + rz);
  for (let x = x0; x <= x1; x++)
    for (let z = z0; z <= z1; z++) {
      if (((x - cx) / rx) ** 2 + ((z - cz) / rz) ** 2 <= 1) s.set(x, y, z, block);
    }
}

function steppingRamp(s: CitadelStamp, points: readonly Point3[], width = 3): void {
  for (let p = 0; p < points.length - 1; p++) {
    const [x0, y0, z0] = points[p];
    const [x1, y1, z1] = points[p + 1];
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(z1 - z0), Math.abs(y1 - y0));
    for (let i = 0; i <= steps; i++) {
      const t = i / Math.max(1, steps);
      const x = Math.round(x0 + (x1 - x0) * t);
      const y = Math.round(y0 + (y1 - y0) * t);
      const z = Math.round(z0 + (z1 - z0) * t);
      const alongX = Math.abs(x1 - x0) >= Math.abs(z1 - z0);
      for (let side = -Math.floor(width / 2); side <= Math.floor(width / 2); side++) {
        const px = x + (alongX ? 0 : side);
        const pz = z + (alongX ? side : 0);
        s.set(px, y, pz, hash2(px, pz, 0x51a1) < 0.7 ? COBBLESTONE : STONE);
        s.fill(px, y + 1, pz, px, y + 4, pz, AIR);
      }
    }
  }
}

function castleWell(s: CitadelStamp): void {
  const { x, y, z } = HOLLOW.well;
  // Stone well in the keep's western court and a walkable spiral to the old works.
  s.outline(x - 2, z - 2, x + 2, z + 2, KINGSHOLLOW.castleY + 1, COBBLE_WALL);
  s.fill(x - 2, y, z - 2, x + 2, KINGSHOLLOW.castleY, z + 2, AIR);
  spiralStair(s, x, z, y, KINGSHOLLOW.castleY, COBBLESTONE, STONE);
  for (let level = y + 3; level < KINGSHOLLOW.castleY; level += 6) {
    s.set(x + 2, level, z, LANTERN);
  }
}

function quarryEntrance(s: CitadelStamp): void {
  // A visible cut in the east hillside descends in short, readable terraces.
  tunnel(
    s,
    [
      [75, 63, 23],
      [71, 57, 23],
      [68, 52, 18],
    ],
    4,
  );
  steppingRamp(
    s,
    [
      [77, 66, 23],
      [74, 61, 23],
      [70, 56, 23],
      [68, 52, 18],
    ],
    3,
  );
  for (const x of [73, 69]) {
    s.fill(x, 53, 16, x, 57, 16, WOOD);
    s.fill(x, 53, 20, x, 57, 20, WOOD);
    s.fill(x, 57, 16, x, 57, 20, WOOD);
  }
}

function upperWorks(s: CitadelStamp): void {
  carveEllipsoid(s, HOLLOW.works.x, HOLLOW.works.y, HOLLOW.works.z, 19, 7, 14);
  tunnel(
    s,
    [
      [-15, 52, -49],
      [-14, 51, -34],
      [-4, 50, -18],
    ],
    3,
  );
  tunnel(
    s,
    [
      [68, 52, 18],
      [48, 51, 12],
      [26, 48, 9],
    ],
    3,
  );
  tunnel(
    s,
    [
      [-4, 50, -18],
      [7, 47, -2],
      [13, 44, 6],
    ],
    4,
  );
  // Old masonry hall and mine supports.
  s.slab(-18, -24, 10, -12, 44, MOSSY_COBBLE);
  for (let x = -15; x <= 7; x += 7) {
    s.fill(x, 45, -22, x, 51, -22, WOOD);
    s.fill(x, 45, -14, x, 51, -14, WOOD);
    s.fill(x, 51, -22, x, 51, -14, WOOD);
  }
  s.set(-7, 45, -21, BOOKSHELF);
  s.set(0, 45, -21, IRON_ORE);
  s.set(6, 46, -15, LANTERN);

  // Optional crypt branch west of the works.
  tunnel(
    s,
    [
      [-13, 49, -20],
      [-25, 48, -29],
      [-36, 47, -34],
    ],
    3,
  );
  // The abbey crypt is the fourth surface entrance, joining the optional crypt branch through
  // a long pilgrim catacomb beneath the northern ridge.
  tunnel(
    s,
    [
      [-33, 47, -140],
      [-48, 46, -105],
      [-50, 46, -72],
      [-38, 47, -35],
    ],
    3,
  );
  carveEllipsoid(s, -38, 47, -35, 11, 6, 10);
  s.slab(-46, -42, -30, -29, 42, AGED_MASONRY);
  for (const x of [-43, -37, -31]) {
    s.fill(x - 1, 43, -39, x + 1, 44, -37, STONE);
    s.set(x, 45, -38, TORCH);
  }
  s.set(-38, 43, -32, GOLD_ORE);
}

function reservoir(s: CitadelStamp): void {
  const { x, y, z } = HOLLOW.reservoir;
  carveEllipsoid(s, x, y, z, 28, 14, 23);
  // Deep central lake, with a dry crescent ledge around the north wall.
  for (let wx = Math.max(s.wx0, x - 22); wx <= Math.min(s.wx1, x + 22); wx++) {
    for (let wz = Math.max(s.wz0, z - 18); wz <= Math.min(s.wz1, z + 18); wz++) {
      const d = ((wx - x) / 22) ** 2 + ((wz - z) / 18) ** 2;
      if (d <= 1) s.fill(wx, 32, wz, wx, 36, wz, WATER);
    }
  }
  // High waterfall from a fissure beneath the village market.
  s.fill(8, 38, 2, 11, 54, 4, AIR);
  s.fill(9, 38, 3, 10, 53, 3, WATER);
  floorDisc(s, 9, 3, 5, 5, 36, MOSS);
  // Collapsed bridge: intact approaches with a tempting gap over deep water.
  s.slab(-9, 8, 2, 10, 39, STONE_SLAB);
  s.slab(8, 10, 23, 12, 39, STONE_SLAB);
  for (let x0 = -8; x0 <= 22; x0 += 6) {
    if (x0 >= 3 && x0 <= 7) continue;
    s.set(x0, 40, 8, COBBLE_WALL);
    s.set(x0, 40, 12, COBBLE_WALL);
  }
  // Behind-the-fall shrine.
  carveEllipsoid(s, 10, 45, -2, 6, 5, 5);
  s.set(10, 41, -4, CRYSTAL);
  s.set(8, 41, -4, GLOWSTONE);
  s.set(12, 41, -4, GLOWSTONE);
}

function floodedMillworks(s: CitadelStamp): void {
  const { x, y, z } = HOLLOW.mill;
  tunnel(
    s,
    [
      [12, 39, 24],
      [7, 41, 35],
      [x, y, z],
    ],
    4,
  );
  carveEllipsoid(s, x, y, z, 17, 8, 14);
  s.slab(-10, 36, 17, 55, 36, MOSSY_COBBLE);
  // Parallel sluices create dry/wet route choices.
  for (const sx of [-5, 1, 7]) {
    s.fill(sx, 37, 36, sx + 2, 38, 55, sx === 1 ? WATER : AIR);
    s.fill(sx - 1, 36, 36, sx - 1, 40, 55, AGED_MASONRY);
    s.fill(sx + 3, 36, 36, sx + 3, 40, 55, AGED_MASONRY);
  }
  // Waterwheel silhouette.
  for (let y0 = 37; y0 <= 45; y0++)
    for (let z0 = 42; z0 <= 50; z0++) {
      const d = Math.hypot(y0 - 41, z0 - 46);
      if (d > 3.2 && d < 4.8) s.set(10, y0, z0, WOOD);
    }
  s.fill(9, 41, 46, 11, 41, 46, WOOD);
  s.set(-7, 38, 40, LANTERN);
  s.set(13, 38, 52, LANTERN);
}

function crystalCrossing(s: CitadelStamp): void {
  const { x, y, z } = HOLLOW.crystal;
  tunnel(
    s,
    [
      [25, 39, 14],
      [34, 36, 17],
      [x, y, z],
    ],
    4,
  );
  tunnel(
    s,
    [
      [14, 39, 50],
      [27, 36, 39],
      [39, 34, 29],
    ],
    4,
  );
  carveEllipsoid(s, x, y, z, 29, 11, 21);
  // Lower stream and high bridge form two routes through the same room.
  s.fill(x - 24, 27, z + 5, x + 24, 29, z + 8, WATER);
  s.slab(x - 22, z - 3, x + 22, z, 35, PLANKS);
  for (let bx = x - 22; bx <= x + 22; bx += 5) {
    s.set(bx, 36, z - 4, OAK_FENCE);
    s.set(bx, 36, z + 1, OAK_FENCE);
  }
  // Crystal clusters are intentionally composed rather than noise-scattered.
  const clusters: readonly Point3[] = [
    [27, 31, 12],
    [34, 29, 31],
    [44, 28, 6],
    [55, 30, 34],
    [65, 31, 17],
    [48, 39, 4],
  ];
  for (const [cx, cy, cz] of clusters) {
    s.fill(cx, cy, cz, cx, cy + 4, cz, CRYSTAL);
    s.fill(cx - 1, cy, cz, cx + 1, cy + 1, cz, CRYSTAL);
    s.set(cx, cy + 5, cz, GLOWSTONE);
  }
  // Woodland sinkhole: optional one-way-looking entrance with a return stair.
  tunnel(
    s,
    [
      [58, 62, 57],
      [56, 49, 48],
      [53, 39, 37],
    ],
    4,
  );
  steppingRamp(
    s,
    [
      [53, 34, 35],
      [56, 43, 45],
      [58, 54, 53],
      [58, 66, 57],
    ],
    3,
  );
}

function greatRift(s: CitadelStamp): void {
  const { x, y, z } = HOLLOW.rift;
  tunnel(
    s,
    [
      [25, 32, 25],
      [7, 30, 29],
      [x, 29, z],
    ],
    4,
  );
  carveEllipsoid(s, x, y, z, 20, 22, 30);
  carveEllipsoid(s, x - 4, y - 4, z + 3, 13, 19, 24);
  // Balcony reveal and a switchback descent hugging the west wall.
  s.slab(0, 18, 8, 29, 39, DEEPSLATE);
  steppingRamp(
    s,
    [
      [2, 39, 24],
      [-3, 35, 39],
      [-20, 30, 43],
      [-25, 25, 28],
      [-18, 21, 13],
    ],
    3,
  );
  // Long waterfall visible from every level, caught in a lower basin.
  s.fill(4, 17, 49, 6, 46, 50, WATER);
  floorDisc(s, 5, 49, 8, 7, 16, WATER);
  // A suspended bridge crosses the void halfway down.
  s.slab(-25, 26, 3, 28, 29, PLANKS);
  for (let bx = -24; bx <= 2; bx += 4) {
    s.set(bx, 30, 25, OAK_FENCE);
    s.set(bx, 30, 29, OAK_FENCE);
  }
  for (const [sx, sy, sz] of [
    [-27, 43, 22],
    [-22, 38, 50],
    [4, 45, 17],
    [-3, 37, 55],
  ] as const) {
    s.fill(sx, sy - 3, sz, sx, sy, sz, STALACTITE);
  }
}

function emberDescent(s: CitadelStamp): void {
  tunnel(
    s,
    [
      [-18, 21, 13],
      [-31, 20, 5],
      [-43, 18, -2],
      [-39, 16, -13],
    ],
    4,
  );
  carveEllipsoid(s, -43, 19, -2, 17, 9, 15);
  // Basalt islands wind between two contained lava channels.
  for (let z = -14; z <= 10; z++) {
    const x = -47 + Math.round(Math.sin(z * 0.28) * 4);
    s.fill(x - 4, 12, z, x - 2, 14, z, BASALT);
    s.fill(x + 3, 12, z, x + 6, 14, z, LAVA);
  }
  steppingRamp(
    s,
    [
      [-34, 21, 8],
      [-47, 18, 3],
      [-39, 16, -13],
    ],
    3,
  );
  s.fill(-52, 16, 5, -50, 25, 7, LAVA); // lavafall beside, not across, the route
  s.fill(-53, 14, 3, -49, 15, 9, MAGMA);
  s.set(-36, 17, -8, GLOWSTONE);
}

function obsidianConfluence(s: CitadelStamp): void {
  const { x, y, z } = HOLLOW.confluence;
  tunnel(
    s,
    [
      [-39, 16, -13],
      [x, y, z],
      [-13, 14, -24],
    ],
    5,
  );
  carveEllipsoid(s, x, y, z, 25, 10, 20);
  floorDisc(s, x, z, 22, 17, 8, OBSIDIAN);
  // A cool river and hot river meet across a jagged obsidian delta.
  s.fill(-48, 9, -14, -29, 11, -9, LAVA);
  s.fill(-29, 9, -7, -8, 11, -3, WATER);
  for (let dx = -34; dx <= -20; dx++)
    for (let dz = -11; dz <= -1; dz++) {
      const r = hash2(dx, dz, 0x0b51d1a);
      s.set(dx, 11 + (r < 0.18 ? 1 : 0), dz, r < 0.7 ? OBSIDIAN : BASALT);
    }
  // Waterfall enters from the Great Rift and terminates visibly at the delta.
  s.fill(-12, 12, 3, -10, 25, 4, WATER);
  s.set(-24, 12, -4, CRYSTAL);
  s.set(-36, 12, -7, MAGMA);
  s.set(-29, 13, 0, GLOWSTONE);
}

function heartforge(s: CitadelStamp): void {
  const { x, y, z } = HOLLOW.heartforge;
  tunnel(
    s,
    [
      [-13, 14, -24],
      [-2, 13, -35],
      [x, y, z],
    ],
    4,
  );
  carveEllipsoid(s, x, y, z, 23, 10, 18);
  floorDisc(s, x, z, 20, 15, 5, DEEPSLATE);
  // Ruined forge-temple: a raised ring over a contained magma fissure.
  s.outline(-14, -58, 18, -38, 6, AGED_MASONRY);
  for (const [px, pz] of [
    [-12, -56],
    [16, -56],
    [-12, -40],
    [16, -40],
  ] as const) {
    s.fill(px, 6, pz, px, 14, pz, BASALT);
    s.set(px, 15, pz, GLOWSTONE);
  }
  s.fill(-8, 6, -51, 12, 7, -45, MAGMA);
  s.fill(-5, 8, -50, 9, 8, -46, OBSIDIAN);
  s.set(2, 9, -48, CRYSTAL);
  s.set(1, 8, -48, GOLD_ORE);
  s.set(3, 8, -48, EMERALD_ORE);
  s.fill(-19, 7, -49, -15, 9, -47, LAVA);
  // Royal vault nook.
  carveEllipsoid(s, -8, 11, -65, 7, 5, 6);
  tunnel(
    s,
    [
      [-7, 11, -58],
      [-8, 11, -64],
    ],
    2,
  );
  s.set(-10, 7, -67, GOLD_ORE);
  s.set(-8, 7, -67, EMERALD_ORE);
  s.set(-6, 7, -67, CRYSTAL);
}

function returnLift(s: CitadelStamp): void {
  const { x, y, z } = HOLLOW.lift;
  tunnel(
    s,
    [
      [10, 12, -51],
      [x, y, z],
    ],
    3,
  );
  s.fill(x - 2, y, z - 2, x + 2, KINGSHOLLOW.castleY, z + 2, AIR);
  spiralStair(s, x, z, y, KINGSHOLLOW.castleY, BASALT, DEEPSLATE);
  for (let level = y + 4; level < KINGSHOLLOW.castleY; level += 7) {
    s.set(x - 2, level, z, GLOWSTONE);
  }
  s.outline(x - 2, z - 2, x + 2, z + 2, KINGSHOLLOW.castleY + 1, AGED_MASONRY);
}

export function kingshollowUnderground(): Overlay {
  return (chunk, cx, cz) => {
    const s = new CitadelStamp(chunk, cx, cz);
    // The complete authored footprint. Most streamed countryside chunks can return immediately.
    if (s.wx1 < -76 || s.wx0 > 82 || s.wz1 < -146 || s.wz0 > 66) return;
    castleWell(s);
    quarryEntrance(s);
    upperWorks(s);
    reservoir(s);
    floodedMillworks(s);
    crystalCrossing(s);
    greatRift(s);
    emberDescent(s);
    obsidianConfluence(s);
    heartforge(s);
    returnLift(s);
  };
}
