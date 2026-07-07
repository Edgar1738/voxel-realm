import {
  AIR,
  WATER,
  STONE,
  COBBLESTONE,
  BRICK,
  PLANKS,
  WOOD,
  GLASS,
  SAND,
  GRAVEL,
  DEEPSLATE,
  LANTERN,
  GLOWSTONE,
  OAK_FENCE,
  STONEBRICK_WALL,
  STAIRS_STONE,
  STAIRS_PLANK,
  STAIRS_COBBLE,
  STAIRS_BRICK,
  PLANK_SLAB,
} from '../blocks/blocks';
import { packState, FACING } from '../world/VoxelState';
import { CitadelStamp, hash2 } from './CitadelStamp';
import { HARBOR } from './HarborGenerator';
import { lighthouse, fishingHut, rowboat, buoy, shipwreck } from './coastalPrefabs';
import { well, marketStall, lampPost } from './prefabs';
import type { Overlay } from './Generator';
import type { Prefab } from '../core/Prefab';
import type { BlockId } from '../core/types';

// ── Site frame (all world coordinates, derived from the shared HARBOR terrain) ─────────────────
const QY = HARBOR.quayY; // 63 — the flat waterfront deck level (buildings stamp from QY+1 up)
const SEA = QY - 1; // 62 — water surface in the basin
const WALL_FLOOR = SEA - 12; // 50 — quay/wall foundations reach the basin floor everywhere
const BENCH_W = HARBOR.benchWestX; // -10 — the bench/hill boundary (stair paths start here)

// The walled harbor basin: a stone enclosure jutting east into the water, open at a ship mouth.
const BASIN_X_E = 32; // east wall, out in the water
const BASIN_Z_N = -16; // north return wall
const BASIN_Z_S = 16; // south return wall
const BASIN_X_W = 16; // where the return walls tie back into the bench

// The paved plaza on the bench, kept clear around the spawn column (8, _, 8).
const PLAZA_X_W = -8;
const PLAZA_X_E = 15;
const PLAZA_Z_N = -18;
const PLAZA_Z_S = 18;

// ── Prefab stamping (state-preserving, unlike the citadel's cube-only stamp) ───────────────────
/** Stamp a portable prefab (min-corner anchored) at a world origin, carrying orientation state. */
function stampPrefab(s: CitadelStamp, p: Prefab, ox: number, oy: number, oz: number): void {
  for (const b of p.blocks) {
    const id = b[3];
    if (id === AIR) continue;
    const state = b.length === 5 ? b[4] : 0;
    s.set(ox + b[0], oy + b[1], oz + b[2], id, state);
  }
}

// ── Roofs: a self-closing stepped hip roof built from oriented stairs ───────────────────────────
/**
 * A four-sided stepped hip roof over the rectangle [x0..x1] x [z0..z1], rising from `baseY`. Each
 * concentric ring is one course of stairs facing inward-and-up (so the open risers face outward),
 * with full cubes at the corners to close the mitre and a solid cap at the ridge/apex. Watertight
 * from above: every inner column is covered by the ring one step higher and inset by one.
 */
function hipRoof(
  s: CitadelStamp,
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  baseY: number,
  stair: BlockId,
  cube: BlockId,
): void {
  const ax = Math.min(x0, x1);
  const bx = Math.max(x0, x1);
  const az = Math.min(z0, z1);
  const bz = Math.max(z0, z1);
  for (let r = 0; ; r++) {
    const lx0 = ax + r;
    const lx1 = bx - r;
    const lz0 = az + r;
    const lz1 = bz - r;
    if (lx0 > lx1 || lz0 > lz1) break;
    const y = baseY + r;
    if (lx1 - lx0 <= 1 || lz1 - lz0 <= 1) {
      s.fill(lx0, y, lz0, lx1, y, lz1, cube); // ridge line / apex
      break;
    }
    for (let x = lx0 + 1; x <= lx1 - 1; x++) {
      s.set(x, y, lz0, stair, packState(FACING.N, 0)); // north eave rises toward +z (inward)
      s.set(x, y, lz1, stair, packState(FACING.S, 0)); // south eave rises toward -z (inward)
    }
    for (let z = lz0 + 1; z <= lz1 - 1; z++) {
      s.set(lx0, y, z, stair, packState(FACING.W, 0)); // west eave rises toward +x (inward)
      s.set(lx1, y, z, stair, packState(FACING.E, 0)); // east eave rises toward -x (inward)
    }
    s.set(lx0, y, lz0, cube);
    s.set(lx1, y, lz0, cube);
    s.set(lx0, y, lz1, cube);
    s.set(lx1, y, lz1, cube);
  }
}

