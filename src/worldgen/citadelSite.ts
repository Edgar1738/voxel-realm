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
  CRYSTAL,
  BOOKSHELF,
  FURNACE,
  GOLD_ORE,
  EMERALD_ORE,
  OAK_FENCE,
  COBBLE_WALL,
  WATER,
} from '../blocks/blocks';
import { CITADEL } from './CitadelGenerator';
import { CitadelStamp, hash2, spiralStair, floorWithStairHole } from './CitadelStamp';
import { buildDungeon } from './citadelDungeon';
import { well, marketStall, lampPost } from './prefabs';
import type { Overlay } from './Generator';
import type { Prefab } from '../core/Prefab';
import type { BlockId } from '../core/types';

// ── Site layout (all world coordinates, derived from the shared CITADEL frame) ───────────────
const C = CITADEL;
const G = C.groundY; // 80 — courtyard ground (top solid block)
const CX = C.centerX; // 8
const CZ = C.centerZ; // 8

const HW = 48; // curtain wall half-extent
const X0 = CX - HW; // -40 outer west
const X1 = CX + HW; // 56 outer east
const Z0 = CZ - HW; // -40 outer north
const Z1 = CZ + HW; // 56 outer south
const WT = 3; // wall thickness
const IN_X0 = X0 + WT; // -37 interior west face
const IN_X1 = X1 - WT; // 53 interior east face
const IN_Z0 = Z0 + WT; // -37 interior north face
const IN_Z1 = Z1 - WT; // 53 interior south face

const WALL_Y0 = G + 1; // 81 wall base
const WALK_Y = G + 11; // 91 wall-walk surface (wall is solid WALL_Y0..WALK_Y)
const MERLON_Y = WALK_Y + 1; // 92 parapet height
const GATE_HALF = 2; // gate opening is 2*GATE_HALF+1 = 5 wide
const GATE_TOP = G + 5; // 85 top of the gate passage

// East-wall ruined stretch (asymmetry): wall is collapsed to a ragged crown here.
const RUIN_Z0 = CZ + 8;
const RUIN_Z1 = CZ + 22;

// Moat: a water ring on the glacis just beyond the walls/towers, crossed only at the two gates.
const MOAT_IN = 55; // inner Chebyshev edge (towers reach ~51; flat mesa runs to 64)
const MOAT_OUT = 59; // outer edge
const MOAT_WATER_TOP = G - 1; // 79 — water surface one block below the mesa rim
const MOAT_FLOOR = G - 5; // 75 — stone bed

/** Stamp a portable prefab (min-corner anchored) into the chunk at a world origin. */
function stampPrefab(s: CitadelStamp, p: Prefab, ox: number, oy: number, oz: number): void {
  for (const [dx, dy, dz, id] of p.blocks) {
    if (id !== AIR) s.set(ox + dx, oy + dy, oz + dz, id);
  }
}

// ── Courtyard ────────────────────────────────────────────────────────────────────────────────
function buildCourtyard(s: CitadelStamp): void {
  // Seal a solid layer just under the courtyard so caves can't leave a thin shell underfoot.
  s.fill(IN_X0, G - 1, IN_Z0, IN_X1, G - 1, IN_Z1, COBBLESTONE);
  // Paving with subtle, deterministic variation so the ground doesn't read as one flat slab.
  const ax = Math.max(IN_X0, s.wx0);
  const bx = Math.min(IN_X1, s.wx1);
  const az = Math.max(IN_Z0, s.wz0);
  const bz = Math.min(IN_Z1, s.wz1);
  for (let wz = az; wz <= bz; wz++) {
    for (let wx = ax; wx <= bx; wx++) {
      const cheb = Math.max(Math.abs(wx - CX), Math.abs(wz - CZ));
      if (cheb <= 12) {
        s.set(wx, G, wz, STONE); // central plaza flagstones
        continue;
      }
      const r = hash2(wx, wz, 0x9a1);
      s.set(wx, G, wz, r < 0.12 ? STONE : r < 0.18 ? GRAVEL : COBBLESTONE);
    }
  }
}

// ── Curtain walls, gates, parapet ──────────────────────────────────────────────────────────
function isRuinedEast(wx: number, wz: number): boolean {
  return wx >= X1 - WT && wz >= RUIN_Z0 && wz <= RUIN_Z1;
}

