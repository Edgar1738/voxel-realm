/** Authored district belt around Kingshollow's original castle village. */
import {
  AGED_MASONRY,
  AIR,
  BROWN_SLATE,
  CLAY_ROOF,
  COBBLESTONE,
  COBBLE_WALL,
  CRYSTAL,
  DIRT,
  FLOWER,
  GLASS,
  GLOWSTONE,
  GRAVEL,
  LANTERN,
  LEAVES,
  MOSSY_COBBLE,
  OAK_FENCE,
  STONE,
  STONE_SLAB,
  TORCH,
  WARM_MASONRY,
  WATER,
  WOOD,
} from '../blocks/blocks';
import { CitadelStamp, hash2, spiralStair } from './CitadelStamp';
import { KINGSHOLLOW } from './KingshollowGenerator';
import type { BlockId } from '../core/types';
import type { Overlay } from './Generator';
import {
  buildTimberHouse,
  KINGSHOLLOW_HOUSE_PALETTES,
  type HouseFacing,
} from './kingshollowArchitecture';

const G = KINGSHOLLOW.villageY;
const A = KINGSHOLLOW.abbeyY;

function road(
  s: CitadelStamp,
  points: readonly (readonly [number, number])[],
  y = G,
  half = 1,
): void {
  for (let p = 0; p < points.length - 1; p++) {
    const [x0, z0] = points[p],
      [x1, z1] = points[p + 1];
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(z1 - z0));
    for (let i = 0; i <= steps; i++) {
      const x = Math.round(x0 + ((x1 - x0) * i) / steps);
      const z = Math.round(z0 + ((z1 - z0) * i) / steps);
      const alongX = Math.abs(x1 - x0) >= Math.abs(z1 - z0);
      for (let n = -half; n <= half; n++) {
        const px = x + (alongX ? 0 : n),
          pz = z + (alongX ? n : 0);
        s.fill(px, y - 3, pz, px, y, pz, hash2(px, pz, 0x711) < 0.72 ? COBBLESTONE : GRAVEL);
        s.fill(px, y + 1, pz, px, y + 3, pz, AIR);
      }
    }
  }
}

function house(
  s: CitadelStamp,
  x: number,
  z: number,
  w: number,
  d: number,
  y: number,
  face: HouseFacing,
  roof: BlockId,
): void {
  buildTimberHouse(s, {
    x,
    z,
    width: w,
    depth: d,
    floorY: y,
    facing: face,
    palette:
      roof === BROWN_SLATE ? KINGSHOLLOW_HOUSE_PALETTES.slate : KINGSHOLLOW_HOUSE_PALETTES.clay,
    stories: w >= 15 ? 2 : 1,
    porch: true,
    variant: x * 31 + z,
  });
}

function bridge(s: CitadelStamp, z: number): void {
  s.fill(92, G - 3, z - 3, 124, G, z + 3, STONE);
  s.slab(91, z - 3, 125, z + 3, G + 1, STONE_SLAB);
  for (let x = 92; x <= 124; x += 4) {
    s.set(x, G + 2, z - 4, COBBLE_WALL);
    s.set(x, G + 2, z + 4, COBBLE_WALL);
  }
  s.fill(101, G - 2, z - 2, 115, G, z + 2, AIR);
}

function gate(s: CitadelStamp): void {
  for (const x of [-9, 9]) {
    s.fill(x - 4, G, 89, x + 4, G + 10, 97, AGED_MASONRY);
    s.fill(x - 2, G + 2, 91, x + 2, G + 8, 95, AIR);
    s.outline(x - 5, 88, x + 5, 98, G + 11, STONE);
  }
  s.fill(-5, G + 7, 91, 5, G + 10, 95, AGED_MASONRY);
  s.fill(-4, G + 1, 92, 4, G + 6, 94, AIR);
  s.set(-6, G + 3, 91, LANTERN);
  s.set(6, G + 3, 91, LANTERN);
}

