import {
  AIR,
  BOOKSHELF,
  BRICK,
  COBBLESTONE,
  FURNACE,
  GLASS,
  LANTERN,
  LEAVES,
  OAK_DOOR,
  OAK_FENCE,
  PLANKS,
  STONE,
  TERRACOTTA,
  WOOD,
} from '../blocks/blocks';
import { CitadelStamp } from './CitadelStamp';
import {
  garden,
  lampPost,
  pavedPlaza,
  pitchedRoof,
  timberFacade,
} from './grandKeepCapitalPrimitives';

type Builder = (s: CitadelStamp, x: number, y: number, z: number) => void;

function houseShell(
  s: CitadelStamp,
  x: number,
  y: number,
  z: number,
  w: number,
  d: number,
  h: number,
  stoneStorey = 3,
): void {
  s.slab(x, z, x + w - 1, z + d - 1, y - 1, COBBLESTONE);
  s.walls(x, y, z, x + w - 1, y + stoneStorey - 1, z + d - 1, STONE);
  s.walls(x, y + stoneStorey, z, x + w - 1, y + h - 1, z + d - 1, PLANKS);
  s.fill(x + 1, y, z + 1, x + w - 2, y + h - 1, z + d - 2, AIR);
  s.slab(x + 1, z + 1, x + w - 2, z + d - 2, y + stoneStorey, PLANKS);
  s.set(x + Math.floor(w / 2), y, z, OAK_DOOR);
  timberFacade(s, x, y + stoneStorey, z, x + w - 1, y + h - 1, 'south');
  pitchedRoof(s, x, z, x + w - 1, z + d - 1, y + h, 'x');
}

export const merchantHouse: Builder = (s, x, y, z) => {
  houseShell(s, x, y, z, 7, 7, 7);
  s.fill(x + 1, y + 1, z, x + 5, y + 2, z, GLASS);
  s.fill(x + 1, y, z + 5, x + 5, y, z + 5, PLANKS);
};

export const townhouse: Builder = (s, x, y, z) => {
  houseShell(s, x, y, z, 6, 8, 10);
  s.slab(x + 1, z + 1, x + 4, z + 6, y + 6, PLANKS);
  lampPost(s, x - 1, y, z);
};

export const coachingInn: Builder = (s, x, y, z) => {
  houseShell(s, x, y, z, 12, 8, 8);
  stableYard(s, x + 13, y, z, 8, 8);
  s.set(x + 2, y + 2, z, LANTERN);
  s.set(x + 9, y + 2, z, LANTERN);
};

export function stableYard(s: CitadelStamp, x: number, y: number, z: number, w = 8, d = 8): void {
  s.outline(x, z, x + w - 1, z + d - 1, y, OAK_FENCE);
  s.fill(x, y + 1, z + d - 1, x + w - 1, y + 4, z + d - 1, WOOD);
  s.slab(x, z + d - 2, x + w - 1, z + d, y + 5, PLANKS);
}

export const guildhall: Builder = (s, x, y, z) => {
  houseShell(s, x, y, z, 13, 10, 10, 6);
  for (let px = x + 2; px <= x + 10; px += 4) s.fill(px, y, z - 1, px, y + 5, z - 1, STONE);
  pavedPlaza(s, x - 2, z - 5, x + 14, z - 2, y - 1);
};

export const countingHouse: Builder = (s, x, y, z) => {
  houseShell(s, x, y, z, 9, 9, 9, 6);
  s.fill(x + 2, y + 1, z + 2, x + 6, y + 4, z + 2, BOOKSHELF);
};

export const cathedral: Builder = (s, x, y, z) => {
  s.slab(x, z, x + 14, z + 25, y - 1, STONE);
  s.walls(x, y, z, x + 14, y + 13, z + 19, STONE);
  s.fill(x + 1, y, z + 1, x + 13, y + 12, z + 18, AIR);
  pitchedRoof(s, x, z, x + 14, z + 19, y + 14, 'z', BRICK);
  s.fill(x + 5, y, z, x + 9, y + 6, z, AIR);
  for (let wz = z + 4; wz < z + 18; wz += 5) {
    s.fill(x, y + 5, wz, x, y + 8, wz, GLASS);
    s.fill(x + 14, y + 5, wz, x + 14, y + 8, wz, GLASS);
  }
  cloister(s, x, y, z + 20);
};

export function cloister(s: CitadelStamp, x: number, y: number, z: number): void {
  s.outline(x, z, x + 14, z + 14, y, STONE);
  s.outline(x + 3, z + 3, x + 11, z + 11, y + 1, STONE);
  garden(s, x + 4, z + 4, x + 10, z + 10, y - 1);
}

export const workshop: Builder = (s, x, y, z) => {
  houseShell(s, x, y, z, 8, 7, 6);
  s.set(x + 2, y, z + 2, FURNACE);
  s.set(x + 3, y, z + 2, FURNACE);
};

export const warehouse: Builder = (s, x, y, z) => {
  s.slab(x, z, x + 11, z + 8, y - 1, COBBLESTONE);
  s.walls(x, y, z, x + 11, y + 7, z + 8, BRICK);
  s.fill(x + 4, y, z, x + 7, y + 4, z, AIR);
  pitchedRoof(s, x, z, x + 11, z + 8, y + 8, 'x', PLANKS);
};

export const villa: Builder = (s, x, y, z) => {
  houseShell(s, x, y, z, 11, 9, 8, 5);
  garden(s, x + 12, z, x + 20, z + 8, y - 1);
};

export const suburbCottage: Builder = (s, x, y, z) => houseShell(s, x, y, z, 6, 6, 5, 2);

export const roadsideChapel: Builder = (s, x, y, z) => {
  s.walls(x, y, z, x + 6, y + 7, z + 10, STONE);
  s.fill(x + 1, y, z + 1, x + 5, y + 6, z + 9, AIR);
  s.fill(x + 2, y, z, x + 4, y + 3, z, AIR);
  pitchedRoof(s, x, z, x + 6, z + 10, y + 8, 'z');
  s.set(x + 3, y + 5, z, GLASS);
};

export const farmstead: Builder = (s, x, y, z) => {
  suburbCottage(s, x, y, z);
  orchard(s, x + 8, y, z, 3, 3);
  windmill(s, x, y, z + 9);
};

export function orchard(
  s: CitadelStamp,
  x: number,
  y: number,
  z: number,
  cols = 3,
  rows = 3,
): void {
  for (let ix = 0; ix < cols; ix++)
    for (let iz = 0; iz < rows; iz++) {
      const tx = x + ix * 4;
      const tz = z + iz * 4;
      s.fill(tx, y, tz, tx, y + 3, tz, WOOD);
      s.fill(tx - 1, y + 3, tz - 1, tx + 1, y + 5, tz + 1, LEAVES);
    }
}

export function windmill(s: CitadelStamp, x: number, y: number, z: number): void {
  s.walls(x, y, z, x + 6, y + 9, z + 6, TERRACOTTA);
  s.fill(x + 1, y, z + 1, x + 5, y + 8, z + 5, AIR);
  pitchedRoof(s, x, z, x + 6, z + 6, y + 10, 'x');
  const cx = x + 3;
  s.fill(cx, y + 4, z - 2, cx, y + 10, z - 2, WOOD);
  s.fill(cx - 3, y + 7, z - 2, cx + 3, y + 7, z - 2, WOOD);
}