// ── Houses ─────────────────────────────────────────────────────────────────────────────────────
type Facing4 = 'N' | 'E' | 'S' | 'W';

interface HouseOpts {
  wall: BlockId;
  roofStair: BlockId;
  roofCube: BlockId;
  /** Wall storey height (roof sits on top). */
  height: number;
  /** Which face carries the door. */
  door: Facing4;
}

/**
 * A small house on a stone plinth: cobble foundation carried down to the terrain, timber-framed
 * walls with glass windows and a door, an inside lantern, and an overhanging hip stair roof.
 */
function house(
  s: CitadelStamp,
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  floorY: number,
  opts: HouseOpts,
): void {
  const top = floorY + opts.height; // top wall course
  const roofPeak = top + Math.ceil((Math.max(x1 - x0, z1 - z0) + 3) / 2);

  // Clear the build envelope so a house cut into the hillside never has terrain (or a tree) poking
  // through its walls, floor, or roof space.
  s.fill(x0 - 1, floorY, z0 - 1, x1 + 1, roofPeak + 1, z1 + 1, AIR);

  // Foundation plinth: fill the footprint down so a house on a slope always meets solid ground.
  s.fill(x0, floorY - 1, z0, x1, floorY - 12, z1, COBBLESTONE);
  s.slab(x0, z0, x1, z1, floorY, PLANKS); // interior floor

  // Hollow walls + timber corner posts.
  s.walls(x0, floorY + 1, z0, x1, top, z1, opts.wall);
  for (const [px, pz] of [
    [x0, z0],
    [x1, z0],
    [x0, z1],
    [x1, z1],
  ] as const) {
    s.fill(px, floorY + 1, pz, px, top, pz, WOOD);
  }

  // Windows: a row at eye height on the two long faces.
  const wy = floorY + 2;
  for (let x = x0 + 2; x <= x1 - 2; x += 2) {
    s.set(x, wy, z0, GLASS);
    s.set(x, wy, z1, GLASS);
  }
  for (let z = z0 + 2; z <= z1 - 2; z += 2) {
    s.set(x0, wy, z, GLASS);
    s.set(x1, wy, z, GLASS);
  }

  // Door: a 1-wide, 2-tall opening centred on the chosen face.
  const mx = (x0 + x1) >> 1;
  const mz = (z0 + z1) >> 1;
  if (opts.door === 'N') s.fill(mx, floorY + 1, z0, mx, floorY + 2, z0, AIR);
  else if (opts.door === 'S') s.fill(mx, floorY + 1, z1, mx, floorY + 2, z1, AIR);
  else if (opts.door === 'W') s.fill(x0, floorY + 1, mz, x0, floorY + 2, mz, AIR);
  else s.fill(x1, floorY + 1, mz, x1, floorY + 2, mz, AIR);

  s.set(x1 - 1, top - 1, z1 - 1, LANTERN); // a lantern under the eaves inside

  // Overhanging hip roof, one block proud of the walls on every side.
  hipRoof(s, x0 - 1, z0 - 1, x1 + 1, z1 + 1, top, opts.roofStair, opts.roofCube);
}

