/**
 * Exterior balconies on every keep storey — walkable projections with rails and doors out.
 */
import { AIR, STONE, BRICK, PLANKS, LANTERN, COBBLE_WALL, GLOWSTONE } from '../blocks/blocks';
import { CitadelStamp } from './CitadelStamp';
import {
  KX0,
  KX1,
  KZ0,
  KZ1,
  KCX,
  FLOOR,
  INTERIOR_STACK,
  STAIR_Z0,
  STAIR_Z1,
} from './grandKeepFrame';

const DEPTH = 3; // how far balconies project outward
const WIDTH = 5; // bay width along the wall
const STRIDE = 10; // spacing between balcony bays

function railLine(
  s: CitadelStamp,
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  y: number,
): void {
  for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) {
    for (let z = Math.min(z0, z1); z <= Math.max(z0, z1); z++) {
      s.set(x, y, z, COBBLE_WALL);
    }
  }
}

/** South face (courtyard) balcony bay opening outward −z. */
function southBay(s: CitadelStamp, x: number, fy: number): void {
  const x1 = x + WIDTH - 1;
  // Platform
  s.fill(x, fy, KZ0 - DEPTH, x1, fy, KZ0 - 1, STONE);
  // Supports under (every other bay gets brick corbels)
  if (((x + fy) & 1) === 0) {
    s.fill(x, fy - 2, KZ0 - 1, x, fy - 1, KZ0 - 1, BRICK);
    s.fill(x1, fy - 2, KZ0 - 1, x1, fy - 1, KZ0 - 1, BRICK);
  }
  // Outer + side rails
  railLine(s, x, KZ0 - DEPTH, x1, KZ0 - DEPTH, fy + 1);
  railLine(s, x, KZ0 - DEPTH, x, KZ0 - 1, fy + 1);
  railLine(s, x1, KZ0 - DEPTH, x1, KZ0 - 1, fy + 1);
  // Door through keep wall
  s.fill(x + 1, fy + 1, KZ0, x1 - 1, fy + 3, KZ0, AIR);
  s.set(x + 2, fy + 1, KZ0 - 1, LANTERN);
}

/** North face balcony (+z). */
function northBay(s: CitadelStamp, x: number, fy: number): void {
  const x1 = x + WIDTH - 1;
  s.fill(x, fy, KZ1 + 1, x1, fy, KZ1 + DEPTH, STONE);
  if (((x + fy) & 1) === 0) {
    s.fill(x, fy - 2, KZ1 + 1, x, fy - 1, KZ1 + 1, BRICK);
    s.fill(x1, fy - 2, KZ1 + 1, x1, fy - 1, KZ1 + 1, BRICK);
  }
  railLine(s, x, KZ1 + DEPTH, x1, KZ1 + DEPTH, fy + 1);
  railLine(s, x, KZ1 + 1, x, KZ1 + DEPTH, fy + 1);
  railLine(s, x1, KZ1 + 1, x1, KZ1 + DEPTH, fy + 1);
  s.fill(x + 1, fy + 1, KZ1, x1 - 1, fy + 3, KZ1, AIR);
  s.set(x + 2, fy + 1, KZ1 + 1, LANTERN);
}

/** West face balcony (−x). */
function westBay(s: CitadelStamp, z: number, fy: number): void {
  const z1 = z + WIDTH - 1;
  s.fill(KX0 - DEPTH, fy, z, KX0 - 1, fy, z1, STONE);
  if (((z + fy) & 1) === 0) {
    s.fill(KX0 - 1, fy - 2, z, KX0 - 1, fy - 1, z, BRICK);
    s.fill(KX0 - 1, fy - 2, z1, KX0 - 1, fy - 1, z1, BRICK);
  }
  railLine(s, KX0 - DEPTH, z, KX0 - DEPTH, z1, fy + 1);
  railLine(s, KX0 - DEPTH, z, KX0 - 1, z, fy + 1);
  railLine(s, KX0 - DEPTH, z1, KX0 - 1, z1, fy + 1);
  s.fill(KX0, fy + 1, z + 1, KX0, fy + 3, z1 - 1, AIR);
  s.set(KX0 - 1, fy + 1, z + 2, LANTERN);
}

