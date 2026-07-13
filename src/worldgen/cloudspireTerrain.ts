import {
  AIR,
  LIMESTONE,
  CARVED_LIMESTONE,
  SLATE,
  LANTERN,
  COBBLESTONE,
  STONE,
  GRAVEL,
  PLANKS,
  GRASS,
  OAK_FENCE,
  DEEPSLATE,
} from '../blocks/blocks';
import { CitadelStamp, hash2 } from './CitadelStamp';
import {
  G,
  CX,
  X0,
  X1,
  Z0,
  Z1,
  WT,
  WALL_Y0,
  WALK_Y,
  MERLON_Y,
  GATE_HALF,
  GATE_TOP,
  GATEHOUSE_DEPTH,
  SPAWN,
} from './cloudspireFrame';
import {
  battlements,
  hollowTower,
  steepRoof,
  archedGate,
  stairFlightZ,
  pinnacle,
} from './cloudspirePrimitives';

/** Arrival overlook platform + processional road north into the gate. */
export function buildArrivalAndApproach(s: CitadelStamp): void {
  // Overlook deck
  const ox = SPAWN.x;
  const oz = Math.floor(SPAWN.z);
  const oy = G + 20;
  s.fill(ox - 8, oy - 2, oz - 6, ox + 8, oy, oz + 4, LIMESTONE);
  s.fill(ox - 7, oy + 1, oz - 5, ox + 7, oy + 4, oz + 3, AIR);
  s.outline(ox - 8, oz - 6, ox + 8, oz + 4, oy + 1, OAK_FENCE);
  // Opening toward city (north)
  s.fill(ox - 3, oy + 1, oz + 4, ox + 3, oy + 3, oz + 4, AIR);
  for (const lx of [ox - 6, ox + 6]) {
    s.set(lx, oy + 1, oz, CARVED_LIMESTONE);
    s.set(lx, oy + 2, oz, LANTERN);
  }

  // Switchback path down from overlook to outer terrace
  let y = oy;
  let z = oz + 5;
  for (let flight = 0; flight < 8 && y > G; flight++) {
    const steps = Math.min(6, y - G);
    stairFlightZ(s, ox - 2, ox + 2, z, y - steps + 1, steps, 1);
    y -= steps;
    z += steps + 2;
    s.fill(ox - 3, y, z - 1, ox + 3, y, z + 2, LIMESTONE);
    s.fill(ox - 2, y + 1, z - 1, ox + 2, y + 3, z + 2, AIR);
  }

  // Processional road on outer terrace to gate
  const roadZ0 = Math.min(z + 2, Z0 - 2);
  for (let wz = Math.max(roadZ0, s.wz0); wz <= Math.min(Z0 - 1, s.wz1); wz++) {
    for (let wx = Math.max(CX - 4, s.wx0); wx <= Math.min(CX + 4, s.wx1); wx++) {
      const r = hash2(wx, wz, 0xc5a1);
      s.set(wx, G, wz, r < 0.5 ? COBBLESTONE : r < 0.8 ? STONE : GRAVEL);
      s.fill(wx, G + 1, wz, wx, G + 4, wz, AIR);
    }
    if ((wz & 7) === 0) {
      for (const side of [CX - 5, CX + 5]) {
        s.set(side, G + 1, wz, CARVED_LIMESTONE);
        s.set(side, G + 2, wz, LANTERN);
      }
    }
  }
}