// ── Quay: the walled harbor basin, its parapet, and lantern posts ──────────────────────────────
function buildQuayWall(s: CitadelStamp): void {
  // Three solid stone walls (east + two returns) rising from the basin floor to the deck.
  s.fill(BASIN_X_E - 1, WALL_FLOOR, BASIN_Z_N, BASIN_X_E, QY, BASIN_Z_S, STONE); // east
  s.fill(BASIN_X_W, WALL_FLOOR, BASIN_Z_N, BASIN_X_E, QY, BASIN_Z_N + 1, STONE); // north return
  s.fill(BASIN_X_W, WALL_FLOOR, BASIN_Z_S - 1, BASIN_X_E, QY, BASIN_Z_S, STONE); // south return

  // Ship mouth: a 5-wide open channel through the east wall, flanked by lit posts.
  s.fill(BASIN_X_E - 1, WALL_FLOOR + 4, -2, BASIN_X_E, QY, 2, WATER);
  for (const z of [-3, 3]) {
    s.fill(BASIN_X_E, QY + 1, z, BASIN_X_E, QY + 2, z, WOOD);
    s.set(BASIN_X_E, QY + 3, z, LANTERN);
  }

  // Parapet along the outer wall crown, with lanterns spaced along the walk.
  for (let z = BASIN_Z_N; z <= BASIN_Z_S; z++) {
    s.set(BASIN_X_E, QY + 1, z, STONEBRICK_WALL);
    if (z % 6 === 0) s.set(BASIN_X_E - 1, QY + 1, z, LANTERN);
  }
  for (let x = BASIN_X_W; x <= BASIN_X_E; x++) {
    s.set(x, QY + 1, BASIN_Z_N, STONEBRICK_WALL);
    s.set(x, QY + 1, BASIN_Z_S, STONEBRICK_WALL);
    if (x % 6 === 0) {
      s.set(x, QY + 1, BASIN_Z_N + 1, LANTERN);
      s.set(x, QY + 1, BASIN_Z_S - 1, LANTERN);
    }
  }
}

// ── Piers: plank jetties on stilts reaching into the basin ─────────────────────────────────────
/** A 3-wide plank jetty at deck level from (xStart) to (xEnd) along z=zc, on stilts with rails. */
function pier(s: CitadelStamp, zc: number, xStart: number, xEnd: number): void {
  for (let x = xStart; x <= xEnd; x++) {
    s.slab(x, zc - 1, x, zc + 1, QY, PLANKS); // deck
    if ((x - xStart) % 4 === 0) {
      // stilt pairs down to the basin floor
      s.fill(x, QY - 1, zc - 1, x, WALL_FLOOR, zc - 1, WOOD);
      s.fill(x, QY - 1, zc + 1, x, WALL_FLOOR, zc + 1, WOOD);
    }
    if ((x - xStart) % 5 === 0) {
      s.set(x, QY + 1, zc - 1, LANTERN); // lantern posts along the rail line
      s.set(x, QY + 1, zc + 1, LANTERN);
    } else {
      s.set(x, QY + 1, zc - 1, OAK_FENCE); // rails
      s.set(x, QY + 1, zc + 1, OAK_FENCE);
    }
  }
}

// ── The tiered "pagoda" landmark: stacked shrinking storeys with slate hip roofs ───────────────
function buildTieredTower(s: CitadelStamp, cx: number, cz: number): void {
  const baseY = QY + 3; // raised on a short stone terrace
  s.fill(cx - 6, QY - 4, cz - 6, cx + 6, baseY, cz + 6, STONE); // terrace pad (seated into the bench)
  const tiers = [
    { half: 5, h: 5 },
    { half: 4, h: 4 },
    { half: 3, h: 4 },
  ];
  let y = baseY + 1;
  for (let i = 0; i < tiers.length; i++) {
    const { half, h } = tiers[i];
    const x0 = cx - half;
    const x1 = cx + half;
    const z0 = cz - half;
    const z1 = cz + half;
    const top = y + h;
    s.fill(x0, y, z0, x1, y, z1, PLANKS); // storey floor
    s.walls(x0, y, z0, x1, top, z1, i === 0 ? STONE : PLANKS);
    for (let x = x0 + 2; x <= x1 - 2; x += 2) {
      s.set(x, y + 2, z0, GLASS);
      s.set(x, y + 2, z1, GLASS);
    }
    s.set(cx, y + 1, cz, LANTERN);
    // Overhanging blue-grey slate roof for this tier.
    hipRoof(s, x0 - 1, z0 - 1, x1 + 1, z1 + 1, top, STAIRS_STONE, DEEPSLATE);
    y = top + 1; // next tier sits above the roof cap
  }
  s.fill(cx, y, cz, cx, y + 2, cz, WOOD); // finial mast
  s.set(cx, y + 3, cz, GLOWSTONE); // beacon
}

