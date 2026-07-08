/**
 * Caldera Gate District — Milestone 2 densification of the north-shore settlement.
 * Architecture language: deepslate massing, brick/terracotta trim, stone paving, glow accents.
 */
import {
  AIR,
  STONE,
  COBBLESTONE,
  DEEPSLATE,
  BRICK,
  TERRACOTTA,
  PLANKS,
  WOOD,
  GLASS,
  GRAVEL,
  LANTERN,
  GLOWSTONE,
  CRYSTAL,
  BOOKSHELF,
  FURNACE,
  STAIRS_STONE,
  STAIRS_BRICK,
  STAIRS_COBBLE,
  STAIRS_PLANK,
  COBBLE_WALL,
  OAK_FENCE,
  PLANK_SLAB,
} from '../blocks/blocks';
import { packState, FACING } from '../world/VoxelState';
import { CitadelStamp, hash2 } from './CitadelStamp';
import { ASHEN, ashenSurfaceAt } from './AshenReachGenerator';
import { well, marketStall, lampPost } from './prefabs';
import type { Prefab } from '../core/Prefab';
import type { BlockId, WorldSeed } from '../core/types';

const VY = ASHEN.village.benchY;

function stampPrefab(s: CitadelStamp, p: Prefab, ox: number, oy: number, oz: number): void {
  for (const b of p.blocks) {
    const id = b[3];
    if (id === AIR) continue;
    s.set(ox + b[0], oy + b[1], oz + b[2], id, b.length === 5 ? b[4] : 0);
  }
}

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
      s.fill(lx0, y, lz0, lx1, y, lz1, cube);
      break;
    }
    for (let x = lx0 + 1; x <= lx1 - 1; x++) {
      s.set(x, y, lz0, stair, packState(FACING.N, 0));
      s.set(x, y, lz1, stair, packState(FACING.S, 0));
    }
    for (let z = lz0 + 1; z <= lz1 - 1; z++) {
      s.set(lx0, y, z, stair, packState(FACING.W, 0));
      s.set(lx1, y, z, stair, packState(FACING.E, 0));
    }
    s.set(lx0, y, lz0, cube);
    s.set(lx1, y, lz0, cube);
    s.set(lx0, y, lz1, cube);
    s.set(lx1, y, lz1, cube);
  }
}

type Facing4 = 'N' | 'E' | 'S' | 'W';

function civicBuilding(
  s: CitadelStamp,
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  floorY: number,
  wall: BlockId,
  roofStair: BlockId,
  roofCube: BlockId,
  height: number,
  door: Facing4,
  storey2 = false,
): void {
  const top = floorY + height;
  const peak = top + Math.ceil((Math.max(x1 - x0, z1 - z0) + 3) / 2);
  s.fill(x0 - 1, floorY, z0 - 1, x1 + 1, peak + 1, z1 + 1, AIR);
  s.fill(x0, floorY - 1, z0, x1, floorY - 14, z1, DEEPSLATE);
  s.slab(x0, z0, x1, z1, floorY, PLANKS);
  s.walls(x0, floorY + 1, z0, x1, top, z1, wall);
  for (const [px, pz] of [
    [x0, z0],
    [x1, z0],
    [x0, z1],
    [x1, z1],
  ] as const) {
    s.fill(px, floorY + 1, pz, px, top, pz, WOOD);
  }
  // Narrow vertical windows (architectural language).
  const wy = floorY + 2;
  for (let x = x0 + 2; x <= x1 - 2; x += 2) {
    s.set(x, wy, z0, GLASS);
    s.set(x, wy + 1, z0, GLASS);
    s.set(x, wy, z1, GLASS);
    s.set(x, wy + 1, z1, GLASS);
  }
  for (let z = z0 + 2; z <= z1 - 2; z += 2) {
    s.set(x0, wy, z, GLASS);
    s.set(x1, wy, z, GLASS);
  }
  const mx = (x0 + x1) >> 1;
  const mz = (z0 + z1) >> 1;
  if (door === 'N') s.fill(mx, floorY + 1, z0, mx, floorY + 3, z0, AIR);
  else if (door === 'S') s.fill(mx, floorY + 1, z1, mx, floorY + 3, z1, AIR);
  else if (door === 'W') s.fill(x0, floorY + 1, mz, x0, floorY + 3, mz, AIR);
  else s.fill(x1, floorY + 1, mz, x1, floorY + 3, mz, AIR);

  // Interior.
  s.set(x0 + 1, floorY + 1, z0 + 1, BOOKSHELF);
  s.set(x0 + 1, floorY + 2, z0 + 1, BOOKSHELF);
  s.set(x1 - 1, floorY + 1, z1 - 1, FURNACE);
  s.set((x0 + x1) >> 1, floorY + 1, (z0 + z1) >> 1, OAK_FENCE);
  s.set((x0 + x1) >> 1, floorY + 2, (z0 + z1) >> 1, PLANK_SLAB);
  s.set(x1 - 1, top - 1, z0 + 1, LANTERN);

  if (storey2) {
    s.slab(x0 + 1, z0 + 1, x1 - 1, z1 - 1, floorY + 4, PLANKS);
    s.fill(mx, floorY + 1, mz, mx, floorY + 4, mz, AIR);
    s.set(mx, floorY + 1, mz, STAIRS_PLANK, packState(FACING.N, 0));
    s.set(mx, floorY + 2, mz, STAIRS_PLANK, packState(FACING.N, 0));
    s.set(mx, floorY + 3, mz, STAIRS_PLANK, packState(FACING.N, 0));
    s.set(x0 + 2, floorY + 5, z0 + 2, LANTERN);
  }

  hipRoof(s, x0 - 1, z0 - 1, x1 + 1, z1 + 1, top, roofStair, roofCube);
  // Roof access hatch + lantern for rooftop lookout.
  s.set(mx, top + 1, mz, LANTERN);
}

