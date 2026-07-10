import {
  AIR,
  COBBLESTONE,
  STONE,
  BRICK,
  PLANKS,
  GLASS,
  GRAVEL,
  LANTERN,
  GLOWSTONE,
  OAK_FENCE,
  COBBLE_WALL,
  WATER,
  DEEPSLATE,
  STAIRS_STONE,
} from '../blocks/blocks';
import { packState, FACING } from '../world/VoxelState';
import { CitadelStamp, hash2 } from './CitadelStamp';
import {
  G,
  CX,
  CZ,
  X0,
  X1,
  Z0,
  Z1,
  WT,
  IN_X0,
  IN_X1,
  IN_Z0,
  IN_Z1,
  WALL_Y0,
  WALK_Y,
  MERLON_Y,
  GATE_HALF,
  GATE_TOP,
  GATEHOUSE_DEPTH,
  KZ0,
  MOAT_IN,
  MOAT_OUT,
} from './grandKeepFrame';
import { battlements, hollowTower, stairFlightZ } from './grandKeepPrimitives';

// ── Approach road + moat ───────────────────────────────────────────────────────────────────

/** Stone road from southern spawn approach to the gatehouse. */
export function buildApproach(s: CitadelStamp): void {
  const roadZ0 = Z0 - 70; // further back for the expanded walls
  const roadZ1 = Z0 - 1;
  const halfW = 3;
  for (let wz = Math.max(roadZ0, s.wz0); wz <= Math.min(roadZ1, s.wz1); wz++) {
    for (let wx = Math.max(CX - halfW, s.wx0); wx <= Math.min(CX + halfW, s.wx1); wx++) {
      const r = hash2(wx, wz, 0x70ad);
      s.set(wx, G, wz, r < 0.55 ? COBBLESTONE : r < 0.8 ? STONE : GRAVEL);
      s.fill(wx, G + 1, wz, wx, G + 3, wz, AIR);
    }
    // Edge lanterns every 8 blocks
    if ((wz & 7) === 0) {
      for (const side of [CX - halfW - 1, CX + halfW + 1]) {
        s.set(side, G + 1, wz, COBBLE_WALL);
        s.set(side, G + 2, wz, LANTERN);
      }
    }
  }

  // Short ceremonial stairs up the last few blocks if mesa skirt dips (flat pad so decorative).
  for (let i = 0; i < 3; i++) {
    const z = Z0 - 4 + i;
    for (let x = CX - 4; x <= CX + 4; x++) {
      s.set(x, G, z, STONE);
    }
  }
}

/**
 * Square moat just outside the curtain, crossed only on the south gate axis by a plank bridge.
 */
export function buildMoat(s: CitadelStamp): void {
  const waterTop = G - 1;
  const floor = G - 5;
  const ax = Math.max(CX - MOAT_OUT, s.wx0);
  const bx = Math.min(CX + MOAT_OUT, s.wx1);
  const az = Math.max(CZ - MOAT_OUT, s.wz0);
  const bz = Math.min(CZ + MOAT_OUT, s.wz1);
  for (let wz = az; wz <= bz; wz++) {
    for (let wx = ax; wx <= bx; wx++) {
      const cheb = Math.max(Math.abs(wx - CX), Math.abs(wz - CZ));
      if (cheb < MOAT_IN || cheb > MOAT_OUT) continue;
      const onBridge = Math.abs(wx - CX) <= GATE_HALF && wz <= Z0;
      s.set(wx, floor, wz, STONE);
      s.fill(wx, floor + 1, wz, wx, waterTop, wz, WATER);
      if (onBridge) {
        s.set(wx, G, wz, PLANKS);
        if (Math.abs(wx - CX) === GATE_HALF) s.set(wx, G + 1, wz, OAK_FENCE);
      } else {
        s.fill(wx, waterTop + 1, wz, wx, G + 1, wz, AIR);
      }
    }
  }
}

// ── Courtyard paving ───────────────────────────────────────────────────────────────────────

