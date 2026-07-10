/**
 * Village districts surrounding The Grand Keep — streets, houses, market, and plazas
 * inside the expanded outer bailey and just outside the city walls.
 */
import {
  AIR,
  COBBLESTONE,
  STONE,
  BRICK,
  PLANKS,
  WOOD,
  GLASS,
  GRAVEL,
  LANTERN,
  GLOWSTONE,
  OAK_FENCE,
  COBBLE_WALL,
  FURNACE,
  BOOKSHELF,
  TERRACOTTA,
  DEEPSLATE,
} from '../blocks/blocks';
import { CitadelStamp, hash2 } from './CitadelStamp';
import {
  G,
  CX,
  CZ,
  X0,
  X1,
  Z0,
  Z1,
  IN_X0,
  IN_X1,
  IN_Z0,
  IN_Z1,
  KX0,
  KX1,
  KZ0,
  KZ1,
  WT,
} from './grandKeepFrame';

/** Simple multi-story house (hollow) with door facing `door` and roof parapet. */
function house(
  s: CitadelStamp,
  x0: number,
  z0: number,
  w: number,
  d: number,
  stories: number,
  door: 'n' | 's' | 'e' | 'w',
): void {
  const x1 = x0 + w - 1;
  const z1 = z0 + d - 1;
  const top = G + stories * 4 + 1;
  s.fill(x0, G, z0, x1, G, z1, COBBLESTONE);
  s.walls(x0, G + 1, z0, x1, top, z1, stories >= 3 ? BRICK : PLANKS);
  s.fill(x0 + 1, G + 1, z0 + 1, x1 - 1, top - 1, z1 - 1, AIR);
  // Floors
  for (let st = 1; st < stories; st++) {
    const fy = G + st * 4;
    s.slab(x0 + 1, z0 + 1, x1 - 1, z1 - 1, fy, PLANKS);
    s.set(x0 + 1, fy + 1, z0 + 1, LANTERN);
  }
  // Door
  const mx = (x0 + x1) >> 1;
  const mz = (z0 + z1) >> 1;
  if (door === 's') s.fill(mx - 1, G + 1, z0, mx + 1, G + 3, z0, AIR);
  else if (door === 'n') s.fill(mx - 1, G + 1, z1, mx + 1, G + 3, z1, AIR);
  else if (door === 'e') s.fill(x1, G + 1, mz - 1, x1, G + 3, mz + 1, AIR);
  else s.fill(x0, G + 1, mz - 1, x0, G + 3, mz + 1, AIR);
  // Windows
  for (let st = 0; st < stories; st++) {
    const wy = G + 2 + st * 4;
    s.set(mx, wy, z0, GLASS);
    s.set(mx, wy, z1, GLASS);
    s.set(x0, wy, mz, GLASS);
    s.set(x1, wy, mz, GLASS);
  }
  // Roof
  s.slab(x0, z0, x1, z1, top, WOOD);
  s.set(mx, top + 1, mz, LANTERN);
}

function streetEW(s: CitadelStamp, x0: number, x1: number, z: number, halfW = 1): void {
  for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) {
    for (let dz = -halfW; dz <= halfW; dz++) {
      const r = hash2(x, z + dz, 0x51ee);
      s.set(x, G, z + dz, r < 0.55 ? COBBLESTONE : r < 0.8 ? STONE : GRAVEL);
      s.fill(x, G + 1, z + dz, x, G + 3, z + dz, AIR);
    }
    if ((x & 7) === 0) {
      s.set(x, G + 1, z - halfW - 1, COBBLE_WALL);
      s.set(x, G + 2, z - halfW - 1, LANTERN);
    }
  }
}

function streetNS(s: CitadelStamp, z0: number, z1: number, x: number, halfW = 1): void {
  for (let z = Math.min(z0, z1); z <= Math.max(z0, z1); z++) {
    for (let dx = -halfW; dx <= halfW; dx++) {
      const r = hash2(x + dx, z, 0x51ee);
      s.set(x + dx, G, z, r < 0.55 ? COBBLESTONE : r < 0.8 ? STONE : GRAVEL);
      s.fill(x + dx, G + 1, z, x + dx, G + 3, z, AIR);
    }
    if ((z & 7) === 0) {
      s.set(x - halfW - 1, G + 1, z, COBBLE_WALL);
      s.set(x - halfW - 1, G + 2, z, LANTERN);
    }
  }
}