/** Monumental Crater Gate at the end of the arrival pass. */
export function buildCraterGate(s: CitadelStamp): void {
  const z = ASHEN.arrival.passZ1 + 2; // ~-28
  const y = ASHEN.arrival.passY;
  // Twin towers.
  for (const x of [-2, 14]) {
    s.fill(x, y - 2, z - 2, x + 4, y + 14, z + 2, DEEPSLATE);
    s.fill(x + 1, y + 1, z - 1, x + 3, y + 12, z + 1, AIR);
    s.set(x + 2, y + 15, z, GLOWSTONE);
    s.set(x + 2, y + 16, z, CRYSTAL);
    // Arrow slits.
    s.set(x + 2, y + 6, z - 2, GLASS);
    s.set(x + 2, y + 6, z + 2, GLASS);
  }
  // Arch spanning the pass.
  s.fill(-2, y + 10, z - 1, 18, y + 13, z + 1, BRICK);
  s.fill(2, y, z - 1, 14, y + 9, z + 1, AIR);
  // Gate threshold paving.
  s.fill(2, y - 1, z - 4, 14, y - 1, z + 4, STONE);
  for (let x = 2; x <= 14; x++) {
    for (let zz = z - 3; zz <= z + 3; zz++) {
      s.set(x, y, zz, (x + zz) % 2 === 0 ? COBBLESTONE : STONE);
    }
  }
  // Ember braziers.
  s.set(3, y + 1, z + 3, GLOWSTONE);
  s.set(13, y + 1, z + 3, GLOWSTONE);
  s.set(3, y + 2, z + 3, CRYSTAL);
  s.set(13, y + 2, z + 3, CRYSTAL);
}

