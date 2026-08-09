/** Reusable, orientation-aware architecture primitives for Kingshollow structures. */
import {
  AIR,
  AGED_MASONRY,
  CLAY_ROOF,
  CLAY_ROOF_SLAB,
  COBBLESTONE,
  GLASS,
  LANTERN,
  MOSSY_COBBLE,
  OAK_DOOR,
  PLANKS,
  SLATE,
  SLATE_SLAB,
  STAIRS_PLANK,
  STAIRS_CLAY_ROOF,
  STAIRS_SLATE,
  TORCH,
  WARM_MASONRY,
  WOOD,
} from '../blocks/blocks';
import { stairFacingCode, stairState, type StairFacing } from '../app/stairFacing';
import { CitadelStamp, hash2 } from './CitadelStamp';
import type { BlockId } from '../core/types';

export type HouseFacing = StairFacing;

export interface HousePalette {
  wall: BlockId;
  base: BlockId;
  timber: BlockId;
  roofStair: BlockId;
  roofSlab: BlockId;
  roofAccent: BlockId;
}

export const KINGSHOLLOW_HOUSE_PALETTES = {
  clay: {
    wall: WARM_MASONRY,
    base: MOSSY_COBBLE,
    timber: WOOD,
    roofStair: STAIRS_CLAY_ROOF,
    roofSlab: CLAY_ROOF_SLAB,
    roofAccent: CLAY_ROOF,
  },
  slate: {
    wall: AGED_MASONRY,
    base: COBBLESTONE,
    timber: WOOD,
    roofStair: STAIRS_SLATE,
    roofSlab: SLATE_SLAB,
    roofAccent: SLATE,
  },
} as const satisfies Record<string, HousePalette>;

export interface TimberHouseSpec {
  x: number;
  z: number;
  width: number;
  depth: number;
  floorY: number;
  facing: HouseFacing;
  palette: HousePalette;
  stories?: 1 | 2;
  porch?: boolean;
  chimney?: boolean;
  /** Stable salt controlling beam/window variation without changing the footprint. */
  variant?: number;
}

function outward(facing: HouseFacing): readonly [number, number] {
  switch (facing) {
    case 'n':
      return [0, -1];
    case 's':
      return [0, 1];
    case 'e':
      return [1, 0];
    case 'w':
      return [-1, 0];
  }
}

/** Clear trees and terrain from a padded construction envelope before the building is stamped. */
export function clearBuildingLot(
  s: CitadelStamp,
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  floorY: number,
  height: number,
  margin = 2,
): void {
  s.fill(x0 - margin, floorY + 1, z0 - margin, x1 + margin, floorY + height, z1 + margin, AIR);
}

/** Hollow stair roof with true eaves, orientation, gable infill, ridge slabs, and a chimney. */
export function pitchedRoof(
  s: CitadelStamp,
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  wallTop: number,
  palette: HousePalette,
  chimney = true,
): void {
  const alongX = x1 - x0 >= z1 - z0;
  const span = alongX ? z1 - z0 + 1 : x1 - x0 + 1;
  // Include both one-block eaves when finding the ridge so even-width buildings close cleanly.
  const layers = Math.max(2, Math.ceil((span + 2) / 2));
  for (let r = 0; r < layers; r++) {
    const y = wallTop + 1 + r;
    if (alongX) {
      const north = z0 - 1 + r,
        south = z1 + 1 - r;
      for (let x = x0 - 1; x <= x1 + 1; x++) {
        s.set(x, y, north, palette.roofStair, stairState('n'));
        if (south !== north) s.set(x, y, south, palette.roofStair, stairState('s'));
      }
      if (r > 0 && north <= south) {
        s.fill(x0, y, north + 1, x0, y, south - 1, palette.wall);
        s.fill(x1, y, north + 1, x1, y, south - 1, palette.wall);
        s.set(x0, y, (north + south) >> 1, palette.timber);
        s.set(x1, y, (north + south) >> 1, palette.timber);
      }
      if (south - north <= 1) s.fill(x0 - 1, y + 1, north, x1 + 1, y + 1, south, palette.roofSlab);
    } else {
      const west = x0 - 1 + r,
        east = x1 + 1 - r;
      for (let z = z0 - 1; z <= z1 + 1; z++) {
        s.set(west, y, z, palette.roofStair, stairState('w'));
        if (east !== west) s.set(east, y, z, palette.roofStair, stairState('e'));
      }
      if (r > 0 && west <= east) {
        s.fill(west + 1, y, z0, east - 1, y, z0, palette.wall);
        s.fill(west + 1, y, z1, east - 1, y, z1, palette.wall);
        s.set((west + east) >> 1, y, z0, palette.timber);
        s.set((west + east) >> 1, y, z1, palette.timber);
      }
      if (east - west <= 1) s.fill(west, y + 1, z0 - 1, east, y + 1, z1 + 1, palette.roofSlab);
    }
  }
  if (chimney) {
    const cx = alongX ? x1 - 2 : x1 - 1;
    const cz = alongX ? z1 - 1 : z1 - 2;
    s.fill(cx, wallTop, cz, cx, wallTop + layers + 3, cz, palette.base);
    s.set(cx, wallTop + layers + 4, cz, TORCH);
  }
}