function buildWalls(s: CitadelStamp): void {
  // Four solid wall slabs.
  s.fill(X0, WALL_Y0, Z0, X0 + WT - 1, WALK_Y, Z1, COBBLESTONE); // west
  s.fill(X1 - WT + 1, WALL_Y0, Z0, X1, WALK_Y, Z1, COBBLESTONE); // east
  s.fill(X0, WALL_Y0, Z0, X1, WALK_Y, Z0 + WT - 1, COBBLESTONE); // north
  s.fill(X0, WALL_Y0, Z1 - WT + 1, X1, WALK_Y, Z1, COBBLESTONE); // south

  // Gate passages through the north and south walls (wall-walk continues over the lintel).
  s.fill(CX - GATE_HALF, WALL_Y0, Z0, CX + GATE_HALF, GATE_TOP, Z0 + WT - 1, AIR);
  s.fill(CX - GATE_HALF, WALL_Y0, Z1 - WT + 1, CX + GATE_HALF, GATE_TOP, Z1, AIR);
  // Raised portcullis bars (decorative) at the gate heads.
  for (const z of [Z0 + WT - 1, Z1 - WT + 1]) {
    for (let wx = CX - GATE_HALF; wx <= CX + GATE_HALF; wx++) s.set(wx, GATE_TOP, z, OAK_FENCE);
  }

  // Collapse the ruined east-wall stretch to a ragged crown + scatter rubble inside.
  for (let wz = RUIN_Z0; wz <= RUIN_Z1; wz++) {
    const ragged = WALL_Y0 + Math.floor(hash2(0, wz, 0x4111) * 6); // 81..86
    s.fill(X1 - WT + 1, ragged + 1, wz, X1, WALK_Y, wz, AIR);
    if (hash2(wz, 0, 0x4222) < 0.4) s.set(IN_X1 - 1, G + 1, wz, COBBLESTONE); // fallen blocks
  }

  // Parapet: alternating outer merlons + a continuous inner railing, skipping the ruined run.
  const merlon = (wx: number, wz: number): void => {
    if (isRuinedEast(wx, wz)) return;
    if (((wx + wz) & 1) === 0) s.set(wx, MERLON_Y, wz, COBBLESTONE);
  };
  const rail = (wx: number, wz: number): void => {
    if (isRuinedEast(wx, wz)) return;
    s.set(wx, MERLON_Y, wz, COBBLE_WALL);
  };
  for (let wz = Z0; wz <= Z1; wz++) {
    merlon(X0, wz);
    merlon(X1, wz);
    rail(IN_X0, wz); // inner west face
    rail(IN_X1, wz); // inner east face
  }
  for (let wx = X0; wx <= X1; wx++) {
    merlon(wx, Z0);
    merlon(wx, Z1);
    rail(wx, IN_Z0);
    rail(wx, IN_Z1);
  }
}

// ── Moat + drawbridges ──────────────────────────────────────────────────────────────────────
/**
 * A square water moat on the glacis outside the curtain wall. The ring is impassable except where
 * the two gate axes (N & S, at x=CX) carry a plank drawbridge with fenced rails — so the only way
 * in on foot is across a bridge and through a gate.
 */
function buildMoat(s: CitadelStamp): void {
  const ax = Math.max(CX - MOAT_OUT, s.wx0);
  const bx = Math.min(CX + MOAT_OUT, s.wx1);
  const az = Math.max(CZ - MOAT_OUT, s.wz0);
  const bz = Math.min(CZ + MOAT_OUT, s.wz1);
  for (let wz = az; wz <= bz; wz++) {
    for (let wx = ax; wx <= bx; wx++) {
      const cheb = Math.max(Math.abs(wx - CX), Math.abs(wz - CZ));
      if (cheb < MOAT_IN || cheb > MOAT_OUT) continue;
      const onBridge = Math.abs(wx - CX) <= GATE_HALF; // the N/S gate axis (also the only N/S band)
      s.set(wx, MOAT_FLOOR, wz, STONE); // bed
      s.fill(wx, MOAT_FLOOR + 1, wz, wx, MOAT_WATER_TOP, wz, WATER);
      if (onBridge) {
        s.set(wx, G, wz, PLANKS); // drawbridge deck, flush with the mesa rim
        if (Math.abs(wx - CX) === GATE_HALF) s.set(wx, G + 1, wz, OAK_FENCE); // bridge rails
      } else {
        s.fill(wx, MOAT_WATER_TOP + 1, wz, wx, G + 1, wz, AIR); // open the channel above the water
      }
    }
  }
}

