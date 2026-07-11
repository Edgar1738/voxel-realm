import {
  AIR,
  BOOKSHELF,
  BRICK,
  COBBLESTONE,
  FURNACE,
  GLASS,
  GRAVEL,
  LANTERN,
  LEAVES,
  PLANKS,
  STONE,
  WOOD,
} from '../blocks/blocks';
import { CitadelStamp, hash2 } from './CitadelStamp';
import { G } from './grandKeepFrame';

type Door = 'north' | 'south' | 'east' | 'west';

function road(s: CitadelStamp, x0: number, z0: number, x1: number, z1: number): void {
  const minX = Math.max(Math.min(x0, x1), s.wx0);
  const maxX = Math.min(Math.max(x0, x1), s.wx1);
  const minZ = Math.max(Math.min(z0, z1), s.wz0);
  const maxZ = Math.min(Math.max(z0, z1), s.wz1);
  for (let z = minZ; z <= maxZ; z++) {
    for (let x = minX; x <= maxX; x++) {
      const r = hash2(x, z, 0xca91);
      s.set(x, G, z, r < 0.72 ? COBBLESTONE : r < 0.9 ? STONE : GRAVEL);
      s.fill(x, G + 1, z, x, G + 4, z, AIR);
    }
  }
}

function building(
  s: CitadelStamp,
  x: number,
  z: number,
  w: number,
  d: number,
  floors: number,
  door: Door,
  groundBlock = BRICK,
): void {
  const x1 = x + w - 1;
  const z1 = z + d - 1;
  const top = G + floors * 5;
  s.slab(x, z, x1, z1, G, STONE);
  s.walls(x, G + 1, z, x1, top, z1, groundBlock);
  s.fill(x + 1, G + 1, z + 1, x1 - 1, top - 1, z1 - 1, AIR);
  for (let floor = 1; floor < floors; floor++) {
    s.slab(x + 1, z + 1, x1 - 1, z1 - 1, G + floor * 5, PLANKS);
  }
  const mx = (x + x1) >> 1;
  const mz = (z + z1) >> 1;
  if (door === 'north') s.fill(mx - 1, G + 1, z1, mx + 1, G + 3, z1, AIR);
  if (door === 'south') s.fill(mx - 1, G + 1, z, mx + 1, G + 3, z, AIR);
  if (door === 'east') s.fill(x1, G + 1, mz - 1, x1, G + 3, mz + 1, AIR);
  if (door === 'west') s.fill(x, G + 1, mz - 1, x, G + 3, mz + 1, AIR);
  for (let y = G + 3; y < top; y += 5) {
    s.set(mx, y, z, GLASS);
    s.set(mx, y, z1, GLASS);
    s.set(x, y, mz, GLASS);
    s.set(x1, y, mz, GLASS);
  }
  // Stepped high-medieval roof silhouette.
  for (let inset = 0; inset <= Math.min(3, Math.floor((w - 1) / 2)); inset++) {
    s.slab(x + inset, z, x1 - inset, z1, top + inset, WOOD);
  }
  s.set(mx, top + 4, mz, LANTERN);
}

function square(s: CitadelStamp, x0: number, z0: number, x1: number, z1: number): void {
  road(s, x0, z0, x1, z1);
}

function lineHouses(
  s: CitadelStamp,
  x: number,
  z: number,
  count: number,
  dx: number,
  dz: number,
  door: Door,
  floors = 3,
): void {
  for (let i = 0; i < count; i++) {
    building(s, x + dx * i, z + dz * i, 10, 9, floors + (i % 2), door);
  }
}