/** Market stalls — simple open frames. */
function stall(s: CitadelStamp, x: number, z: number): void {
  s.fill(x, G + 1, z, x + 2, G + 1, z + 1, PLANKS);
  s.set(x, G + 2, z, OAK_FENCE);
  s.set(x + 2, G + 2, z, OAK_FENCE);
  s.set(x, G + 3, z, PLANKS);
  s.set(x + 1, G + 3, z, PLANKS);
  s.set(x + 2, G + 3, z, PLANKS);
  s.set(x + 1, G + 2, z, LANTERN);
}

/**
 * Inner bailey village — between the keep mass and the outer curtain.
 * Fills the large open yards east, west, and north of the keep.
 */
export function buildInnerBaileyVillage(s: CitadelStamp): void {
  // Ring streets around the keep
  streetEW(s, IN_X0 + 4, IN_X1 - 4, KZ0 - 6, 2); // south of keep, north of gate plaza
  streetEW(s, IN_X0 + 4, IN_X1 - 4, KZ1 + 6, 2); // north of keep
  streetNS(s, IN_Z0 + 8, IN_Z1 - 8, KX0 - 8, 2); // west of keep
  streetNS(s, IN_Z0 + 8, IN_Z1 - 8, KX1 + 8, 2); // east of keep

  // Cross streets
  streetEW(s, IN_X0 + 4, IN_X1 - 4, (IN_Z0 + KZ0) >> 1, 1);
  streetNS(s, IN_Z0 + 8, KZ0 - 4, CX - 30, 1);
  streetNS(s, IN_Z0 + 8, KZ0 - 4, CX + 30, 1);

  // West bailey houses
  for (let i = 0; i < 5; i++) {
    const z = KZ0 + 4 + i * 14;
    if (z + 8 >= KZ1 - 4) break;
    house(s, KX0 - 22, z, 8, 8, 2 + (i % 2), 'e');
    house(s, KX0 - 36, z + 2, 7, 7, 2, 'e');
  }
  // East bailey houses
  for (let i = 0; i < 5; i++) {
    const z = KZ0 + 4 + i * 14;
    if (z + 8 >= KZ1 - 4) break;
    house(s, KX1 + 8, z, 8, 8, 2 + (i % 3 === 0 ? 1 : 0), 'w');
    house(s, KX1 + 22, z + 2, 7, 7, 2, 'w');
  }
  // North bailey row
  for (let i = 0; i < 6; i++) {
    const x = KX0 + 4 + i * 16;
    if (x + 8 >= KX1 - 4) break;
    house(s, x, KZ1 + 10, 8, 8, 2 + (i % 2), 's');
  }
  // South-east / south-west courtyard housing (off processional)
  for (let i = 0; i < 3; i++) {
    house(s, CX - 50 + i * 12, IN_Z0 + 12, 7, 7, 2, 'n');
    house(s, CX + 20 + i * 12, IN_Z0 + 12, 7, 7, 2, 'n');
  }

  // Market plaza east of processional, south of keep
  const mx0 = CX + 18;
  const mz0 = KZ0 - 30;
  for (let z = mz0; z <= mz0 + 16; z++) {
    for (let x = mx0; x <= mx0 + 20; x++) {
      s.set(x, G, z, STONE);
    }
  }
  for (let i = 0; i < 4; i++) {
    stall(s, mx0 + 2 + i * 5, mz0 + 3);
    stall(s, mx0 + 2 + i * 5, mz0 + 10);
  }
  s.fill(mx0 + 8, G + 1, mz0 + 7, mx0 + 10, G + 1, mz0 + 9, COBBLESTONE); // fountain base
  s.set(mx0 + 9, G + 2, mz0 + 8, GLOWSTONE);

  // Western square with well-like marker
  for (let z = KZ0 + 20; z <= KZ0 + 32; z++) {
    for (let x = KX0 - 48; x <= KX0 - 28; x++) s.set(x, G, z, COBBLESTONE);
  }
  s.set(KX0 - 38, G + 1, KZ0 + 26, COBBLE_WALL);
  s.set(KX0 - 38, G + 2, KZ0 + 26, LANTERN);

  // Workshop row (furnaces)
  for (let i = 0; i < 4; i++) {
    const x = KX1 + 10 + i * 10;
    house(s, x, KZ0 - 28, 6, 6, 1, 's');
    s.set(x + 2, G + 1, KZ0 - 26, FURNACE);
  }
}