/** Outer curtain walls + walk + merlons. */
export function buildOuterWalls(s: CitadelStamp): void {
  // South wall
  s.fill(X0, WALL_Y0, Z0, X1, WALK_Y, Z0 + WT - 1, LIMESTONE);
  // North wall
  s.fill(X0, WALL_Y0, Z1 - WT + 1, X1, WALK_Y, Z1, LIMESTONE);
  // West wall
  s.fill(X0, WALL_Y0, Z0, X0 + WT - 1, WALK_Y, Z1, LIMESTONE);
  // East wall
  s.fill(X1 - WT + 1, WALL_Y0, Z0, X1, WALK_Y, Z1, LIMESTONE);

  // Walk slabs + battlements
  s.fill(X0, WALK_Y, Z0, X1, WALK_Y, Z0 + WT - 1, CARVED_LIMESTONE);
  s.fill(X0, WALK_Y, Z1 - WT + 1, X1, WALK_Y, Z1, CARVED_LIMESTONE);
  s.fill(X0, WALK_Y, Z0, X0 + WT - 1, WALK_Y, Z1, CARVED_LIMESTONE);
  s.fill(X1 - WT + 1, WALK_Y, Z0, X1, WALK_Y, Z1, CARVED_LIMESTONE);
  battlements(s, X0, Z0, X1, Z1, MERLON_Y, LIMESTONE);

  // Corner towers
  for (const [tx, tz] of [
    [X0 + 6, Z0 + 6],
    [X1 - 6, Z0 + 6],
    [X0 + 6, Z1 - 6],
    [X1 - 6, Z1 - 6],
  ] as const) {
    hollowTower(s, tx, tz, 6, G + 1, WALK_Y + 28, LIMESTONE, true);
    steepRoof(s, tx, tz, 7, WALK_Y + 29, SLATE);
    pinnacle(s, tx, WALK_Y + 36, tz, 8);
    // Door onto wall walk
    s.fill(tx - 1, WALK_Y + 1, tz - 6, tx + 1, WALK_Y + 3, tz - 6, AIR);
  }

  // Mid-wall towers (skyline density)
  for (const [tx, tz] of [
    [CX, Z0 + 6],
    [CX, Z1 - 6],
    [X0 + 6, CZ_MID()],
    [X1 - 6, CZ_MID()],
  ] as const) {
    hollowTower(s, tx, tz, 5, G + 1, WALK_Y + 22, LIMESTONE, true);
    steepRoof(s, tx, tz, 6, WALK_Y + 23, SLATE);
  }
}

function CZ_MID(): number {
  return Math.floor((Z0 + Z1) / 2);
}

/** Monumental south gatehouse on the processional axis. */
export function buildGatehouse(s: CitadelStamp): void {
  const gz0 = Z0 - 2;
  const gz1 = Z0 + GATEHOUSE_DEPTH;
  const gx0 = CX - GATE_HALF - 8;
  const gx1 = CX + GATE_HALF + 8;

  s.fill(gx0, G + 1, gz0, gx1, GATE_TOP + 12, gz1, LIMESTONE);
  // Hollow rooms
  s.fill(gx0 + 2, G + 1, gz0 + 2, gx1 - 2, GATE_TOP + 10, gz1 - 2, AIR);
  // Floors
  s.slab(gx0 + 2, gz0 + 2, gx1 - 2, gz1 - 2, G + 1, PLANKS);
  s.slab(gx0 + 2, gz0 + 2, gx1 - 2, gz1 - 2, G + 8, PLANKS);
  s.slab(gx0 + 2, gz0 + 2, gx1 - 2, gz1 - 2, GATE_TOP + 4, PLANKS);

  // Passage
  archedGate(s, CX - GATE_HALF, CX + GATE_HALF, gz0, G + 1, GATE_TOP - G, gz1 - gz0 + 1);
  s.fill(CX - GATE_HALF, G + 1, Z0 - 1, CX + GATE_HALF, GATE_TOP, Z0 + WT + 2, AIR);

  // Twin gate towers
  for (const tx of [CX - GATE_HALF - 5, CX + GATE_HALF + 5]) {
    hollowTower(s, tx, Z0 + 8, 5, G + 1, WALK_Y + 34, LIMESTONE, true);
    steepRoof(s, tx, Z0 + 8, 6, WALK_Y + 35, SLATE);
    pinnacle(s, tx, WALK_Y + 42, Z0 + 8, 10);
  }
  // Stairs in west gate tower
  spiralStairLocal(s, CX - GATE_HALF - 5, Z0 + 8, G + 2, WALK_Y + 2);

  // Banner poles
  for (const bx of [CX - 10, CX + 10]) {
    s.fill(bx, G + 1, Z0 - 4, bx, G + 10, Z0 - 4, CARVED_LIMESTONE);
    s.set(bx, G + 11, Z0 - 4, LANTERN);
  }
}

