import {
  AIR,
  LIMESTONE,
  CARVED_LIMESTONE,
  SLATE,
  SLATE_SLAB,
  STAIRS_SLATE,
  CYAN_GLASS,
  GOLD_TRIM,
  LANTERN,
  GLOWSTONE,
  PLANKS,
  STONE,
  DEEPSLATE,
  OAK_FENCE,
  COBBLE_WALL,
  STAIRS_STONE,
  WATER,
} from '../blocks/blocks';
import { packState, FACING } from '../world/VoxelState';
import { CitadelStamp, spiralStair } from './CitadelStamp';
import type { BlockId } from '../core/types';

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
  const facing = dir > 0 ? FACING.N : FACING.S;
  for (let i = 0; i < steps; i++) {
    const y = yStart + i;
    const z = zStart + i * dir;
    for (let x = x0; x <= x1; x++) {
      s.fill(x, y, z, x, y + 3, z, AIR);
      setStair(s, x, y, z, facing, block);
    }
  }
}

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
  const facing = dir > 0 ? FACING.W : FACING.E;
  for (let i = 0; i < steps; i++) {
    const y = yStart + i;
    const x = xStart + i * dir;
    for (let z = z0; z <= z1; z++) {
      s.fill(x, y, z, x, y + 3, z, AIR);
      setStair(s, x, y, z, facing, block);
    }
  }
}

/** Switchback grand stair between floors. */
export function switchbackStair(
  s: CitadelStamp,
  wellX0: number,
  wellX1: number,
  wellZ0: number,
  wellZ1: number,
  yBottom: number,
  yTop: number,
  width = 5,
  step: BlockId = STAIRS_STONE,
  wall: BlockId = LIMESTONE,
): void {
  const rise = yTop - yBottom;
  if (rise <= 0) return;
  s.walls(wellX0, yBottom, wellZ0, wellX1, yTop, wellZ1, wall);
  s.fill(wellX0 + 1, yBottom, wellZ0 + 1, wellX1 - 1, yTop - 1, wellZ1 - 1, AIR);

  const midX = Math.floor((wellX0 + wellX1) / 2);
  const interiorWidth = wellX1 - wellX0 - 1;
  const laneWidth = Math.min(Math.max(2, width - 1), Math.floor((interiorWidth - 1) / 2));
  const westX0 = wellX0 + 1;
  const westX1 = westX0 + laneWidth - 1;
  const eastX1 = wellX1 - 1;
  const eastX0 = eastX1 - laneWidth + 1;
  const flightRise = 10;
  const southLanding = wellZ0 + 1;
  const positiveStart = southLanding + 1;
  const northLanding = positiveStart + flightRise + 2;
  const negativeStart = northLanding - 1;
  if (northLanding > wellZ1 - 1) {
    spiralStair(s, midX, Math.floor((wellZ0 + wellZ1) / 2), yBottom, yTop, STONE, wall);
    return;
  }
  // Bottom-floor approach from the west-side door into the first northbound flight.
  s.fill(wellX0 + 1, yBottom, southLanding, wellX1 - 1, yBottom, southLanding, PLANKS);
  let y = yBottom;
  let goingPosZ = true;
  while (y < yTop) {
    const remaining = yTop - y;
    const steps = Math.min(flightRise, remaining);
    if (goingPosZ) {
      stairFlightZ(s, westX0, westX1, positiveStart, y, steps, 1, step);
      const landY = y + steps;
      stairFlightZ(s, westX0, westX1, positiveStart + steps, landY - 1, 1, 1, step);
      stairFlightZ(s, westX0, westX1, positiveStart + steps + 1, landY, 1, 1, step);
      s.fill(wellX0 + 1, landY, northLanding, wellX1 - 1, landY, northLanding, PLANKS);
    } else {
      stairFlightZ(s, eastX0, eastX1, negativeStart, y, steps, -1, step);
      const landY = y + steps;
      stairFlightZ(s, eastX0, eastX1, negativeStart - steps, landY - 1, 1, -1, step);
      stairFlightZ(s, eastX0, eastX1, negativeStart - steps - 1, landY, 1, -1, step);
      s.fill(wellX0 + 1, landY, southLanding, wellX1 - 1, landY, southLanding, PLANKS);
    }
    y += steps;
    goingPosZ = !goingPosZ;
  }
  for (let fy = yBottom; fy <= yTop; fy += flightRise) {
    s.fill(wellX0, fy + 1, southLanding, wellX0, fy + 4, northLanding, AIR);
  }
}