// ── Towers ─────────────────────────────────────────────────────────────────────────────────
interface TowerOpts {
  wall: BlockId;
  floor: BlockId;
  /** Vertical gap between interior floors. */
  floorGap: number;
  /** Build a doorway out to the wall-walk on the inner faces at WALK level. */
  wallWalkDoor?: boolean;
  /** Ruined: ragged crown + breaches, shorter, no clean battlement. */
  ruined?: boolean;
}

/**
 * A hollow square tower centred at (cx,cz) with half-width `half` (footprint (2*half+1)^2),
 * interior floors, a 3x3 spiral stair, arrow-slit windows, a lit roof terrace with battlements,
 * and a ground doorway facing the courtyard.
 */
function squareTower(
  s: CitadelStamp,
  cx: number,
  cz: number,
  half: number,
  baseY: number,
  topY: number,
  opts: TowerOpts,
): void {
  const x0 = cx - half;
  const x1 = cx + half;
  const z0 = cz - half;
  const z1 = cz + half;

  if (opts.ruined) {
    // Ragged hollow shell with breaches — a half-collapsed tower.
    for (let wx = x0; wx <= x1; wx++) {
      for (let wz = z0; wz <= z1; wz++) {
        if (wx !== x0 && wx !== x1 && wz !== z0 && wz !== z1) continue;
        const crown = baseY + 6 + Math.floor(hash2(wx, wz, 0x7e1) * (topY - baseY - 6));
        for (let y = baseY; y <= crown; y++) {
          if (hash2(wx, wz * 3, y) < 0.12) continue; // breaches
          s.set(wx, y, wz, opts.wall);
        }
      }
    }
    s.fill(x0 + 1, baseY - 1, z0 + 1, x1 - 1, baseY - 1, z1 - 1, COBBLESTONE); // rubble floor
    s.set(cx, baseY, cz, LANTERN);
    return;
  }

  // Solid foundation + outer walls.
  s.fill(x0, baseY - 1, z0, x1, baseY - 1, z1, opts.wall);
  s.walls(x0, baseY, z0, x1, topY, z1, opts.wall);

  // Interior floors with a stair hole, plus a lit lantern on each level.
  const stairX = x0 + 1;
  const stairZ = z0 + 1;
  for (let fy = baseY; fy < topY; fy += opts.floorGap) {
    if (fy > baseY)
      floorWithStairHole(s, x0 + 1, z0 + 1, x1 - 1, z1 - 1, fy, stairX, stairZ, opts.floor);
    s.set(x1 - 1, fy + 1, z1 - 1, LANTERN);
  }
  spiralStair(s, stairX, stairZ, baseY, topY, COBBLESTONE, opts.wall);

  // Roof terrace + battlement.
  floorWithStairHole(s, x0 + 1, z0 + 1, x1 - 1, z1 - 1, topY, stairX, stairZ, opts.floor);
  for (let wx = x0; wx <= x1; wx++) {
    if (((wx + z0) & 1) === 0) s.set(wx, topY + 1, z0, opts.wall);
    if (((wx + z1) & 1) === 0) s.set(wx, topY + 1, z1, opts.wall);
  }
  for (let wz = z0; wz <= z1; wz++) {
    if (((x0 + wz) & 1) === 0) s.set(x0, topY + 1, wz, opts.wall);
    if (((x1 + wz) & 1) === 0) s.set(x1, topY + 1, wz, opts.wall);
  }

  // Arrow-slit windows on each face at mid heights.
  for (let y = baseY + 2; y < topY; y += 4) {
    s.set(cx, y, z0, GLASS);
    s.set(cx, y, z1, GLASS);
    s.set(x0, y, cz, GLASS);
    s.set(x1, y, cz, GLASS);
  }

  // Ground doorway facing the courtyard centre, so you can enter from the bailey.
  const doorZ = cz < CZ ? z1 : z0;
  s.fill(cx - 1, baseY, doorZ, cx + 1, baseY + 2, doorZ, AIR);

  // Optional doorway onto the wall-walk.
  if (opts.wallWalkDoor) {
    const wy = WALK_Y;
    if (cx < CX) s.fill(x1, wy + 1, cz - 1, x1, wy + 2, cz + 1, AIR);
    else s.fill(x0, wy + 1, cz - 1, x0, wy + 2, cz + 1, AIR);
    if (cz < CZ) s.fill(cx - 1, wy + 1, z1, cx + 1, wy + 2, z1, AIR);
    else s.fill(cx - 1, wy + 1, z0, cx + 1, wy + 2, z0, AIR);
  }
}