/**
 * Outer town ring — just outside the city walls (beyond the moat), on the plateau.
 */
export function buildOuterTown(s: CitadelStamp): void {
  const ringIn = Math.abs(X0) + 14; // outside moat
  // Approximate outer ring band using wall coords
  const ox0 = X0 - 28;
  const ox1 = X1 + 28;
  const oz0 = Z0 - 28;
  const oz1 = Z1 + 28;

  // Perimeter road just outside moat
  streetEW(s, ox0, ox1, Z0 - 18, 2);
  streetEW(s, ox0, ox1, Z1 + 18, 2);
  streetNS(s, oz0, oz1, X0 - 18, 2);
  streetNS(s, oz0, oz1, X1 + 18, 2);

  // South approach town (flanking the road)
  for (let i = 0; i < 6; i++) {
    const z = Z0 - 50 + i * 8;
    house(s, CX - 22, z, 6, 6, 2, 'e');
    house(s, CX + 16, z, 6, 6, 2, 'w');
  }
  // South market strip
  for (let i = 0; i < 5; i++) {
    stall(s, CX - 12 + i * 5, Z0 - 35);
  }

  // East outer village
  for (let i = 0; i < 5; i++) {
    house(s, X1 + 16, CZ - 40 + i * 16, 8, 8, 2 + (i % 2), 'w');
    house(s, X1 + 30, CZ - 36 + i * 16, 7, 7, 2, 'w');
  }
  // West outer village
  for (let i = 0; i < 5; i++) {
    house(s, X0 - 24, CZ - 40 + i * 16, 8, 8, 2 + (i % 2), 'e');
    house(s, X0 - 38, CZ - 36 + i * 16, 7, 7, 2, 'e');
  }
  // North outer village
  for (let i = 0; i < 6; i++) {
    house(s, CX - 50 + i * 18, Z1 + 16, 8, 8, 2, 's');
  }

  // Road connections from outer ring gates (E/W/N) into walls via simple paved spurs
  streetEW(s, X1, X1 + 20, CZ, 2);
  streetEW(s, X0 - 20, X0, CZ, 2);
  streetNS(s, Z1, Z1 + 20, CX, 2);

  // Outer tavern / large inn SE
  house(s, X1 + 20, Z0 - 40, 12, 10, 3, 'w');
  s.fill(X1 + 22, G + 1, Z0 - 36, X1 + 28, G + 1, Z0 - 36, PLANKS);
  s.set(X1 + 24, G + 2, Z0 - 36, LANTERN);

  // Chapel outside NE
  house(s, X1 + 18, Z1 + 20, 10, 10, 2, 's');
  s.set(X1 + 23, G + 1, Z1 + 24, GLOWSTONE);
  s.fill(X1 + 20, G + 1, Z1 + 22, X1 + 20, G + 3, Z1 + 26, BOOKSHELF);

  void ringIn;
  void TERRACOTTA;
  void DEEPSLATE;
}

/** Cut extra gates in the outer wall for village access (E/W/N) and dock bridges later. */
export function cutVillageGates(s: CitadelStamp): void {
  const half = 3;
  // East gate
  s.fill(X1 - WT + 1, G + 1, CZ - half, X1, G + 6, CZ + half, AIR);
  s.fill(X1 - WT + 1, G, CZ - half, X1, G, CZ + half, STONE);
  // West gate
  s.fill(X0, G + 1, CZ - half, X0 + WT - 1, G + 6, CZ + half, AIR);
  s.fill(X0, G, CZ - half, X0 + WT - 1, G, CZ + half, STONE);
  // North gate
  s.fill(CX - half, G + 1, Z1 - WT + 1, CX + half, G + 6, Z1, AIR);
  s.fill(CX - half, G, Z1 - WT + 1, CX + half, G, Z1, STONE);

  // Wall-walk doors above those gates remain continuous (lintel)
}

export function buildVillage(s: CitadelStamp): void {
  cutVillageGates(s);
  buildInnerBaileyVillage(s);
  buildOuterTown(s);
}
