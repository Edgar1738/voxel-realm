import {
  AGED_MASONRY,
  AIR,
  BROWN_SLATE,
  CLAY_ROOF,
  COBBLESTONE,
  COBBLE_WALL,
  DIRT,
  FLOWER,
  GLASS,
  GRASS,
  GRAVEL,
  LANTERN,
  OAK_FENCE,
  PLANKS,
  STONE,
  STONE_SLAB,
  TORCH,
  WARM_MASONRY,
  WOOD,
} from '../blocks/blocks';
import { CitadelStamp, hash2 } from './CitadelStamp';
import { KINGSHOLLOW } from './KingshollowGenerator';
import {
  buildTimberHouse,
  KINGSHOLLOW_HOUSE_PALETTES,
  type HouseFacing,
} from './kingshollowArchitecture';
import type { Overlay } from './Generator';

const G = KINGSHOLLOW.villageY;
const C = KINGSHOLLOW.castleY;

function road(s: CitadelStamp, x0: number, z0: number, x1: number, z1: number, y = G): void {
  const steps = Math.max(Math.abs(x1 - x0), Math.abs(z1 - z0));
  for (let i = 0; i <= steps; i++) {
    const x = Math.round(x0 + ((x1 - x0) * i) / steps);
    const z = Math.round(z0 + ((z1 - z0) * i) / steps);
    const horizontal = Math.abs(x1 - x0) >= Math.abs(z1 - z0);
    for (let side = -1; side <= 1; side++) {
      const px = x + (horizontal ? 0 : side);
      const pz = z + (horizontal ? side : 0);
      s.set(px, y, pz, hash2(px, pz, 91) < 0.72 ? COBBLESTONE : GRAVEL);
      s.fill(px, y + 1, pz, px, y + 3, pz, AIR);
    }
  }
}

function castle(s: CitadelStamp): void {
  const x0 = -25,
    x1 = 25,
    z0 = -67,
    z1 = -28;
  s.slab(x0, z0, x1, z1, C, STONE);
  s.walls(x0, C + 1, z0, x1, C + 7, z1, AGED_MASONRY);
  // South gate and bridge down from the motte.
  s.fill(-3, C + 1, z1, 3, C + 5, z1, AIR);
  road(s, 0, -28, 0, -12, C);
  for (let z = -27; z <= -13; z++) {
    const y = C - Math.floor((-13 - z) / 3);
    s.fill(-2, y, z, 2, y, z, STONE_SLAB);
  }
  // Four squat towers, capped with battlements.
  for (const [x, z] of [
    [x0, z0],
    [x1, z0],
    [x0, z1],
    [x1, z1],
  ] as const) {
    s.fill(x - 3, C, z - 3, x + 3, C + 10, z + 3, AGED_MASONRY);
    s.fill(x - 2, C + 2, z - 2, x + 2, C + 8, z + 2, AIR);
    s.outline(x - 4, z - 4, x + 4, z + 4, C + 11, STONE);
    for (let q = -4; q <= 4; q += 2) {
      s.set(x + q, C + 12, z - 4, STONE);
      s.set(x + q, C + 12, z + 4, STONE);
      s.set(x - 4, C + 12, z + q, STONE);
      s.set(x + 4, C + 12, z + q, STONE);
    }
  }
  // Manor keep and a warm central great hall.
  s.walls(-11, C + 1, -59, 11, C + 12, -39, WARM_MASONRY);
  s.fill(-10, C + 1, -58, 10, C + 11, -40, AIR);
  s.slab(-11, -59, 11, -39, C + 13, BROWN_SLATE);
  s.fill(-8, C + 1, -42, 8, C + 1, -42, PLANKS);
  s.fill(-2, C + 1, -39, 2, C + 4, -39, AIR);
  for (const x of [-7, 0, 7]) {
    s.set(x, C + 5, -39, GLASS);
    s.set(x, C + 5, -59, GLASS);
  }
  s.set(0, C + 2, -53, LANTERN);
  s.set(-8, C + 2, -53, TORCH);
  s.set(8, C + 2, -53, TORCH);
}