function merchantWard(s: CitadelStamp): void {
  gate(s);
  road(
    s,
    [
      [0, 72],
      [0, 178],
    ],
    G,
    2,
  );
  road(
    s,
    [
      [-55, 124],
      [55, 124],
    ],
    G,
    1,
  );
  house(s, -34, 101, 18, 14, G, 'e', BROWN_SLATE); // inn
  house(s, 18, 103, 17, 12, G, 'w', CLAY_ROOF); // stable
  house(s, -30, 133, 15, 13, G, 'e', CLAY_ROOF); // guildhall
  house(s, 17, 137, 13, 16, G, 'w', BROWN_SLATE); // chapel
  for (const [x, z, f] of [
    [-49, 153, 'e'],
    [-34, 158, 'e'],
    [28, 158, 'w'],
    [43, 151, 'w'],
  ] as const)
    house(s, x, z, 10, 9, G, f, hash2(x, z, 4) < 0.5 ? CLAY_ROOF : BROWN_SLATE);
  // Stable yard and merchant awnings.
  s.outline(35, 104, 53, 119, G + 1, OAK_FENCE);
  for (const x of [-11, -4, 5, 12]) {
    s.slab(x, 119, x + 4, 122, G + 4, x < 0 ? CLAY_ROOF : BROWN_SLATE);
    for (const dx of [0, 4]) s.fill(x + dx, G + 1, 119, x + dx, G + 3, 119, OAK_FENCE);
  }
}

function watermill(s: CitadelStamp): void {
  house(s, 118, 34, 15, 12, G, 'w', BROWN_SLATE);
  s.fill(114, G - 2, 35, 117, G, 43, STONE);
  for (let y = G - 2; y <= G + 7; y++)
    for (let z = 35; z <= 44; z++) {
      const d = Math.hypot(y - (G + 2), z - 39.5);
      if (d > 3.3 && d < 5) s.set(117, y, z, WOOD);
    }
  s.fill(104, G - 1, 39, 116, G - 1, 41, WATER);
}

function industry(s: CitadelStamp): void {
  road(
    s,
    [
      [72, 2],
      [178, 2],
    ],
    G,
    2,
  );
  bridge(s, 2);
  road(
    s,
    [
      [132, -42],
      [132, 70],
    ],
    G,
    1,
  );
  house(s, 78, 14, 16, 12, G, 'e', BROWN_SLATE); // quarry office
  house(s, 138, -22, 17, 14, G, 'w', BROWN_SLATE); // forge
  house(s, 142, 18, 20, 13, G, 'w', CLAY_ROOF); // warehouse
  house(s, 138, 48, 14, 11, G, 'w', BROWN_SLATE); // tannery
  watermill(s);
  for (const [x, z] of [
    [164, -16],
    [164, 8],
    [165, 35],
    [156, 56],
  ] as const)
    house(s, x, z, 10, 9, G, 'w', CLAY_ROOF);
  // Quarry crane above the existing cave entrance.
  s.fill(82, G + 1, 23, 82, G + 12, 23, WOOD);
  s.fill(82, G + 12, 23, 94, G + 12, 23, WOOD);
  s.fill(92, G + 7, 23, 92, G + 11, 23, OAK_FENCE);
}

function windmill(s: CitadelStamp): void {
  const x = -145,
    z = 18;
  s.fill(x - 6, G - 2, z - 6, x + 6, G, z + 6, STONE);
  s.walls(x - 5, G + 1, z - 5, x + 5, G + 13, z + 5, WARM_MASONRY);
  s.fill(x - 4, G + 1, z - 4, x + 4, G + 12, z + 4, AIR);
  s.slab(x - 6, z - 6, x + 6, z + 6, G + 14, BROWN_SLATE);
  s.fill(x, G + 4, z - 6, x, G + 16, z - 6, WOOD);
  s.fill(x - 7, G + 10, z - 6, x + 7, G + 10, z - 6, WOOD);
  s.set(x, G + 10, z - 7, GLOWSTONE);
}

function field(s: CitadelStamp, x0: number, z0: number, x1: number, z1: number): void {
  s.outline(x0, z0, x1, z1, G + 1, OAK_FENCE);
  for (let x = x0 + 2; x < x1; x++)
    for (let z = z0 + 2; z < z1; z++) {
      s.set(x, G, z, (x - x0) % 5 === 0 ? WATER : DIRT);
      if ((x + z) % 3 === 0) s.set(x, G + 1, z, FLOWER);
    }
}