/** East face balcony (+x) — skip grand-stair solid wing. */
function eastBay(s: CitadelStamp, z: number, fy: number): void {
  // Don't project through the grand stair enclosure
  if (z + WIDTH > STAIR_Z0 - 2 && z < STAIR_Z1 + 2) return;
  const z1 = z + WIDTH - 1;
  s.fill(KX1 + 1, fy, z, KX1 + DEPTH, fy, z1, STONE);
  if (((z + fy) & 1) === 0) {
    s.fill(KX1 + 1, fy - 2, z, KX1 + 1, fy - 1, z, BRICK);
    s.fill(KX1 + 1, fy - 2, z1, KX1 + 1, fy - 1, z1, BRICK);
  }
  railLine(s, KX1 + DEPTH, z, KX1 + DEPTH, z1, fy + 1);
  railLine(s, KX1 + 1, z, KX1 + DEPTH, z, fy + 1);
  railLine(s, KX1 + 1, z1, KX1 + DEPTH, z1, fy + 1);
  s.fill(KX1, fy + 1, z + 1, KX1, fy + 3, z1 - 1, AIR);
  s.set(KX1 + 1, fy + 1, z + 2, LANTERN);
}

/**
 * Corner wrap balconies at the four keep corners for tower-like lookouts each few floors.
 */
function cornerBalcony(
  s: CitadelStamp,
  cx: number,
  cz: number,
  fy: number,
  outwardX: -1 | 1,
  outwardZ: -1 | 1,
): void {
  const x0 = outwardX < 0 ? cx - DEPTH : cx;
  const x1 = outwardX < 0 ? cx : cx + DEPTH;
  const z0 = outwardZ < 0 ? cz - DEPTH : cz;
  const z1 = outwardZ < 0 ? cz : cz + DEPTH;
  s.fill(x0, fy, z0, x1, fy, z1, PLANKS);
  // Perimeter rails (outer edges only)
  for (let x = x0; x <= x1; x++) {
    s.set(x, fy + 1, outwardZ < 0 ? z0 : z1, COBBLE_WALL);
  }
  for (let z = z0; z <= z1; z++) {
    s.set(outwardX < 0 ? x0 : x1, fy + 1, z, COBBLE_WALL);
  }
  s.set(cx + outwardX, fy + 1, cz + outwardZ, GLOWSTONE);
}

/**
 * Stamp balconies on all four keep faces for every interior storey above ground,
 * plus corner lookouts every other storey.
 */
export function buildKeepBalconies(s: CitadelStamp): void {
  for (const fy of INTERIOR_STACK) {
    if (fy === FLOOR.ground) continue; // Great Hall entrance stays clean

    // South (courtyard) — denser bays
    for (let x = KX0 + 4; x + WIDTH < KX1 - 4; x += STRIDE - 2) {
      // leave main entrance clear
      if (Math.abs(x + 2 - KCX) < 8) continue;
      southBay(s, x, fy);
    }

    // North
    for (let x = KX0 + 6; x + WIDTH < KX1 - 6; x += STRIDE) {
      northBay(s, x, fy);
    }

    // West
    for (let z = KZ0 + 8; z + WIDTH < KZ1 - 8; z += STRIDE) {
      westBay(s, z, fy);
    }

    // East (avoid grand-stair wing Z range)
    for (let z = KZ0 + 8; z + WIDTH < KZ1 - 8; z += STRIDE) {
      if (z + WIDTH > STAIR_Z0 - 2 && z < STAIR_Z1 + 2) continue;
      eastBay(s, z, fy);
    }

    // Corner lookouts every other floor for vertical rhythm
    const idx = INTERIOR_STACK.indexOf(fy);
    if (idx > 0 && idx % 2 === 0) {
      cornerBalcony(s, KX0, KZ0, fy, -1, -1);
      cornerBalcony(s, KX1, KZ0, fy, 1, -1);
      cornerBalcony(s, KX0, KZ1, fy, -1, 1);
      cornerBalcony(s, KX1, KZ1, fy, 1, 1);
    }
  }

  // Continuous mid-height parade balcony on south face (ceremonial band)
  const paradeY = FLOOR.throne;
  s.fill(KX0 + 8, paradeY, KZ0 - 2, KX1 - 8, paradeY, KZ0 - 1, STONE);
  for (let x = KX0 + 8; x <= KX1 - 8; x++) {
    s.set(x, paradeY + 1, KZ0 - 2, COBBLE_WALL);
  }
  // Multiple doors onto the parade balcony
  for (let x = KX0 + 12; x < KX1 - 12; x += 12) {
    if (Math.abs(x - KCX) < 6) continue;
    s.fill(x, paradeY + 1, KZ0, x + 2, paradeY + 3, KZ0, AIR);
  }
}
