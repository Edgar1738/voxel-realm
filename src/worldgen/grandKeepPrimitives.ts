import {
  AIR,
  COBBLESTONE,
  STONE,
  BRICK,
  PLANKS,
  GLASS,
  LANTERN,
  GLOWSTONE,
  OAK_FENCE,
  COBBLE_WALL,
  STAIRS_STONE,
  DEEPSLATE,
} from '../blocks/blocks';
import { packState, FACING } from '../world/VoxelState';
import { CitadelStamp, spiralStair, floorWithStairHole } from './CitadelStamp';
import type { BlockId } from '../core/types';

/** Place a facing-aware stair step. */
export function setStair(
  s: CitadelStamp,
  x: number,
  y: number,
  z: number,
  facing: number,
  block: BlockId = STAIRS_STONE,
): void {
  s.set(x, y, z, block, packState(facing, 0));
}

/**
 * Straight stair flight rising along ±Z. `dir` +1 rises toward +z (facing S), −1 toward −z (facing N).
 * Clears a 3-block headroom column above each step so the shaft stays walkable.
 */
export function stairFlightZ(
  s: CitadelStamp,
  x0: number,
  x1: number,
  zStart: number,
  yStart: number,
  steps: number,
  dir: 1 | -1,
  block: BlockId = STAIRS_STONE,
): void {
  const facing = dir > 0 ? FACING.S : FACING.N;
  for (let i = 0; i < steps; i++) {
    const y = yStart + i;
    const z = zStart + i * dir;
    for (let x = x0; x <= x1; x++) {
      s.fill(x, y, z, x, y + 3, z, AIR);
      setStair(s, x, y, z, facing, block);
    }
  }
}

/**
 * Straight stair flight rising along ±X. `dir` +1 rises toward +x (facing E), −1 toward −x (facing W).
 */
export function stairFlightX(
  s: CitadelStamp,
  z0: number,
  z1: number,
  xStart: number,
  yStart: number,
  steps: number,
  dir: 1 | -1,
  block: BlockId = STAIRS_STONE,
): void {
  const facing = dir > 0 ? FACING.E : FACING.W;
  for (let i = 0; i < steps; i++) {
    const y = yStart + i;
    const x = xStart + i * dir;
    for (let z = z0; z <= z1; z++) {
      s.fill(x, y, z, x, y + 3, z, AIR);
      setStair(s, x, y, z, facing, block);
    }
  }
}

/**
 * Switchback grand stair between two floor heights inside a rectangular well.
 * Flights are `width` blocks wide; landings are full well width. Rise per flight is half the
 * storey (or full if the well is short in Z). Designed for ~5-wide ceremonial stairs.
 */