function doorAndPorch(s: CitadelStamp, spec: TimberHouseSpec, x1: number, z1: number): void {
  const { x: x0, z: z0, floorY: y, facing } = spec;
  const mx = (x0 + x1) >> 1,
    mz = (z0 + z1) >> 1;
  const [dx, dz] = outward(facing);
  const doorX = facing === 'e' ? x1 : facing === 'w' ? x0 : mx;
  const doorZ = facing === 's' ? z1 : facing === 'n' ? z0 : mz;
  s.set(doorX, y + 1, doorZ, OAK_DOOR, stairFacingCode(facing));
  s.set(doorX, y + 2, doorZ, AIR);
  if (!spec.porch) return;
  const px = doorX + dx,
    pz = doorZ + dz;
  s.set(px, y, pz, spec.palette.base);
  s.set(px + dx, y, pz + dz, STAIRS_PLANK, stairState(facing));
  for (const side of [-1, 1]) {
    const sx = px + (dz !== 0 ? side * 2 : 0),
      sz = pz + (dx !== 0 ? side * 2 : 0);
    s.fill(sx, y + 1, sz, sx, y + 3, sz, spec.palette.timber);
  }
  if (dz !== 0) s.fill(px - 2, y + 4, pz, px + 2, y + 4, pz, spec.palette.roofAccent);
  else s.fill(px, y + 4, pz - 2, px, y + 4, pz + 2, spec.palette.roofAccent);
}

function windowsAndBeams(
  s: CitadelStamp,
  spec: TimberHouseSpec,
  x1: number,
  z1: number,
  wallTop: number,
): void {
  const { x: x0, z: z0, floorY: y, palette, variant = 0 } = spec;
  for (const x of [x0, x1])
    for (const z of [z0, z1]) s.fill(x, y + 1, z, x, wallTop, z, palette.timber);
  for (let level = y + 4; level <= wallTop; level += 4) {
    s.fill(x0, level, z0, x1, level, z0, palette.timber);
    s.fill(x0, level, z1, x1, level, z1, palette.timber);
    s.fill(x0, level, z0, x0, level, z1, palette.timber);
    s.fill(x1, level, z0, x1, level, z1, palette.timber);
  }
  const xs = [x0 + 2, x1 - 2],
    zs = [z0 + 2, z1 - 2];
  for (let story = 0; story < (spec.stories ?? 1); story++) {
    const wy = y + 2 + story * 4;
    for (const x of xs) {
      if (hash2(x, z0, variant + story) > 0.15) s.set(x, wy, z0, GLASS);
      if (hash2(x, z1, variant + story + 3) > 0.15) s.set(x, wy, z1, GLASS);
    }
    for (const z of zs) {
      s.set(x0, wy, z, GLASS);
      s.set(x1, wy, z, GLASS);
    }
  }
}

/** Build a complete, hollow, furnished timber house with a terrain-safe lot and readable silhouette. */
export function buildTimberHouse(s: CitadelStamp, spec: TimberHouseSpec): void {
  const x0 = spec.x,
    z0 = spec.z,
    x1 = x0 + spec.width - 1,
    z1 = z0 + spec.depth - 1;
  const stories = spec.stories ?? 1,
    wallTop = spec.floorY + stories * 4 + 1;
  clearBuildingLot(s, x0, z0, x1, z1, spec.floorY, wallTop - spec.floorY + 10);
  s.fill(x0, spec.floorY - 4, z0, x1, spec.floorY, z1, spec.palette.base);
  s.walls(x0, spec.floorY + 1, z0, x1, wallTop, z1, spec.palette.wall);
  s.fill(x0 + 1, spec.floorY + 1, z0 + 1, x1 - 1, wallTop - 1, z1 - 1, AIR);
  for (let story = 1; story < stories; story++)
    s.slab(x0 + 1, z0 + 1, x1 - 1, z1 - 1, spec.floorY + story * 4, PLANKS);
  windowsAndBeams(s, spec, x1, z1, wallTop);
  doorAndPorch(s, spec, x1, z1);
  pitchedRoof(s, x0, z0, x1, z1, wallTop, spec.palette, spec.chimney ?? true);
  const mx = (x0 + x1) >> 1,
    mz = (z0 + z1) >> 1;
  s.set(mx, spec.floorY + 2, mz, LANTERN);
  s.set(x0 + 2, spec.floorY + 1, z0 + 2, PLANKS);
}