// ── Bench paving + market dressing ─────────────────────────────────────────────────────────────
function pavePlaza(s: CitadelStamp): void {
  s.fill(PLAZA_X_W, QY - 1, PLAZA_Z_N, PLAZA_X_E, QY - 1, PLAZA_Z_S, COBBLESTONE); // sealed sub-floor
  const ax = Math.max(PLAZA_X_W, s.wx0);
  const bx = Math.min(PLAZA_X_E, s.wx1);
  const az = Math.max(PLAZA_Z_N, s.wz0);
  const bz = Math.min(PLAZA_Z_S, s.wz1);
  for (let wz = az; wz <= bz; wz++) {
    for (let wx = ax; wx <= bx; wx++) {
      const r = hash2(wx, wz, 0x40b1);
      s.set(wx, QY, wz, r < 0.14 ? STONE : r < 0.2 ? GRAVEL : COBBLESTONE);
    }
  }
}

function buildMarket(s: CitadelStamp): void {
  stampPrefab(s, well(), -4, QY + 1, -3);
  stampPrefab(s, marketStall(), 10, QY + 1, -6);
  stampPrefab(s, marketStall(), -2, QY + 1, 8);
  for (const [lx, lz] of [
    [PLAZA_X_W + 2, PLAZA_Z_N + 2],
    [PLAZA_X_E - 2, PLAZA_Z_N + 2],
    [PLAZA_X_W + 2, PLAZA_Z_S - 2],
    [PLAZA_X_E - 2, PLAZA_Z_S - 2],
  ] as const) {
    stampPrefab(s, lampPost(), lx, QY + 1, lz);
  }
}

// A colonnade: a covered stone walk of pillars + lintel + slab roof along the north plaza edge.
function buildColonnade(s: CitadelStamp): void {
  const z = PLAZA_Z_N + 3;
  const y0 = QY + 1;
  const roofY = QY + 5;
  for (let x = -6; x <= 12; x++) {
    if ((x + 6) % 3 === 0) s.fill(x, y0, z, x, roofY - 1, z, STONE); // pillars every 3
  }
  s.fill(-6, roofY - 1, z, 12, roofY - 1, z, STONE); // lintel
  s.slab(-6, z - 1, 12, z + 1, roofY, PLANK_SLAB); // slab roof over the walk
}

// ── Waterfront + hillside neighbourhoods ───────────────────────────────────────────────────────
function buildWaterfrontRow(s: CitadelStamp): void {
  // Houses on the bench facing the water (door east): orange-tiled planks and a wood-roofed cottage.
  house(s, 4, -26, 12, -20, QY, {
    wall: PLANKS,
    roofStair: STAIRS_BRICK,
    roofCube: BRICK,
    height: 4,
    door: 'E',
  });
  house(s, 4, 20, 12, 26, QY, {
    wall: COBBLESTONE,
    roofStair: STAIRS_PLANK,
    roofCube: PLANKS,
    height: 5,
    door: 'E',
  });
}

/** A climbable cobblestone stair path along z=`lane`, rising westward from the bench up the hill. */
function hillStairPath(s: CitadelStamp, lane: number): void {
  for (let i = 0; i <= 42; i++) {
    const x = BENCH_W - i;
    const y = QY + Math.floor(i / 2);
    s.fill(x, y + 1, lane - 1, x, y + 7, lane + 1, AIR); // cut a walkable trench through the hill
    if (i % 2 === 0)
      s.set(x, y, lane, STAIRS_COBBLE, packState(FACING.E, 0)); // rising step (toward -x)
    else s.set(x, y, lane, COBBLESTONE);
    s.fill(x, y - 1, lane, x, y - 8, lane, COBBLESTONE); // carry the tread down to the slope
  }
}