export function buildCourtyard(s: CitadelStamp): void {
  // Seal under courtyard against caves.
  s.fill(IN_X0, G - 1, IN_Z0, IN_X1, G - 1, Math.min(IN_Z1, KZ0 - 1), DEEPSLATE);

  const ax = Math.max(IN_X0, s.wx0);
  const bx = Math.min(IN_X1, s.wx1);
  const az = Math.max(IN_Z0, s.wz0);
  const bz = Math.min(KZ0 - 1, s.wz1); // courtyard only south of keep
  for (let wz = az; wz <= bz; wz++) {
    for (let wx = ax; wx <= bx; wx++) {
      // Axial processional path toward keep entrance
      if (Math.abs(wx - CX) <= 3) {
        s.set(wx, G, wz, STONE);
        continue;
      }
      const r = hash2(wx, wz, 0x9a1);
      s.set(wx, G, wz, r < 0.12 ? STONE : r < 0.2 ? GRAVEL : COBBLESTONE);
    }
  }

  // Central plaza disc in front of keep
  for (let wz = Math.max(KZ0 - 18, s.wz0); wz <= Math.min(KZ0 - 2, s.wz1); wz++) {
    for (let wx = Math.max(CX - 12, s.wx0); wx <= Math.min(CX + 12, s.wx1); wx++) {
      if (Math.hypot(wx - CX, wz - (KZ0 - 10)) <= 11) s.set(wx, G, wz, STONE);
    }
  }

  // Courtyard lantern posts
  for (const [lx, lz] of [
    [CX - 14, KZ0 - 12],
    [CX + 14, KZ0 - 12],
    [CX - 14, IN_Z0 + 10],
    [CX + 14, IN_Z0 + 10],
    [CX, KZ0 - 8],
  ] as const) {
    s.set(lx, G + 1, lz, COBBLE_WALL);
    s.set(lx, G + 2, lz, COBBLE_WALL);
    s.set(lx, G + 3, lz, LANTERN);
  }
}

// ── Curtain walls + gatehouse ──────────────────────────────────────────────────────────────

export function buildCurtainWalls(s: CitadelStamp): void {
  // Four solid wall slabs.
  s.fill(X0, WALL_Y0, Z0, X0 + WT - 1, WALK_Y, Z1, COBBLESTONE); // west
  s.fill(X1 - WT + 1, WALL_Y0, Z0, X1, WALK_Y, Z1, COBBLESTONE); // east
  s.fill(X0, WALL_Y0, Z0, X1, WALK_Y, Z0 + WT - 1, COBBLESTONE); // south
  s.fill(X0, WALL_Y0, Z1 - WT + 1, X1, WALK_Y, Z1, COBBLESTONE); // north

  // Outer merlons + inner rail
  for (let wz = Z0; wz <= Z1; wz++) {
    if (((X0 + wz) & 1) === 0) s.set(X0, MERLON_Y, wz, COBBLESTONE);
    if (((X1 + wz) & 1) === 0) s.set(X1, MERLON_Y, wz, COBBLESTONE);
    s.set(IN_X0, MERLON_Y, wz, COBBLE_WALL);
    s.set(IN_X1, MERLON_Y, wz, COBBLE_WALL);
  }
  for (let wx = X0; wx <= X1; wx++) {
    if (((wx + Z0) & 1) === 0) s.set(wx, MERLON_Y, Z0, COBBLESTONE);
    if (((wx + Z1) & 1) === 0) s.set(wx, MERLON_Y, Z1, COBBLESTONE);
    s.set(wx, MERLON_Y, IN_Z0, COBBLE_WALL);
    s.set(wx, MERLON_Y, IN_Z1, COBBLE_WALL);
  }

  // Arrow-slit rhythm on outer faces
  for (let y = WALL_Y0 + 3; y < WALK_Y - 1; y += 4) {
    for (let wz = Z0 + 6; wz <= Z1 - 6; wz += 6) {
      s.set(X0, y, wz, GLASS);
      s.set(X1, y, wz, GLASS);
    }
    for (let wx = X0 + 6; wx <= X1 - 6; wx += 6) {
      s.set(wx, y, Z0, GLASS);
      s.set(wx, y, Z1, GLASS);
    }
  }
}