export function switchbackStair(
  s: CitadelStamp,
  wellX0: number,
  wellX1: number,
  wellZ0: number,
  wellZ1: number,
  yBottom: number,
  yTop: number,
  width = 5,
  block: BlockId = STAIRS_STONE,
  wall: BlockId = STONE,
): void {
  const rise = yTop - yBottom;
  if (rise <= 0) return;

  // Well walls (open toward keep interior on west face if well sits on east wing — caller carves doors).
  s.walls(wellX0, yBottom, wellZ0, wellX1, yTop, wellZ1, wall);
  // Hollow interior.
  s.fill(wellX0 + 1, yBottom, wellZ0 + 1, wellX1 - 1, yTop - 1, wellZ1 - 1, AIR);

  const midX = Math.floor((wellX0 + wellX1) / 2);
  const stepX0 = midX - Math.floor(width / 2);
  const stepX1 = stepX0 + width - 1;

  // Number of flights of ~6 steps; landings between.
  const flightRise = 6;
  let y = yBottom;
  let goingPosZ = true;
  let safety = 0;
  while (y < yTop && safety < 40) {
    safety++;
    const remaining = yTop - y;
    const steps = Math.min(flightRise, remaining);
    const zLen = wellZ1 - wellZ0 - 2;
    if (zLen < steps) {
      // Fallback: compact spiral if well too short for straight flights.
      const cx = midX;
      const cz = Math.floor((wellZ0 + wellZ1) / 2);
      spiralStair(s, cx, cz, y, yTop, COBBLESTONE, wall);
      return;
    }
    if (goingPosZ) {
      // Start near wellZ0, rise toward +z.
      const zStart = wellZ0 + 1;
      stairFlightZ(s, stepX0, stepX1, zStart, y, steps, 1, block);
      // Landing at top of flight.
      const landY = y + steps;
      const landZ = zStart + steps;
      if (landY < yTop) {
        s.fill(
          wellX0 + 1,
          landY,
          landZ,
          wellX1 - 1,
          landY,
          Math.min(landZ + 2, wellZ1 - 1),
          PLANKS,
        );
        s.set(wellX0 + 2, landY + 1, landZ + 1, LANTERN);
      }
    } else {
      const zStart = wellZ1 - 1;
      stairFlightZ(s, stepX0, stepX1, zStart, y, steps, -1, block);
      const landY = y + steps;
      const landZ = zStart - steps;
      if (landY < yTop) {
        s.fill(
          wellX0 + 1,
          landY,
          Math.max(landZ - 2, wellZ0 + 1),
          wellX1 - 1,
          landY,
          landZ,
          PLANKS,
        );
        s.set(wellX1 - 2, landY + 1, landZ - 1, LANTERN);
      }
    }
    y += steps;
    goingPosZ = !goingPosZ;
  }

  // Open doorway slots on west wall of well at each storey (keep interior side).
  // Caller may enlarge; we punch 3-wide openings at yBottom and landings.
  for (let fy = yBottom; fy <= yTop; fy += 6) {
    s.fill(wellX0, fy + 1, wellZ0 + 3, wellX0, fy + 3, wellZ0 + 6, AIR);
  }
}

/** Solid floor over a rectangle, leaving a rectangular hole for a stair well. */
export function floorWithRectHole(
  s: CitadelStamp,
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  y: number,
  hx0: number,
  hz0: number,
  hx1: number,
  hz1: number,
  block: BlockId,
): void {
  const ax = Math.max(Math.min(x0, x1), s.wx0);
  const bx = Math.min(Math.max(x0, x1), s.wx1);
  const az = Math.max(Math.min(z0, z1), s.wz0);
  const bz = Math.min(Math.max(z0, z1), s.wz1);
  const hxLo = Math.min(hx0, hx1);
  const hxHi = Math.max(hx0, hx1);
  const hzLo = Math.min(hz0, hz1);
  const hzHi = Math.max(hz0, hz1);
  for (let wz = az; wz <= bz; wz++) {
    for (let wx = ax; wx <= bx; wx++) {
      if (wx >= hxLo && wx <= hxHi && wz >= hzLo && wz <= hzHi) continue;
      s.set(wx, y, wz, block);
    }
  }
}

/** Alternating merlon battlement on the outer rim of a roof/walk. */
export function battlements(
  s: CitadelStamp,
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  y: number,
  block: BlockId = COBBLESTONE,
  rail: BlockId = COBBLE_WALL,
): void {
  for (let wx = x0; wx <= x1; wx++) {
    if (((wx + z0) & 1) === 0) s.set(wx, y, z0, block);
    else s.set(wx, y, z0, rail);
    if (((wx + z1) & 1) === 0) s.set(wx, y, z1, block);
    else s.set(wx, y, z1, rail);
  }
  for (let wz = z0; wz <= z1; wz++) {
    if (((x0 + wz) & 1) === 0) s.set(x0, y, wz, block);
    else s.set(x0, y, wz, rail);
    if (((x1 + wz) & 1) === 0) s.set(x1, y, wz, block);
    else s.set(x1, y, wz, rail);
  }
}

/** Regular glass window rhythm on a wall face (axis-aligned). */
export function windowRow(
  s: CitadelStamp,
  along: 'x' | 'z',
  a0: number,
  a1: number,
  fixed: number,
  y: number,
  stride = 4,
  height = 2,
): void {
  for (let a = a0 + 2; a <= a1 - 2; a += stride) {
    for (let dy = 0; dy < height; dy++) {
      if (along === 'x') s.set(a, y + dy, fixed, GLASS);
      else s.set(fixed, y + dy, a, GLASS);
    }
  }
}

/**
 * Hollow rectangular tower with spiral stair, floors, windows, roof battlements.
 * Doorway opens toward (faceX, faceZ) courtyard direction on the ground storey.
 */