function buildHillside(s: CitadelStamp): void {
  // Terraced rows climbing inland (west); each floorY matches the hill terrain at that x so houses
  // sit on the slope, not on stilts. Rows are linked by a stepped stair path.
  const rows = [
    { xCenter: -22, floorY: QY + 3 },
    { xCenter: -34, floorY: QY + 12 },
    { xCenter: -46, floorY: QY + 21 },
  ];
  const palettes: HouseOpts[] = [
    { wall: PLANKS, roofStair: STAIRS_BRICK, roofCube: BRICK, height: 4, door: 'E' },
    { wall: COBBLESTONE, roofStair: STAIRS_PLANK, roofCube: PLANKS, height: 4, door: 'E' },
    { wall: BRICK, roofStair: STAIRS_STONE, roofCube: DEEPSLATE, height: 5, door: 'E' },
  ];
  for (let ri = 0; ri < rows.length; ri++) {
    const { xCenter, floorY } = rows[ri];
    let pi = ri;
    for (const zc of [-18, -4, 10, 22]) {
      house(s, xCenter - 3, zc - 3, xCenter + 3, zc + 3, floorY, palettes[pi % palettes.length]);
      pi++;
    }
  }
  hillStairPath(s, 4);
}

// ── Water dressing: lighthouse, fishing huts on stilts, boats, a wreck ─────────────────────────
function buildWaterDressing(s: CitadelStamp): void {
  // Lighthouse on a small stone mole just north of the harbor mouth, out in the open water.
  s.fill(BASIN_X_E + 2, WALL_FLOOR, -9, BASIN_X_E + 6, QY, -5, STONE);
  stampPrefab(s, lighthouse(), BASIN_X_E + 2, QY + 1, -9);

  // Two fishing huts on stilts inside the basin (clear of the walls and piers); extend the posts
  // down to the floor so nothing floats.
  for (const [hx, hz] of [
    [23, -14],
    [23, 7],
  ] as const) {
    stampPrefab(s, fishingHut(), hx, QY - 3, hz);
    for (const [dx, dz] of [
      [1, 1],
      [5, 1],
      [1, 3],
      [5, 3],
    ] as const) {
      s.fill(hx + dx, QY - 3, hz + dz, hx + dx, WALL_FLOOR, hz + dz, WOOD);
    }
  }

  stampPrefab(s, rowboat(), 26, SEA, 0); // a dinghy drifting in the basin
  stampPrefab(s, buoy(), 40, SEA, -6); // marker buoys out in the open sea
  stampPrefab(s, buoy(), 44, SEA, 14);
  stampPrefab(s, shipwreck(), 40, WALL_FLOOR - 1, 22); // a half-sunk hull silting on the open seabed

  // A little sandbar breaking the surface out past the wall for beach character.
  for (let x = 34; x <= 38; x++) {
    for (let z = 6; z <= 10; z++) {
      if (hash2(x, z, 0x51a) < 0.6) s.set(x, SEA, z, SAND);
    }
  }
}

/**
 * The harbor site overlay: a walled stone harbor basin with a lighthoused ship mouth, plank piers
 * on stilts, a paved market plaza (well, stalls, lamp posts, a colonnade), a tiered slate-roofed
 * landmark, and waterfront + terraced-hillside houses with overhanging stair roofs — plus boats,
 * fishing huts, and a wreck dressing the water. Every primitive is clipped to the chunk being
 * generated, so the town streams in seamlessly.
 */
export function harborSite(): Overlay {
  return (chunk, cx, cz) => {
    const s = new CitadelStamp(chunk, cx, cz);
    pavePlaza(s);
    buildQuayWall(s);
    pier(s, 4, 8, 28);
    pier(s, -8, 8, 28);
    buildColonnade(s);
    buildMarket(s);
    buildTieredTower(s, 8, 34);
    buildWaterfrontRow(s);
    buildHillside(s);
    buildWaterDressing(s);
  };
}