/** Tall narrow gothic window bay on a wall face. */
export function pointedWindow(
  s: CitadelStamp,
  x: number,
  y0: number,
  z: number,
  h: number,
  axis: 'x' | 'z',
  glass: BlockId = CYAN_GLASS,
  frame: BlockId = CARVED_LIMESTONE,
): void {
  for (let i = 0; i < h; i++) {
    const y = y0 + i;
    if (axis === 'x') {
      s.set(x, y, z, i === h - 1 ? frame : glass);
      s.set(x, y, z - 1, frame);
      s.set(x, y, z + 1, frame);
    } else {
      s.set(x, y, z, i === h - 1 ? frame : glass);
      s.set(x - 1, y, z, frame);
      s.set(x + 1, y, z, frame);
    }
  }
  // Pointed tip
  if (axis === 'x') s.set(x, y0 + h, z, frame);
  else s.set(x, y0 + h, z, frame);
}

/** Buttress column against a wall. */
export function buttress(
  s: CitadelStamp,
  x: number,
  z: number,
  y0: number,
  y1: number,
  dx: number,
  dz: number,
  body: BlockId = LIMESTONE,
  cap: BlockId = CARVED_LIMESTONE,
): void {
  s.fill(x, y0, z, x + dx, y1, z + dz, body);
  s.fill(x, y1, z, x + dx, y1, z + dz, cap);
}

/** Simple flying-buttress arc (stepped diagonal). */
export function flyingButtress(
  s: CitadelStamp,
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  yTop: number,
  yBot: number,
  block: BlockId = LIMESTONE,
): void {
  const steps = Math.max(Math.abs(x1 - x0), Math.abs(z1 - z0), yTop - yBot);
  for (let i = 0; i <= steps; i++) {
    const t = i / Math.max(1, steps);
    const x = Math.round(x0 + (x1 - x0) * t);
    const z = Math.round(z0 + (z1 - z0) * t);
    const y = Math.round(yTop + (yBot - yTop) * t);
    s.fill(x, y, z, x, y + 2, z, block);
  }
}

/** Hollow tower shell with optional octagonal setback. */
export function hollowTower(
  s: CitadelStamp,
  cx: number,
  cz: number,
  half: number,
  y0: number,
  y1: number,
  wall: BlockId = LIMESTONE,
  octagon = false,
): void {
  for (let y = y0; y <= y1; y++) {
    for (let dz = -half; dz <= half; dz++) {
      for (let dx = -half; dx <= half; dx++) {
        const onShell =
          Math.abs(dx) === half ||
          Math.abs(dz) === half ||
          (octagon && Math.abs(dx) + Math.abs(dz) === half + Math.floor(half * 0.4));
        if (!onShell) continue;
        if (octagon && Math.abs(dx) + Math.abs(dz) > half + Math.floor(half * 0.55)) continue;
        s.set(cx + dx, y, cz + dz, wall);
      }
    }
  }
  // Hollow interior
  if (half > 2) {
    s.fill(cx - half + 1, y0, cz - half + 1, cx + half - 1, y1 - 1, cz + half - 1, AIR);
  }
}

/** Steep pyramidal / conical slate roof. */
export function steepRoof(
  s: CitadelStamp,
  cx: number,
  cz: number,
  half: number,
  yBase: number,
  roof: BlockId = SLATE,
): number {
  let h = half;
  let y = yBase;
  while (h >= 0) {
    for (let dz = -h; dz <= h; dz++) {
      for (let dx = -h; dx <= h; dx++) {
        if (Math.abs(dx) === h || Math.abs(dz) === h || h === 0) {
          s.set(cx + dx, y, cz + dz, roof);
        }
      }
    }
    h--;
    y++;
  }
  s.set(cx, y, cz, CARVED_LIMESTONE); // pinnacle
  return y;
}

/** Steep gabled roof along Z (nave). */
export function gableRoofZ(
  s: CitadelStamp,
  x0: number,
  x1: number,
  z0: number,
  z1: number,
  yBase: number,
  roof: BlockId = SLATE,
): void {
  const mid = Math.floor((x0 + x1) / 2);
  const half = Math.floor((x1 - x0) / 2);
  for (let h = 0; h <= half; h++) {
    const y = yBase + h;
    const left = mid - (half - h);
    const right = mid + (half - h);
    for (let z = z0; z <= z1; z++) {
      s.set(left, y, z, roof);
      s.set(right, y, z, roof);
      if (h === half) s.set(mid, y, z, roof);
    }
  }
  // Ridge trim
  for (let z = z0; z <= z1; z += 4) {
    s.set(mid, yBase + half + 1, z, CARVED_LIMESTONE);
  }
}