function buildCornerTowers(s: CitadelStamp): void {
  const base = WALL_Y0;
  const topY = G + 22;
  const common: TowerOpts = { wall: COBBLESTONE, floor: PLANKS, floorGap: 6, wallWalkDoor: true };
  squareTower(s, X0 + 1, Z0 + 1, 4, base, topY, common); // NW
  squareTower(s, X0 + 1, Z1 - 1, 4, base, topY, common); // SW
  squareTower(s, X1 - 1, Z1 - 1, 4, base, topY, common); // SE
  squareTower(s, X1 - 1, Z0 + 1, 4, base, topY, { ...common, ruined: true }); // NE — ruined
}

/** A stair turret just inside each gate giving courtyard→wall-walk access. */
function buildGateStairs(s: CitadelStamp): void {
  const turret = (cx: number, cz: number): void => {
    squareTower(s, cx, cz, 2, WALL_Y0, WALK_Y + 1, {
      wall: COBBLESTONE,
      floor: PLANKS,
      floorGap: 20,
      wallWalkDoor: true,
    });
  };
  turret(CX + 5, IN_Z0 + 2); // beside north gate
  turret(CX + 5, IN_Z1 - 2); // beside south gate
}

// ── Keep (the centrepiece) ─────────────────────────────────────────────────────────────────
const KX0 = CX - 8; // 0
const KX1 = CX + 8; // 16
const KZ0 = CZ - 20; // -12
const KZ1 = CZ - 4; // 4
const KEEP_FLOORS = [G + 1, G + 6, G + 11, G + 16, G + 21, G + 26]; // six storeys, 5 tall each
const KEEP_ROOF = G + 31; // 111 terrace — the keep is the tallest mass in the fortress
const KCX = (KX0 + KX1) >> 1; // 8
const KCZ = (KZ0 + KZ1) >> 1; // -4

