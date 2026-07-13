import {
  AIR,
  LIMESTONE,
  CARVED_LIMESTONE,
  SLATE,
  CYAN_GLASS,
  GOLD_TRIM,
  LANTERN,
  GLOWSTONE,
  PLANKS,
  BOOKSHELF,
  OAK_FENCE,
  DEEPSLATE,
} from '../blocks/blocks';
import { CitadelStamp } from './CitadelStamp';
import {
  KEEP,
  KCX,
  KCZ,
  FLOOR,
  PALACE_STACK,
  STAIR_X0,
  STAIR_X1,
  STAIR_Z0,
  STAIR_Z1,
  SPIRE,
  spireAccessibleY,
  CX,
  CZ,
  GP,
} from './cloudspireFrame';
import {
  switchbackStair,
  pointedWindow,
  hollowTower,
  steepRoof,
  balconyRing,
  skyBridge,
  pinnacle,
  spiralStair,
  buttress,
} from './cloudspirePrimitives';

/** Palace shell, floors, grand stair, and interiors. */
export function buildPalace(s: CitadelStamp): void {
  const { x0, x1, z0, z1, floor } = KEEP;

  // Plinth
  s.fill(x0 - 2, GP, z0 - 2, x1 + 2, floor - 1, z1 + 2, LIMESTONE);

  // Outer shell full height to roof
  s.walls(x0, floor, z0, x1, FLOOR.roof, z1, LIMESTONE);
  s.fill(x0 + 1, floor, z0 + 1, x1 - 1, FLOOR.roof - 1, z1 - 1, AIR);

  // Floors
  for (const fy of PALACE_STACK) {
    s.slab(x0 + 1, z0 + 1, x1 - 1, z1 - 1, fy, PLANKS);
  }

  // Grand switchback stair (east wing)
  switchbackStair(s, STAIR_X0, STAIR_X1, STAIR_Z0, STAIR_Z1, FLOOR.ground, FLOOR.roof, 5);
  // Open stair doors every floor
  for (const fy of PALACE_STACK) {
    s.fill(STAIR_X0, fy + 1, STAIR_Z0 + 2, STAIR_X0, fy + 4, STAIR_Z0 + 10, AIR);
  }

  // Secondary west spiral
  spiralStair(s, x0 + 5, z0 + 8, FLOOR.ground + 1, FLOOR.roof - 1, PLANKS, DEEPSLATE);
  for (const fy of PALACE_STACK) {
    s.fill(x0 + 3, fy + 1, z0 + 7, x0 + 3, fy + 3, z0 + 9, AIR);
  }

  // South ceremonial entrance from court
  s.fill(KCX - 4, floor, z0 - 3, KCX + 4, floor + 7, z0 + 2, AIR);
  s.fill(KCX - 5, floor, z0 - 1, KCX + 5, floor, z0 + 1, CARVED_LIMESTONE);

  // Great Hall (ground)
  buildGreatHall(s);
  buildThroneFloor(s);
  buildResidential(s);
  buildLibrary(s);
  buildHighFloor(s);

  // Windows rhythm on façades
  for (let y = floor + 3; y < FLOOR.roof - 4; y += 10) {
    for (let z = z0 + 6; z < z1 - 4; z += 6) {
      pointedWindow(s, x0, y, z, 6, 'x');
      pointedWindow(s, x1, y, z, 6, 'x');
    }
    for (let x = x0 + 6; x < x1 - 4; x += 6) {
      pointedWindow(s, x, y, z0, 6, 'z');
      pointedWindow(s, x, y, z1, 6, 'z');
    }
  }

  // Buttresses
  for (let z = z0 + 4; z < z1; z += 10) {
    buttress(s, x0 - 3, z, floor, FLOOR.roof - 10, 2, 0);
    buttress(s, x1 + 1, z, floor, FLOOR.roof - 10, 2, 0);
  }

  // Roof terrace
  s.slab(x0, z0, x1, z1, FLOOR.roof, LIMESTONE);
  s.outline(x0, z0, x1, z1, FLOOR.roof + 1, OAK_FENCE);
  // Roof access from stair
  s.fill(STAIR_X0 + 1, FLOOR.roof, STAIR_Z0 + 4, STAIR_X1 - 1, FLOOR.roof, STAIR_Z0 + 8, AIR);

  // Balconies mid-height
  for (const fy of [FLOOR.gallery, FLOOR.throne, FLOOR.residential, FLOOR.library]) {
    balconyRing(s, KCX, z0 - 2, 6, fy, LIMESTONE, OAK_FENCE);
    s.fill(KCX - 2, fy + 1, z0, KCX + 2, fy + 3, z0, AIR);
  }
}