/** Planned boroughs between the historic curtain and the complete capital wall. */
export function buildCapitalDistricts(s: CitadelStamp): void {
  // Royal processional spine: exact approved x=4..12 corridor.
  road(s, 4, -220, 12, -86);
  road(s, 4, 126, 12, 260);

  // Crown Market and its guildhall/counting-house civic edge.
  square(s, 24, -132, 58, -108);
  s.outline(42, -123, 48, -117, G + 1, STONE);
  s.fill(45, G + 1, -120, 45, G + 5, -120, COBBLESTONE);
  s.set(45, G + 6, -120, LANTERN);
  building(s, 60, -132, 18, 14, 3, 'west', STONE);
  building(s, 60, -108, 18, 13, 3, 'west', BRICK);
  s.set(64, G + 2, -128, STONE);
  s.set(64, G + 2, -104, BRICK);
  for (let x = 28; x <= 52; x += 6) {
    s.fill(x, G + 1, -128, x + 3, G + 1, -126, PLANKS);
    s.fill(x, G + 2, -128, x, G + 4, -128, WOOD);
    s.fill(x + 3, G + 2, -128, x + 3, G + 4, -128, WOOD);
    s.slab(x, -128, x + 3, -126, G + 5, BRICK);
  }

  // Coaching quarter at the south gate, including two inns and stable yards.
  road(s, -86, -174, 102, -168);
  building(s, -72, -188, 22, 17, 3, 'north');
  building(s, 52, -188, 22, 17, 3, 'north');
  s.set(-65, G + 2, -180, WOOD);
  s.outline(-46, -190, -24, -174, G + 1, WOOD);
  s.outline(28, -190, 48, -174, G + 1, WOOD);
  lineHouses(s, -112, -153, 4, 13, 0, 'south', 2);
  lineHouses(s, 72, -153, 4, 13, 0, 'south', 2);

  // Dense western artisan ward; forge marker is deliberately exposed to its lane.
  road(s, -218, -74, -102, -68);
  road(s, -174, -86, -168, 72);
  for (let i = 0; i < 7; i++) {
    const z = -62 + i * 18;
    building(s, -190, z, 15, 12, 2 + (i % 2), 'east');
    building(s, -160, z, 15, 12, 3, 'west');
  }
  s.set(-165, G + 2, -60, FURNACE);
  s.set(-165, G + 3, -60, LANTERN);

  // Eastern merchants face a formal avenue; warehouses sit nearer the east gate.
  road(s, 118, -82, 124, 108);
  lineHouses(s, 138, -54, 7, 0, 19, 'west', 3);
  s.set(145, G + 2, -45, BOOKSHELF);
  for (let i = 0; i < 5; i++) {
    building(s, 174, 36 + i * 17, 22, 13, 2, 'west', STONE);
  }
  s.set(180, G + 2, 45, PLANKS);

  // Cathedral close, cloister garden, and scholarly houses in the northeast.
  square(s, 104, 112, 174, 168);
  building(s, 126, 118, 28, 42, 4, 'south', STONE);
  s.fill(132, G + 4, 126, 132, G + 14, 126, BRICK);
  s.set(132, G + 8, 126, GLASS);
  s.outline(158, 126, 174, 148, G + 1, STONE);
  for (let x = 161; x <= 171; x += 5) {
    for (let z = 129; z <= 145; z += 4) s.set(x, G + 1, z, LEAVES);
  }

  // Northern residential rows and neighborhood greens.
  road(s, -108, 170, 102, 176);
  lineHouses(s, -62, 181, 9, 14, 0, 'south', 3);
  lineHouses(s, -62, 202, 9, 14, 0, 'north', 2);
  s.set(-55, G + 2, 185, WOOD);
  s.outline(-102, 184, -72, 214, G + 1, STONE);
  for (let x = -98; x <= -76; x += 5) s.set(x, G + 1, 199, LEAVES);

  // Prosperous southwest villas inside garden walls.
  for (let i = 0; i < 4; i++) {
    const z = 92 + i * 30;
    s.outline(-208, z, -164, z + 24, G + 1, STONE);
    building(s, -190, z + 8, 20, 13, 3, 'east', BRICK);
    for (let gx = -203; gx <= -195; gx += 4) s.set(gx, G + 1, z + 7, LEAVES);
  }
  s.set(-185, G + 2, 105, BRICK);

  // Re-cut cardinal bridge/tower support corridors after all borough stamps.
  road(s, 4, -170, 12, -82);
  road(s, 4, 122, 12, 174);
  road(s, -232, 16, -126, 24);
  road(s, 142, 16, 248, 24);
}