function buildKeep(s: CitadelStamp): void {
  const wall = BRICK;
  s.fill(KX0, G, KZ0, KX1, G, KZ1, STONE); // foundation slab at ground
  s.walls(KX0, G + 1, KZ0, KX1, KEEP_ROOF, KZ1, wall);

  const stairX = KX0 + 2;
  const stairZ = KZ0 + 2;
  // Storey floors (skip the ground, which is the foundation) with a stair hole.
  for (let i = 1; i < KEEP_FLOORS.length; i++) {
    floorWithStairHole(
      s,
      KX0 + 1,
      KZ0 + 1,
      KX1 - 1,
      KZ1 - 1,
      KEEP_FLOORS[i],
      stairX,
      stairZ,
      PLANKS,
    );
  }
  spiralStair(s, stairX, stairZ, G + 1, KEEP_ROOF, COBBLESTONE, wall);

  // Roof terrace + battlement + a glowing beacon spire (visible for a long way).
  floorWithStairHole(s, KX0 + 1, KZ0 + 1, KX1 - 1, KZ1 - 1, KEEP_ROOF, stairX, stairZ, STONE);
  for (let wx = KX0; wx <= KX1; wx++) {
    if (((wx + KZ0) & 1) === 0) s.set(wx, KEEP_ROOF + 1, KZ0, wall);
    if (((wx + KZ1) & 1) === 0) s.set(wx, KEEP_ROOF + 1, KZ1, wall);
  }
  for (let wz = KZ0; wz <= KZ1; wz++) {
    if (((KX0 + wz) & 1) === 0) s.set(KX0, KEEP_ROOF + 1, wz, wall);
    if (((KX1 + wz) & 1) === 0) s.set(KX1, KEEP_ROOF + 1, wz, wall);
  }
  s.fill(KCX, KEEP_ROOF + 1, KCZ, KCX, KEEP_ROOF + 20, KCZ, WOOD); // beacon mast
  s.set(KCX, KEEP_ROOF + 21, KCZ, GLOWSTONE);
  s.fill(KCX - 1, KEEP_ROOF + 20, KCZ, KCX + 1, KEEP_ROOF + 20, KCZ, GLOWSTONE);
  s.fill(KCX, KEEP_ROOF + 20, KCZ - 1, KCX, KEEP_ROOF + 20, KCZ + 1, GLOWSTONE);

  // Windows down each face on every storey.
  for (const fy of KEEP_FLOORS) {
    for (let wx = KX0 + 3; wx <= KX1 - 3; wx += 4) {
      s.set(wx, fy + 2, KZ0, GLASS);
      s.set(wx, fy + 2, KZ1, GLASS);
    }
    for (let wz = KZ0 + 3; wz <= KZ1 - 3; wz += 4) {
      s.set(KX0, fy + 2, wz, GLASS);
      s.set(KX1, fy + 2, wz, GLASS);
    }
    s.set(KX1 - 1, fy + 1, KZ1 - 1, LANTERN); // a lantern on every storey
  }

  // Grand south entrance with a short stair up to it.
  s.fill(KCX - 1, G + 1, KZ1, KCX + 1, G + 3, KZ1, AIR);
  s.fill(KCX - 2, G, KZ1 + 1, KCX + 2, G, KZ1 + 2, STONE);

  // Ground floor: a great hall with a furnace, timber tables, a throne dais, and lit braziers.
  s.set(KX0 + 2, G + 1, KZ1 - 2, FURNACE);
  s.fill(KCX - 2, G + 1, KCZ, KCX + 2, G + 1, KCZ, PLANKS);
  s.fill(KCX - 2, G + 1, KZ0 + 2, KCX + 2, G + 1, KZ0 + 2, BRICK); // dais step
  s.fill(KCX - 1, G + 2, KZ0 + 1, KCX + 1, G + 2, KZ0 + 1, BRICK); // throne seat
  s.set(KCX, G + 3, KZ0 + 1, GOLD_ORE); // gilded backrest
  for (const bx of [KCX - 3, KCX + 3]) {
    s.fill(bx, G + 1, KZ1 + 1, bx, G + 2, KZ1 + 1, OAK_FENCE); // brazier post flanking the door
    s.set(bx, G + 3, KZ1 + 1, GLOWSTONE); // its flame
  }

  // Second floor: a library lined with bookshelves...
  const libY = KEEP_FLOORS[1];
  s.fill(KX0 + 1, libY + 1, KZ0 + 1, KX1 - 1, libY + 2, KZ0 + 1, BOOKSHELF);
  s.fill(KX0 + 1, libY + 1, KZ1 - 1, KX1 - 1, libY + 2, KZ1 - 1, BOOKSHELF);
  // ...hiding a secret treasure nook behind the shelves (one shelf cell is a doorway).
  const hideY = KEEP_FLOORS[2];
  s.fill(KX1 - 3, hideY + 1, KZ0 + 1, KX1 - 1, hideY + 3, KZ0 + 1, BRICK); // sealing wall
  s.fill(KX1 - 3, hideY + 1, KZ0 + 1, KX1 - 1, hideY + 2, KZ0 + 1, BOOKSHELF); // disguised front
  s.set(KX1 - 2, hideY + 1, KZ0 + 1, AIR); // the hidden gap to squeeze through
  s.set(KX1 - 2, hideY + 1, KZ0, GOLD_ORE);
  s.set(KX1 - 1, hideY + 1, KZ0, EMERALD_ORE);
  s.set(KX1 - 3, hideY + 1, KZ0, CRYSTAL);
}

// ── Mage tower (slender landmark) ─────────────────────────────────────────────────────────
function buildMageTower(s: CitadelStamp): void {
  const cx = CX - 28; // -20
  const cz = CZ + 24; // 32
  const baseY = G + 1;
  const shaftTop = G + 26; // a secondary spire — deliberately shorter than the keep
  s.fill(cx - 2, G, cz - 2, cx + 2, G, cz + 2, STONE); // foundation
  s.walls(cx - 2, baseY, cz - 2, cx + 2, shaftTop, cz + 2, STONE);
  spiralStair(s, cx - 1, cz - 1, baseY, shaftTop, COBBLESTONE, STONE);
  for (let y = baseY + 3; y < shaftTop; y += 5) {
    s.set(cx, y, cz - 2, GLASS);
    s.set(cx, y, cz + 2, GLASS);
    s.set(cx - 2, y, cz, GLASS);
    s.set(cx + 2, y, cz, GLASS);
  }
  // Flared observatory cap (7x7) with glass walls and a crystal-lit ceiling.
  const capY = shaftTop + 1;
  const capTop = capY + 4;
  s.fill(cx - 3, capY - 1, cz - 3, cx + 3, capY - 1, cz + 3, STONE); // overhang floor
  s.walls(cx - 3, capY, cz - 3, cx + 3, capTop, cz + 3, GLASS);
  s.slab(cx - 3, cz - 3, cx + 3, cz + 3, capTop, STONE); // roof
  s.set(cx, capTop - 1, cz, CRYSTAL);
  s.set(cx, capTop + 1, cz, GLOWSTONE); // beacon
  s.fill(cx - 1, capY - 1, cz - 1, cx + 1, capY - 1, cz + 1, PLANKS); // observatory floor
}