export function hollowTower(
  s: CitadelStamp,
  cx: number,
  cz: number,
  half: number,
  baseY: number,
  topY: number,
  opts: {
    wall?: BlockId;
    floor?: BlockId;
    floorGap?: number;
    doorFace?: 'n' | 'e' | 's' | 'w';
    wallWalkY?: number;
  } = {},
): void {
  const wall = opts.wall ?? STONE;
  const floor = opts.floor ?? PLANKS;
  const gap = opts.floorGap ?? 8;
  const x0 = cx - half;
  const x1 = cx + half;
  const z0 = cz - half;
  const z1 = cz + half;

  s.fill(x0, baseY - 1, z0, x1, baseY - 1, z1, DEEPSLATE);
  s.walls(x0, baseY, z0, x1, topY, z1, wall);
  // Hollow interior column.
  s.fill(x0 + 1, baseY, z0 + 1, x1 - 1, topY - 1, z1 - 1, AIR);

  const stairX = x0 + 2;
  const stairZ = z0 + 2;
  for (let fy = baseY + gap; fy < topY; fy += gap) {
    floorWithStairHole(s, x0 + 1, z0 + 1, x1 - 1, z1 - 1, fy, stairX, stairZ, floor);
    s.set(x1 - 2, fy + 1, z1 - 2, LANTERN);
  }
  spiralStair(s, stairX, stairZ, baseY, topY, COBBLESTONE, wall);

  floorWithStairHole(s, x0 + 1, z0 + 1, x1 - 1, z1 - 1, topY, stairX, stairZ, STONE);
  battlements(s, x0, z0, x1, z1, topY + 1, wall);
  s.set(cx, topY + 1, cz, GLOWSTONE);

  // Windows
  for (let y = baseY + 3; y < topY; y += 4) {
    s.set(cx, y, z0, GLASS);
    s.set(cx, y, z1, GLASS);
    s.set(x0, y, cz, GLASS);
    s.set(x1, y, cz, GLASS);
  }

  // Ground doorway
  const face = opts.doorFace ?? 's';
  if (face === 's') s.fill(cx - 1, baseY, z1, cx + 1, baseY + 2, z1, AIR);
  else if (face === 'n') s.fill(cx - 1, baseY, z0, cx + 1, baseY + 2, z0, AIR);
  else if (face === 'e') s.fill(x1, baseY, cz - 1, x1, baseY + 2, cz + 1, AIR);
  else s.fill(x0, baseY, cz - 1, x0, baseY + 2, cz + 1, AIR);

  // Optional wall-walk connection openings
  if (opts.wallWalkY !== undefined) {
    const wy = opts.wallWalkY;
    s.fill(cx - 1, wy + 1, z0, cx + 1, wy + 3, z0, AIR);
    s.fill(cx - 1, wy + 1, z1, cx + 1, wy + 3, z1, AIR);
    s.fill(x0, wy + 1, cz - 1, x0, wy + 3, cz + 1, AIR);
    s.fill(x1, wy + 1, cz - 1, x1, wy + 3, cz + 1, AIR);
  }
}

/** Monumental doorway cut through a wall thickness. */
export function grandDoorway(
  s: CitadelStamp,
  x0: number,
  y0: number,
  z0: number,
  x1: number,
  y1: number,
  z1: number,
): void {
  s.fill(x0, y0, z0, x1, y1, z1, AIR);
}

/** Simple column for Great Hall rhythm. */
export function column(
  s: CitadelStamp,
  x: number,
  z: number,
  y0: number,
  y1: number,
  block: BlockId = STONE,
): void {
  s.fill(x, y0, z, x, y1, z, block);
  s.set(x, y1, z, block);
}

/** Placeholder furniture: table + chairs outline (Milestone 1 light only). */
export function placeholderTable(s: CitadelStamp, cx: number, y: number, cz: number): void {
  s.fill(cx - 1, y, cz, cx + 1, y, cz, PLANKS);
  s.set(cx - 2, y, cz, OAK_FENCE);
  s.set(cx + 2, y, cz, OAK_FENCE);
}

export { spiralStair, floorWithStairHole, packState, FACING, BRICK };