/**
 * Large walkable gatehouse on the south wall: thick passage, upper floor, stair, battlement.
 */
export function buildGatehouse(s: CitadelStamp): void {
  const gz0 = Z0 - 2; // slight outer projection
  const gz1 = Z0 + GATEHOUSE_DEPTH; // inward into courtyard
  const gx0 = CX - GATE_HALF - 6;
  const gx1 = CX + GATE_HALF + 6;
  const base = WALL_Y0;
  const upper = WALK_Y;
  const roof = WALK_Y + 8;

  // Massive shell
  s.fill(gx0, G, gz0, gx1, G, gz1, DEEPSLATE);
  s.walls(gx0, base, gz0, gx1, roof, gz1, STONE);
  // Hollow interior for passage + chambers
  s.fill(gx0 + 1, base, gz0 + 1, gx1 - 1, roof - 1, gz1 - 1, AIR);

  // Outer gate opening through south wall / gatehouse
  s.fill(CX - GATE_HALF, base, gz0, CX + GATE_HALF, GATE_TOP, gz1, AIR);
  // Passage floor
  s.fill(CX - GATE_HALF, G, gz0, CX + GATE_HALF, G, gz1, STONE);

  // Portcullis bars (decorative) at outer and inner openings
  for (const z of [gz0 + 1, gz1 - 1]) {
    for (let wx = CX - GATE_HALF; wx <= CX + GATE_HALF; wx++) {
      s.set(wx, GATE_TOP, z, OAK_FENCE);
    }
  }

  // Upper gatehouse floor over the passage (solid except stair hole on east side)
  const stairX = gx1 - 4;
  const stairZ = gz0 + 4;
  for (let wz = gz0 + 1; wz <= gz1 - 1; wz++) {
    for (let wx = gx0 + 1; wx <= gx1 - 1; wx++) {
      if (Math.abs(wx - stairX) <= 1 && Math.abs(wz - stairZ) <= 1) continue;
      // Keep passage free below: only floor at upper level
      s.set(wx, upper, wz, PLANKS);
    }
  }
  // Spiral from ground side chamber to upper floor
  // Side chamber east of passage
  s.fill(CX + GATE_HALF + 1, base, gz0 + 2, gx1 - 1, upper - 1, gz1 - 2, AIR);
  s.fill(CX - GATE_HALF - 1, base, gz0 + 2, gx0 + 1, upper - 1, gz1 - 2, AIR);
  // Stairs using stone steps along +z in east chamber
  stairFlightZ(s, stairX - 1, stairX + 1, stairZ, base, upper - base, 1, STAIRS_STONE);
  // Landing pads
  s.fill(stairX - 2, upper, stairZ, stairX + 2, upper, stairZ + 2, PLANKS);

  // Upper windows + lanterns
  for (let wx = gx0 + 3; wx <= gx1 - 3; wx += 3) {
    s.set(wx, upper + 2, gz0, GLASS);
    s.set(wx, upper + 2, gz1, GLASS);
  }
  s.set(gx0 + 2, upper + 1, gz0 + 2, LANTERN);
  s.set(gx1 - 2, upper + 1, gz1 - 2, LANTERN);

  // Roof + battlements
  s.fill(gx0 + 1, roof, gz0 + 1, gx1 - 1, roof, gz1 - 1, STONE);
  battlements(s, gx0, gz0, gx1, gz1, roof + 1, STONE);
  s.set(CX, roof + 1, Math.floor((gz0 + gz1) / 2), GLOWSTONE);

  // Door from upper floor onto wall-walk (east and west connections)
  s.fill(
    gx0,
    upper + 1,
    Math.floor((gz0 + gz1) / 2) - 1,
    gx0,
    upper + 3,
    Math.floor((gz0 + gz1) / 2) + 1,
    AIR,
  );
  s.fill(
    gx1,
    upper + 1,
    Math.floor((gz0 + gz1) / 2) - 1,
    gx1,
    upper + 3,
    Math.floor((gz0 + gz1) / 2) + 1,
    AIR,
  );

  // Cut the south curtain opening cleanly for the main gate (already air in passage)
  s.fill(CX - GATE_HALF, base, Z0, CX + GATE_HALF, GATE_TOP, Z0 + WT - 1, AIR);

  // Flanking buttress towers of the gatehouse
  hollowTower(s, gx0 - 3, Z0 + 2, 3, base, roof + 4, {
    wall: STONE,
    floor: PLANKS,
    floorGap: 10,
    doorFace: 'e',
    wallWalkY: WALK_Y,
  });
  hollowTower(s, gx1 + 3, Z0 + 2, 3, base, roof + 4, {
    wall: STONE,
    floor: PLANKS,
    floorGap: 10,
    doorFace: 'w',
    wallWalkY: WALK_Y,
  });
}