function buildGreatHall(s: CitadelStamp): void {
  const y = FLOOR.hall;
  // High table north
  s.fill(KCX - 8, y + 1, KEEP.z1 - 12, KCX + 8, y + 1, KEEP.z1 - 8, CARVED_LIMESTONE);
  s.set(KCX, y + 2, KEEP.z1 - 10, GOLD_TRIM);
  // Feast tables
  for (let i = 0; i < 4; i++) {
    const z = KEEP.z0 + 12 + i * 8;
    s.fill(KCX - 10, y + 1, z, KCX - 4, y + 1, z + 1, PLANKS);
    s.fill(KCX + 4, y + 1, z, KCX + 10, y + 1, z + 1, PLANKS);
    s.set(KCX - 7, y + 2, z, LANTERN);
    s.set(KCX + 7, y + 2, z, LANTERN);
  }
  // Chandeliers
  for (const z of [KCZ - 10, KCZ, KCZ + 10]) {
    s.set(KCX, y + 8, z, GLOWSTONE);
    s.set(KCX, y + 7, z, LANTERN);
  }
  // Aisle clear
  s.fill(KCX - 3, y + 1, KEEP.z0 + 2, KCX + 3, y + 5, KEEP.z1 - 4, AIR);
}

function buildThroneFloor(s: CitadelStamp): void {
  const y = FLOOR.throne;
  s.fill(KCX - 4, y + 1, KEEP.z1 - 14, KCX + 4, y + 2, KEEP.z1 - 8, CARVED_LIMESTONE);
  s.set(KCX, y + 3, KEEP.z1 - 11, GOLD_TRIM);
  s.set(KCX, y + 4, KEEP.z1 - 11, GLOWSTONE);
  // Benches
  for (let z = KEEP.z0 + 10; z < KEEP.z1 - 16; z += 4) {
    s.fill(KCX - 12, y + 1, z, KCX - 8, y + 1, z, PLANKS);
    s.fill(KCX + 8, y + 1, z, KCX + 12, y + 1, z, PLANKS);
  }
  for (const x of [KCX - 14, KCX + 14]) {
    s.set(x, y + 1, KCZ, LANTERN);
  }
}

function buildResidential(s: CitadelStamp): void {
  const y = FLOOR.residential;
  // Partition rooms
  for (const x of [KCX - 15, KCX, KCX + 15]) {
    s.fill(x, y + 1, KEEP.z0 + 4, x, y + 4, KEEP.z1 - 4, LIMESTONE);
    s.fill(x, y + 1, KEEP.z0 + 10, x, y + 3, KEEP.z0 + 12, AIR); // doors
  }
  for (let i = 0; i < 6; i++) {
    const zx = KEEP.z0 + 8 + i * 7;
    const xx = KCX - 20 + (i % 3) * 14;
    s.fill(xx, y + 1, zx, xx + 3, y + 1, zx + 2, PLANKS); // beds
    s.set(xx + 4, y + 1, zx, LANTERN);
  }
}

function buildLibrary(s: CitadelStamp): void {
  const y = FLOOR.library;
  for (let z = KEEP.z0 + 6; z < KEEP.z1 - 4; z += 3) {
    for (const x of [KEEP.x0 + 4, KEEP.x1 - 4]) {
      s.fill(x, y + 1, z, x, y + 4, z + 1, BOOKSHELF);
    }
  }
  s.fill(KCX - 4, y + 1, KCZ - 4, KCX + 4, y + 1, KCZ + 4, PLANKS); // reading tables
  s.set(KCX, y + 2, KCZ, LANTERN);
  s.set(KCX, y + 8, KCZ, GLOWSTONE);
}

function buildHighFloor(s: CitadelStamp): void {
  const y = FLOOR.high;
  // Council chamber
  s.fill(KCX - 10, y + 1, KCZ - 8, KCX + 10, y + 1, KCZ + 8, CARVED_LIMESTONE);
  s.outline(KCX - 8, KCZ - 6, KCX + 8, KCZ + 6, y + 1, PLANKS);
  s.set(KCX, y + 2, KCZ, GOLD_TRIM);
  for (const [x, z] of [
    [KCX - 8, KCZ - 6],
    [KCX + 8, KCZ - 6],
    [KCX - 8, KCZ + 6],
    [KCX + 8, KCZ + 6],
  ] as const) {
    s.set(x, y + 1, z, LANTERN);
  }
}