function farms(s: CitadelStamp): void {
  road(
    s,
    [
      [-72, 2],
      [-176, 2],
      [-176, 82],
    ],
    G,
    1,
  );
  road(
    s,
    [
      [-176, 48],
      [-72, 48],
    ],
    G,
    1,
  );
  windmill(s);
  house(s, -125, 52, 19, 15, G, 'e', CLAY_ROOF); // manor farm
  house(s, -174, 38, 22, 13, G, 's', BROWN_SLATE); // barn
  house(s, -174, 68, 20, 12, G, 'n', BROWN_SLATE); // granary
  for (const [x, z] of [
    [-101, 12],
    [-104, 80],
    [-142, 91],
    [-181, 12],
    [-92, 35],
  ] as const)
    house(s, x, z, 10, 9, G, x < -130 ? 'e' : 'w', CLAY_ROOF);
  field(s, -137, 70, -106, 94);
  field(s, -183, -8, -154, 23);
  // Orchard grid.
  for (let x = -151; x <= -115; x += 9)
    for (let z = 28; z <= 45; z += 9) {
      s.fill(x, G + 1, z, x, G + 4, z, WOOD);
      s.fill(x - 2, G + 4, z - 2, x + 2, G + 6, z + 2, LEAVES);
    }
}

function abbey(s: CitadelStamp): void {
  road(
    s,
    [
      [-28, -67],
      [-42, -94],
      [0, -112],
      [0, -178],
    ],
    A,
    1,
  );
  // Nave, transept, and bell tower.
  s.fill(-15, A - 2, -162, 15, A, -119, STONE);
  s.walls(-12, A + 1, -160, 12, A + 13, -121, AGED_MASONRY);
  s.fill(-11, A + 1, -159, 11, A + 12, -122, AIR);
  s.walls(-23, A + 1, -147, 23, A + 10, -133, AGED_MASONRY);
  s.fill(-22, A + 1, -146, 22, A + 9, -134, AIR);
  s.fill(-5, A + 1, -165, 5, A + 23, -155, WARM_MASONRY);
  s.fill(-4, A + 2, -164, 4, A + 21, -156, AIR);
  s.slab(-13, -161, 13, -120, A + 14, BROWN_SLATE);
  for (const z of [-152, -140, -128]) {
    s.set(-12, A + 6, z, GLASS);
    s.set(12, A + 6, z, GLASS);
  }
  s.fill(-2, A + 1, -121, 2, A + 5, -121, AIR);
  s.set(0, A + 2, -153, GLOWSTONE);
  // Cloister, hostel, cemetery, and crypt shaft.
  s.outline(18, -162, 47, -128, A + 1, AGED_MASONRY);
  house(s, 52, -151, 17, 12, A, 'w', BROWN_SLATE);
  for (let x = -52; x <= -26; x += 7)
    for (let z = -160; z <= -126; z += 9) s.fill(x, A + 1, z, x + 2, A + 2, z + 4, STONE);
  s.fill(-35, 47, -142, -31, A, -138, AIR);
  spiralStair(s, -33, -140, 47, A, COBBLESTONE, STONE);
  s.outline(-36, -143, -30, -137, A + 1, COBBLE_WALL);
  // Ridge watchtower.
  s.fill(74, A - 2, -147, 86, A + 15, -135, AGED_MASONRY);
  s.fill(77, A + 1, -144, 83, A + 13, -138, AIR);
  s.outline(72, -149, 88, -133, A + 16, STONE);
}

function wilderness(s: CitadelStamp): void {
  // Sparse discoveries at the edge of the authored belt.
  s.fill(-226, G - 2, -43, -214, G + 13, -31, MOSSY_COBBLE);
  s.fill(-223, G + 1, -40, -217, G + 11, -34, AIR); // western hunting tower
  for (const [x, z] of [
    [196, 112],
    [203, 119],
    [210, 110],
    [217, 121],
    [224, 113],
  ] as const)
    s.fill(x, G, z, x, G + 7 + ((x + z) & 3), z, STONE); // standing stones
  house(s, 184, -108, 11, 10, G, 's', BROWN_SLATE); // forest lodge
  // Ruined aqueduct approaching the eastern river.
  for (let x = 165; x <= 225; x += 10) {
    s.fill(x, G, -72, x + 2, G + 12, -70, AGED_MASONRY);
    s.fill(x + 3, G + 10, -72, x + 9, G + 12, -70, AGED_MASONRY);
  }
  s.set(210, G + 2, 113, CRYSTAL);
  s.set(-220, G + 3, -37, TORCH);
}

export function kingshollowExpansion(): Overlay {
  return (chunk, cx, cz) => {
    const s = new CitadelStamp(chunk, cx, cz);
    if (s.wx1 < -235 || s.wx0 > 235 || s.wz1 < -185 || s.wz0 > 185) return;
    merchantWard(s);
    industry(s);
    farms(s);
    abbey(s);
    wilderness(s);
  };
}