/** Corner towers on the curtain wall. */
export function buildCornerTowers(s: CitadelStamp): void {
  const top = WALK_Y + 16;
  const common = {
    wall: COBBLESTONE,
    floor: PLANKS,
    floorGap: 8,
    wallWalkY: WALK_Y,
  };
  hollowTower(s, X0 + 5, Z0 + 5, 5, WALL_Y0, top, { ...common, doorFace: 'e' }); // SW
  hollowTower(s, X1 - 5, Z0 + 5, 5, WALL_Y0, top, { ...common, doorFace: 'w' }); // SE
  hollowTower(s, X0 + 5, Z1 - 5, 5, WALL_Y0, top + 4, { ...common, doorFace: 'e' }); // NW
  hollowTower(s, X1 - 5, Z1 - 5, 5, WALL_Y0, top + 4, { ...common, doorFace: 'w' }); // NE
}

/** Courtyard → wall-walk stair turrets near the gate and keep. */
export function buildWallAccess(s: CitadelStamp): void {
  hollowTower(s, CX + 12, IN_Z0 + 4, 3, WALL_Y0, WALK_Y + 2, {
    wall: COBBLESTONE,
    floor: PLANKS,
    floorGap: 20,
    doorFace: 'n',
    wallWalkY: WALK_Y,
  });
  hollowTower(s, CX - 12, IN_Z0 + 4, 3, WALL_Y0, WALK_Y + 2, {
    wall: COBBLESTONE,
    floor: PLANKS,
    floorGap: 20,
    doorFace: 'n',
    wallWalkY: WALK_Y,
  });
  // Stairs up to keep entrance terrace
  for (let i = 0; i < 3; i++) {
    for (let x = CX - 5; x <= CX + 5; x++) {
      s.set(x, G + i, KZ0 - 3 + i, STAIRS_STONE, packState(FACING.S, 0));
    }
  }
  s.fill(CX - 5, G, KZ0 - 4, CX + 5, G, KZ0 - 1, STONE);
}

/** Light outer buttresses for silhouette (not solid mass). */
export function buildButtresses(s: CitadelStamp): void {
  for (let z = Z0 + 12; z < Z1 - 12; z += 14) {
    // West outer buttresses
    s.fill(X0 - 2, WALL_Y0, z - 1, X0 - 1, WALK_Y - 2, z + 1, BRICK);
    s.fill(X1 + 1, WALL_Y0, z - 1, X1 + 2, WALK_Y - 2, z + 1, BRICK);
  }
  for (let x = X0 + 12; x < X1 - 12; x += 14) {
    if (Math.abs(x - CX) < GATE_HALF + 8) continue; // skip gatehouse
    s.fill(x - 1, WALL_Y0, Z0 - 2, x + 1, WALK_Y - 2, Z0 - 1, BRICK);
  }
}