// ── Great hall (second multi-floor building) ───────────────────────────────────────────────
function buildGreatHall(s: CitadelStamp): void {
  const x0 = CX + 18; // 26
  const x1 = CX + 42; // 50
  const z0 = CZ + 16; // 24
  const z1 = CZ + 34; // 42
  const lower = G + 1;
  const mid = G + 6;
  const top = G + 11;
  s.fill(x0, G, z0, x1, G, z1, COBBLESTONE); // floor slab
  s.walls(x0, lower, z0, x1, top, z1, PLANKS);
  // Corner posts in timber for a framed look.
  for (const [px, pz] of [
    [x0, z0],
    [x1, z0],
    [x0, z1],
    [x1, z1],
  ]) {
    s.fill(px, lower, pz, px, top, pz, WOOD);
  }
  const stairX = x0 + 2;
  const stairZ = z0 + 2;
  floorWithStairHole(s, x0 + 1, z0 + 1, x1 - 1, z1 - 1, mid, stairX, stairZ, PLANKS);
  spiralStair(s, stairX, stairZ, lower, top, COBBLESTONE, WOOD);
  s.slab(x0 + 1, z0 + 1, x1 - 1, z1 - 1, top, PLANKS); // roof
  // Doors (south + west) and a row of windows on both storeys.
  s.fill((x0 + x1) >> 1, lower, z1, ((x0 + x1) >> 1) + 1, lower + 2, z1, AIR);
  s.fill(x0, lower, (z0 + z1) >> 1, x0, lower + 2, (z0 + z1) >> 1, AIR);
  for (const fy of [lower, mid]) {
    for (let wx = x0 + 3; wx <= x1 - 3; wx += 3) {
      s.set(wx, fy + 2, z0, GLASS);
      s.set(wx, fy + 2, z1, GLASS);
    }
    s.set(x0 + 2, fy + 1, z1 - 2, LANTERN);
    s.set(x1 - 2, fy + 1, z0 + 2, LANTERN);
  }
}

// ── Plaza dressing (reuses existing tested prefabs) ────────────────────────────────────────
function buildPlaza(s: CitadelStamp): void {
  stampPrefab(s, well(), CX - 1, G + 1, CZ - 1); // central fountain
  stampPrefab(s, marketStall(), CX + 6, G + 1, CZ + 4);
  stampPrefab(s, marketStall(), CX - 10, G + 1, CZ + 4);
  for (const [lx, lz] of [
    [CX - 8, CZ - 8],
    [CX + 8, CZ - 8],
    [CX - 8, CZ + 8],
    [CX + 8, CZ + 8],
  ]) {
    stampPrefab(s, lampPost(), lx, G + 1, lz);
  }
}

// ── High bridge: keep 3rd storey → north wall-walk (an elevated route) ─────────────────────
function buildHighBridge(s: CitadelStamp): void {
  const y = WALK_Y - 1; // deck a touch below the wall-walk
  // Doorway out of the keep's third storey, north face.
  s.fill(KCX - 1, KEEP_FLOORS[2] + 1, KZ0, KCX + 1, KEEP_FLOORS[2] + 2, KZ0, AIR);
  s.fill(KCX - 1, y, KZ0 - 1, KCX + 1, y, IN_Z0, PLANKS); // deck
  for (let wz = KZ0 - 1; wz >= IN_Z0; wz--) {
    s.set(KCX - 2, y + 1, wz, COBBLE_WALL);
    s.set(KCX + 2, y + 1, wz, COBBLE_WALL);
  }
}

/**
 * The citadel site overlay: a single deterministic fortress (curtain walls, gatehouses, corner
 * towers, central keep, mage tower, great hall, plaza, high bridge) plus a multi-level dungeon
 * beneath it. Every primitive is clipped to the chunk being generated, so the structure streams
 * in seamlessly and each chunk only pays for the voxels it actually contains.
 */
export function citadelSite(): Overlay {
  return (chunk, cx, cz, seed) => {
    const s = new CitadelStamp(chunk, cx, cz);
    buildCourtyard(s);
    buildMoat(s);
    buildWalls(s);
    buildCornerTowers(s);
    buildGateStairs(s);
    buildKeep(s);
    buildMageTower(s);
    buildGreatHall(s);
    buildPlaza(s);
    buildHighBridge(s);
    buildDungeon(s, seed);
  };
}