function market(s: CitadelStamp): void {
  s.slab(-14, -8, 14, 10, G, GRAVEL);
  // Village well.
  s.outline(-2, 0, 2, 4, G + 1, COBBLE_WALL);
  s.fill(-2, G + 2, 0, -2, G + 4, 4, WOOD);
  s.fill(2, G + 2, 0, 2, G + 4, 4, WOOD);
  s.slab(-3, -1, 3, 5, G + 5, BROWN_SLATE);
  // Four open stalls.
  for (const [x, z] of [
    [-11, -5],
    [7, -5],
    [-11, 6],
    [7, 6],
  ] as const) {
    s.slab(x, z, x + 4, z + 2, G + 1, PLANKS);
    for (const dx of [0, 4])
      for (const dz of [0, 2]) s.fill(x + dx, G + 2, z + dz, x + dx, G + 4, z + dz, OAK_FENCE);
    s.slab(x, z, x + 4, z + 2, G + 5, CLAY_ROOF);
    s.set(x + 2, G + 3, z + 1, LANTERN);
  }
}

function fields(s: CitadelStamp): void {
  for (const [x0, z0, x1, z1] of [
    [-68, 14, -45, 31],
    [45, 16, 68, 34],
    [-61, 41, -35, 57],
  ] as const) {
    s.outline(x0, z0, x1, z1, G + 1, OAK_FENCE);
    for (let z = z0 + 2; z < z1; z++)
      for (let x = x0 + 2; x < x1; x++) {
        s.set(x, G, z, ((x - x0) & 3) === 0 ? GRAVEL : DIRT);
        if (((x + z) & 1) === 0) s.set(x, G + 1, z, FLOWER);
      }
  }
}

function buildVillage(s: CitadelStamp): void {
  road(s, 0, 72, 0, -16);
  road(s, -72, 2, 72, 2);
  road(s, -48, 48, 48, 48);
  road(s, -48, 2, -48, 48);
  road(s, 48, 2, 48, 48);
  market(s);
  const homes: ReadonlyArray<readonly [number, number, number, number, HouseFacing, number]> = [
    [-38, -12, 12, 10, 'e', 0],
    [-38, 12, 11, 9, 'e', 1],
    [-30, 31, 12, 10, 's', 0],
    [27, -12, 12, 10, 'w', 1],
    [28, 13, 10, 9, 'w', 0],
    [18, 30, 13, 11, 's', 1],
    [-16, 54, 11, 9, 'n', 1],
    [8, 55, 12, 9, 'n', 0],
    [-66, -5, 11, 9, 'e', 1],
    [55, -4, 11, 9, 'w', 0],
    [-64, 36, 10, 9, 'e', 0],
    [54, 41, 11, 9, 'w', 1],
  ];
  for (const [x, z, w, d, facing, dark] of homes)
    buildTimberHouse(s, {
      x,
      z,
      width: w,
      depth: d,
      floorY: G,
      facing,
      palette: dark ? KINGSHOLLOW_HOUSE_PALETTES.slate : KINGSHOLLOW_HOUSE_PALETTES.clay,
      stories: w >= 12 && d >= 10 ? 2 : 1,
      porch: true,
      variant: x * 31 + z,
    });
  fields(s);
  // Green, orchard, and lantern rhythm along the main lane.
  s.slab(-18, 63, 18, 74, G, GRASS);
  for (let z = -12; z <= 68; z += 10) {
    s.set(-4, G + 1, z, COBBLE_WALL);
    s.set(-4, G + 2, z, LANTERN);
  }
}

export function kingshollowSite(): Overlay {
  return (chunk, cx, cz) => {
    const s = new CitadelStamp(chunk, cx, cz);
    buildVillage(s);
    castle(s);
  };
}