/** Dense Caldera Gate District: streets, alleys, terraces, civic buildings. */
export function buildGateDistrict(s: CitadelStamp, seed: WorldSeed): void {
  // Main ceremonial avenue paving (x≈4..12, z from gate to plaza).
  for (let z = -26; z <= 22; z++) {
    for (let x = 4; x <= 12; x++) {
      const h = ashenSurfaceAt(seed, x, z);
      // Prefer fixed district height inside village.
      const deck = z >= -12 ? VY : Math.max(h, ASHEN.arrival.passY);
      s.set(x, deck, z, hash2(x, z, 0xa11e) < 0.2 ? BRICK : COBBLESTONE);
      s.fill(x, deck + 1, z, x, deck + 3, z, AIR);
    }
    // Avenue side lanterns.
    if (z % 5 === 0) {
      s.set(3, VY + 1, z, COBBLE_WALL);
      s.set(3, VY + 2, z, LANTERN);
      s.set(13, VY + 1, z, COBBLE_WALL);
      s.set(13, VY + 2, z, LANTERN);
    }
  }

  // Central plaza expansion.
  for (let z = -8; z <= 16; z++) {
    for (let x = -12; x <= 28; x++) {
      const r = hash2(x, z, 0xba2a);
      s.set(x, VY, z, r < 0.15 ? BRICK : r < 0.28 ? TERRACOTTA : r < 0.35 ? STONE : COBBLESTONE);
      s.set(x, VY - 1, z, DEEPSLATE);
    }
  }

  // Secondary street west (alley).
  for (let z = -10; z <= 18; z++) {
    for (let x = -16; x <= -12; x++) {
      s.set(x, VY, z, GRAVEL);
      s.fill(x, VY + 1, z, x, VY + 3, z, AIR);
    }
  }
  // Secondary street east.
  for (let z = -10; z <= 18; z++) {
    for (let x = 26; x <= 30; x++) {
      s.set(x, VY, z, GRAVEL);
      s.fill(x, VY + 1, z, x, VY + 3, z, AIR);
    }
  }

  // Cross street.
  for (let x = -16; x <= 30; x++) {
    s.set(x, VY, 8, STONE);
    s.fill(x, VY + 1, 8, x, VY + 3, 8, AIR);
  }

  // Civic buildings — varied footprints and heights.
  civicBuilding(s, -10, -22, -4, -14, VY, DEEPSLATE, STAIRS_STONE, DEEPSLATE, 5, 'S', true);
  civicBuilding(s, 16, -24, 24, -16, VY, BRICK, STAIRS_BRICK, BRICK, 4, 'S', false);
  civicBuilding(s, -20, -6, -14, 2, VY, TERRACOTTA, STAIRS_BRICK, BRICK, 5, 'E', true);
  civicBuilding(s, -20, 6, -14, 14, VY, COBBLESTONE, STAIRS_COBBLE, STONE, 4, 'E', false);
  civicBuilding(s, 28, -8, 36, 0, VY, DEEPSLATE, STAIRS_STONE, DEEPSLATE, 6, 'W', true);
  civicBuilding(s, 28, 4, 36, 12, VY, BRICK, STAIRS_BRICK, BRICK, 4, 'W', false);
  civicBuilding(s, -10, 18, -2, 26, VY, PLANKS, STAIRS_PLANK, PLANKS, 4, 'N', false);
  civicBuilding(s, 16, 18, 24, 26, VY, TERRACOTTA, STAIRS_BRICK, BRICK, 5, 'N', true);
  // Guild hall (larger) on west terrace edge.
  civicBuilding(s, -28, 0, -20, 10, VY, DEEPSLATE, STAIRS_STONE, DEEPSLATE, 7, 'E', true);

  // Market row + well.
  stampPrefab(s, well(), 6, VY + 1, 2);
  stampPrefab(s, marketStall(), 16, VY + 1, -4);
  stampPrefab(s, marketStall(), -2, VY + 1, 12);
  stampPrefab(s, marketStall(), 18, VY + 1, 10);
  for (const [lx, lz] of [
    [-10, -6],
    [24, -6],
    [-10, 14],
    [24, 14],
    [6, -10],
  ] as const) {
    stampPrefab(s, lampPost(), lx, VY + 1, lz);
  }

  // Elevated terrace with stairs (uses crater slope feel on west).
  for (let z = -4; z <= 8; z++) {
    for (let x = -32; x <= -28; x++) {
      s.set(x, VY + 3, z, STONE);
      s.fill(x, VY + 4, z, x, VY + 6, z, AIR);
    }
  }
  for (let i = 0; i < 4; i++) {
    s.set(-27 + i, VY + i, 2, STAIRS_STONE, packState(FACING.E, 0));
  }
  // Retaining wall along terrace.
  for (let z = -4; z <= 8; z++) {
    s.fill(-28, VY + 1, z, -28, VY + 3, z, DEEPSLATE);
  }

  // Workshop row with furnaces (industry identity).
  s.fill(20, VY + 1, 14, 26, VY + 1, 18, COBBLESTONE);
  for (const [fx, fz] of [
    [21, 15],
    [23, 15],
    [25, 15],
    [21, 17],
    [23, 17],
  ] as const) {
    s.set(fx, VY + 1, fz, FURNACE);
  }
  for (const [px, pz] of [
    [20, 14],
    [26, 14],
    [20, 18],
    [26, 18],
  ] as const) {
    s.fill(px, VY + 2, pz, px, VY + 4, pz, WOOD);
  }
  s.slab(19, 13, 27, 19, VY + 5, PLANK_SLAB);
  s.set(23, VY + 4, 16, LANTERN);

  // Framed vista colonnade looking south toward tower (player-height composition).
  for (let x = 4; x <= 12; x += 2) {
    s.fill(x, VY + 1, 18, x, VY + 4, 18, STONE);
  }
  s.fill(4, VY + 4, 18, 12, VY + 4, 18, STONE);
  s.set(4, VY + 5, 18, LANTERN);
  s.set(12, VY + 5, 18, LANTERN);
}

/** Arrival tunnel lining inside the pass (roof + walls for enclosed first moments). */
export function buildArrivalTunnel(s: CitadelStamp): void {
  const A = ASHEN.arrival;
  for (let z = A.passZ0; z <= A.passZ1; z++) {
    for (let x = A.spawnX - A.passHalfW; x <= A.spawnX + A.passHalfW; x++) {
      // Floor + clear walk.
      s.set(x, A.passY, z, STONE);
      s.fill(x, A.passY + 1, z, x, A.passY + 4, z, AIR);
      // Roof slab.
      s.set(x, A.passY + 5, z, DEEPSLATE);
    }
    // Side walls.
    s.fill(A.spawnX - A.passHalfW - 1, A.passY, z, A.spawnX - A.passHalfW - 1, A.passY + 5, z, DEEPSLATE);
    s.fill(A.spawnX + A.passHalfW + 1, A.passY, z, A.spawnX + A.passHalfW + 1, A.passY + 5, z, DEEPSLATE);
    if (z % 4 === 0) {
      s.set(A.spawnX - A.passHalfW, A.passY + 3, z, LANTERN);
      s.set(A.spawnX + A.passHalfW, A.passY + 3, z, LANTERN);
    }
  }
  // Light at tunnel mouth (hint of outside).
  s.set(A.spawnX, A.passY + 4, A.passZ1, GLOWSTONE);
}