/** Multi-stage central spire above palace roof. */
export function buildMainSpire(s: CitadelStamp): void {
  let y = SPIRE.baseY;
  let prevHalf = 24;
  for (let i = 0; i < SPIRE.stages.length; i++) {
    const st = SPIRE.stages[i];
    const y1 = y + st.height;
    hollowTower(s, KCX, KCZ, st.half, y, y1, LIMESTONE, true);
    // Floor decks
    s.slab(KCX - st.half + 1, KCZ - st.half + 1, KCX + st.half - 1, KCZ + st.half - 1, y, PLANKS);
    // Windows
    if (st.half >= 4) {
      for (let wy = y + 4; wy < y1 - 4; wy += 8) {
        pointedWindow(s, KCX - st.half, wy, KCZ, 5, 'x');
        pointedWindow(s, KCX + st.half, wy, KCZ, 5, 'x');
        pointedWindow(s, KCX, wy, KCZ - st.half, 5, 'z');
        pointedWindow(s, KCX, wy, KCZ + st.half, 5, 'z');
      }
    }
    // Spiral connecting stages (offset so not solid core block-in)
    if (i < 5) {
      const scx = KCX + Math.max(1, st.half - 3);
      const scz = KCZ;
      spiralStair(s, scx, scz, y + 1, y1, PLANKS, DEEPSLATE);
      // Door from interior to stair
      s.fill(KCX, y + 1, KCZ - 1, scx, y + 3, KCZ + 1, AIR);
    }
    // Balcony on stages 1, 3, 4
    if (i === 1 || i === 3 || i === 4) {
      balconyRing(s, KCX, KCZ, st.half, y1 - 2, LIMESTONE, OAK_FENCE);
      s.fill(KCX - 1, y1 - 1, KCZ - st.half, KCX + 1, y1 + 1, KCZ - st.half, AIR);
    }
    // Cyan glass accents
    if (st.half >= 6) {
      s.set(KCX, y + Math.floor(st.height / 2), KCZ - st.half, CYAN_GLASS);
      s.set(KCX, y + Math.floor(st.height / 2), KCZ + st.half, CYAN_GLASS);
    }
    prevHalf = st.half;
    y = y1;
  }
  // Peak
  steepRoof(s, KCX, KCZ, 3, y, SLATE);
  pinnacle(s, KCX, y + 4, KCZ, 12);
  s.set(KCX, spireAccessibleY() + 2, KCZ, GLOWSTONE);

  // Ensure crown balcony walkable air
  const crownY = spireAccessibleY();
  s.fill(KCX - 3, crownY + 1, KCZ - 3, KCX + 3, crownY + 4, KCZ + 3, AIR);

  void prevHalf;
  void CX;
  void CZ;
}

/** Sky bridge from palace high floor to observatory secondary tower. */
export function buildPalaceSkyBridge(s: CitadelStamp): void {
  const y = FLOOR.high + 2;
  const obsX = KEEP.x1 + 28;
  const obsZ = KCZ + 10;
  skyBridge(s, KEEP.x1, KCZ, obsX - 5, obsZ, y, 3);
  // Observatory tower (tier A light)
  hollowTower(s, obsX, obsZ, 6, FLOOR.ground, y + 40, LIMESTONE, true);
  spiralStair(s, obsX, obsZ, FLOOR.ground + 1, y + 38, PLANKS, DEEPSLATE);
  steepRoof(s, obsX, obsZ, 7, y + 41, SLATE);
  s.slab(obsX - 4, obsZ - 4, obsX + 4, obsZ + 4, y + 20, PLANKS);
  s.set(obsX, y + 22, obsZ, GLOWSTONE);
  s.set(obsX, y + 21, obsZ, GOLD_TRIM);
  // Door from bridge
  s.fill(obsX - 6, y + 1, obsZ - 1, obsX - 5, y + 3, obsZ + 1, AIR);
}

export function clearPalaceRoute(s: CitadelStamp): void {
  // Court → hall
  s.fill(KCX - 3, FLOOR.ground + 1, KEEP.z0 - 4, KCX + 3, FLOOR.ground + 5, KEEP.z0 + 4, AIR);
  // Hall → stair
  s.fill(KCX + 8, FLOOR.ground + 1, STAIR_Z0 + 4, STAIR_X0, FLOOR.ground + 4, STAIR_Z0 + 8, AIR);
  for (const fy of PALACE_STACK) {
    s.fill(STAIR_X0, fy + 1, STAIR_Z0 + 2, STAIR_X0, fy + 4, STAIR_Z0 + 10, AIR);
  }
}