function spiralStairLocal(s: CitadelStamp, cx: number, cz: number, y0: number, y1: number): void {
  const ring: Array<[number, number]> = [
    [-1, -1],
    [0, -1],
    [1, -1],
    [1, 0],
    [1, 1],
    [0, 1],
    [-1, 1],
    [-1, 0],
  ];
  s.fill(cx, y0, cz, cx, y1, cz, DEEPSLATE);
  for (let y = y0; y <= y1; y++) {
    const [dx, dz] = ring[(y - y0) % 8];
    s.set(cx + dx, y, cz + dz, STONE);
    s.fill(cx + dx, y + 1, cz + dz, cx + dx, y + 3, cz + dz, AIR);
  }
}

/** Lower district buildings between approach and gardens (Tier B/C shells + a few interiors). */
export function buildLowerDistrict(s: CitadelStamp): void {
  const plots: Array<{ x: number; z: number; w: number; d: number; h: number }> = [
    { x: -55, z: -100, w: 10, d: 12, h: 14 },
    { x: 40, z: -105, w: 12, d: 10, h: 16 },
    { x: -70, z: -70, w: 9, d: 11, h: 12 },
    { x: 55, z: -75, w: 11, d: 9, h: 15 },
    { x: -40, z: -85, w: 8, d: 8, h: 11 },
    { x: 25, z: -90, w: 9, d: 10, h: 13 },
  ];
  for (const p of plots) {
    const x0 = p.x;
    const x1 = p.x + p.w;
    const z0 = p.z;
    const z1 = p.z + p.d;
    s.walls(x0, G + 1, z0, x1, G + p.h, z1, LIMESTONE);
    s.slab(x0, z0, x1, z1, G + 1, PLANKS);
    s.slab(x0, z0, x1, z1, G + p.h, SLATE);
    // Windows
    for (let y = G + 3; y < G + p.h - 2; y += 4) {
      s.set(x0, y, Math.floor((z0 + z1) / 2), AIR);
      s.set(x1, y, Math.floor((z0 + z1) / 2), AIR);
    }
    // Door toward road
    const doorZ = z1;
    s.fill(
      Math.floor((x0 + x1) / 2) - 1,
      G + 2,
      doorZ,
      Math.floor((x0 + x1) / 2) + 1,
      G + 4,
      doorZ,
      AIR,
    );
    steepRoof(
      s,
      Math.floor((x0 + x1) / 2),
      Math.floor((z0 + z1) / 2),
      Math.floor(p.w / 2) + 1,
      G + p.h + 1,
      SLATE,
    );
  }

  // Flatten grass pads near road
  for (let wz = Z0 - 40; wz < Z0 - 5; wz++) {
    for (let wx = CX - 20; wx <= CX + 20; wx++) {
      if (Math.abs(wx - CX) <= 4) continue;
      if (hash2(wx, wz, 0x9a11) > 0.7) s.set(wx, G, wz, GRASS);
    }
  }
}

/** Wall-walk access stairs inside near gate. */
export function buildWallAccess(s: CitadelStamp): void {
  // East of gate
  stairFlightZ(s, CX + GATE_HALF + 10, CX + GATE_HALF + 12, Z0 + 3, G + 2, WALK_Y - G - 1, 1);
  s.fill(CX + GATE_HALF + 9, WALK_Y, Z0 + 2, CX + GATE_HALF + 13, WALK_Y, Z0 + 8, CARVED_LIMESTONE);
}