/** Battlement merlons along a wall walk. */
export function battlements(
  s: CitadelStamp,
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  y: number,
  block: BlockId = LIMESTONE,
): void {
  for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) {
    for (const z of [z0, z1]) {
      if (((x + z) & 1) === 0) s.set(x, y, z, block);
    }
  }
  for (let z = Math.min(z0, z1); z <= Math.max(z0, z1); z++) {
    for (const x of [x0, x1]) {
      if (((x + z) & 1) === 0) s.set(x, y, z, block);
    }
  }
}

/** Arched gate opening (clears a tall arch shape). */
export function archedGate(
  s: CitadelStamp,
  x0: number,
  x1: number,
  z: number,
  y0: number,
  height: number,
  depth: number,
): void {
  const mid = Math.floor((x0 + x1) / 2);
  const half = Math.floor((x1 - x0) / 2);
  for (let d = 0; d < depth; d++) {
    for (let dx = -half; dx <= half; dx++) {
      for (let dy = 0; dy < height; dy++) {
        // Rectangular lower + semicircle upper
        const archY = height - 3;
        if (dy < archY || Math.abs(dx) <= half - (dy - archY)) {
          s.fill(mid + dx, y0 + dy, z + d, mid + dx, y0 + dy, z + d, AIR);
        }
      }
    }
  }
}

/** Balcony ring around a tower. */
export function balconyRing(
  s: CitadelStamp,
  cx: number,
  cz: number,
  half: number,
  y: number,
  floor: BlockId = LIMESTONE,
  rail: BlockId = OAK_FENCE,
): void {
  const h = half + 2;
  for (let dz = -h; dz <= h; dz++) {
    for (let dx = -h; dx <= h; dx++) {
      const manh = Math.max(Math.abs(dx), Math.abs(dz));
      if (manh < half || manh > h) continue;
      s.set(cx + dx, y, cz + dz, floor);
      if (manh === h) s.set(cx + dx, y + 1, cz + dz, rail);
    }
  }
}

/** Sky bridge between two points at constant y. */
export function skyBridge(
  s: CitadelStamp,
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  y: number,
  width = 3,
  floor: BlockId = LIMESTONE,
  rail: BlockId = OAK_FENCE,
): void {
  const steps = Math.max(Math.abs(x1 - x0), Math.abs(z1 - z0));
  for (let i = 0; i <= steps; i++) {
    const t = i / Math.max(1, steps);
    const x = Math.round(x0 + (x1 - x0) * t);
    const z = Math.round(z0 + (z1 - z0) * t);
    for (let w = -Math.floor(width / 2); w <= Math.floor(width / 2); w++) {
      // Prefer Z-span bridges with width in X, else X-span with width in Z
      if (Math.abs(x1 - x0) >= Math.abs(z1 - z0)) {
        s.set(x, y, z + w, floor);
        s.fill(x, y + 1, z + w, x, y + 3, z + w, AIR);
        if (Math.abs(w) === Math.floor(width / 2)) s.set(x, y + 1, z + w, rail);
      } else {
        s.set(x + w, y, z, floor);
        s.fill(x + w, y + 1, z, x + w, y + 3, z, AIR);
        if (Math.abs(w) === Math.floor(width / 2)) s.set(x + w, y + 1, z, rail);
      }
    }
  }
}

/** Simple fountain disk + center jet. */
export function fountain(s: CitadelStamp, cx: number, cz: number, y: number, r = 4): void {
  for (let dz = -r; dz <= r; dz++) {
    for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dz * dz <= r * r) {
        s.set(cx + dx, y, cz + dz, CARVED_LIMESTONE);
        if (dx * dx + dz * dz <= (r - 1) * (r - 1)) {
          s.set(cx + dx, y + 1, cz + dz, WATER);
          s.set(cx + dx, y, cz + dz, STONE);
        }
      }
    }
  }
  s.fill(cx - 1, y + 1, cz - 1, cx + 1, y + 3, cz + 1, CARVED_LIMESTONE);
  s.set(cx, y + 4, cz, GLOWSTONE);
}

/** Pinnacle spike. */
export function pinnacle(s: CitadelStamp, x: number, y: number, z: number, h = 6): void {
  for (let i = 0; i < h; i++) {
    s.set(x, y + i, z, i < h - 2 ? SLATE : CARVED_LIMESTONE);
  }
  s.set(x, y + h, z, GOLD_TRIM);
}

export {
  spiralStair,
  LIMESTONE,
  CARVED_LIMESTONE,
  SLATE,
  SLATE_SLAB,
  STAIRS_SLATE,
  CYAN_GLASS,
  GOLD_TRIM,
  LANTERN,
  GLOWSTONE,
  PLANKS,
  DEEPSLATE,
  COBBLE_WALL,
  AIR,
  STONE,
};
