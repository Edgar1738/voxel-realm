import { CHUNK_SIZE_X, CHUNK_SIZE_Z, SEA_LEVEL, WORLD_HEIGHT } from '../core/constants';
import { mulberry32 } from '../core/math';
import {
  AIR,
  STONE,
  COBBLESTONE,
  SLATE,
  LIMESTONE,
  CARVED_LIMESTONE,
  GOLD_TRIM,
  GOLD_ORE,
  EMERALD_ORE,
  CRYSTAL,
  CYAN_GLASS,
  GLOWSTONE,
  LANTERN,
  WATER,
  MUD,
  FLOWER,
  TALL_GRASS,
  STONE_SLAB,
} from '../blocks/blocks';
import type { Overlay } from './Generator';
import type { Prefab } from '../core/Prefab';
import type { BlockId, WorldSeed } from '../core/types';

/**
 * The Fairy's Fountain — a hidden luminous sanctum buried under the terrain, reached through a
 * stone arch and a descending tunnel. Unlike surface prefabs, the blocks list includes explicit
 * AIR entries: the chamber and tunnel are carved out of whatever terrain surrounds them, while
 * unlisted voxels keep the world untouched. Stamp it with `scatterFairyFountains`, never with
 * `scatterStructures` (which skips AIR and would leave the chamber solid).
 */

// Layout constants shared by the builder and the scatter overlay.
const CX = 11; // chamber center (x)
const CZ = 11; // chamber center (z)
const R = 10; // chamber inner radius
const DOME_H = 13; // interior dome rise above the chamber floor
const FLOOR_Y = 1; // limestone floor layer; interior air starts at FLOOR_Y + 1
const DIM_X = 23;
const DIM_Y = 26;
const DIM_Z = 45;

/** Local y of the tunnel mouth floor; the stamp sets world(mouth floor) = surface. */
export const FOUNTAIN_DEPTH = 20;
/** Column the placement is anchored by: the tunnel mouth, so the arch seats on real ground. */
export const FOUNTAIN_MOUTH: readonly [number, number] = [11, 44];

/** Tunnel floor height per z row: flat at the chamber, then a 1:1 stair climb to the surface. */
function tunnelFloorY(z: number): number {
  return Math.min(FOUNTAIN_DEPTH, FLOOR_Y + 1 + Math.max(0, z - 22));
}

export function fairyFountain(): Prefab {
  // Keyed voxel map so later features overwrite earlier shell/air cleanly.
  const cells = new Map<number, BlockId>();
  const key = (x: number, y: number, z: number): number => x + DIM_X * (z + DIM_Z * y);
  const put = (x: number, y: number, z: number, id: BlockId): void => {
    if (x < 0 || y < 0 || z < 0 || x >= DIM_X || y >= DIM_Y || z >= DIM_Z) return;
    cells.set(key(x, y, z), id);
  };
  const r2 = (dx: number, dz: number): number => dx * dx + dz * dz;
  /** Highest interior air y of the dome above a floor offset (dx, dz). */
  const domeTop = (dx: number, dz: number): number =>
    FLOOR_Y + Math.floor(DOME_H * Math.sqrt(Math.max(0, 1 - r2(dx, dz) / (R * R))));
  // Cheap deterministic per-column hash for organic dressing (moss fringe, plants).
  const hash = (dx: number, dz: number): number =>
    Math.abs(Math.imul(dx * 31 + dz * 17, 2654435761)) >>> 8;

  // --- Chamber: base slab, limestone floor, ellipsoid air pocket wrapped in a slate shell ---
  for (let x = 0; x < DIM_X; x++) {
    for (let z = 0; z < 23; z++) {
      const dx = x - CX;
      const dz = z - CZ;
      const rr = r2(dx, dz);
      if (rr <= (R + 1) * (R + 1)) {
        put(x, 0, z, STONE);
        put(x, FLOOR_Y, z, LIMESTONE);
      }
      for (let y = FLOOR_Y + 1; y < DIM_Y; y++) {
        const dy = y - (FLOOR_Y + 1);
        const inner = rr / (R * R) + (dy / DOME_H) ** 2;
        const outer = rr / ((R + 2) * (R + 2)) + (dy / (DOME_H + 2)) ** 2;
        if (inner < 1) put(x, y, z, AIR);
        else if (outer < 1) put(x, y, z, SLATE);
      }
    }
  }

  // --- Fountain centerpiece: raised carved basin, glowing water, crystal-topped spire ---
  for (let dx = -5; dx <= 5; dx++) {
    for (let dz = -5; dz <= 5; dz++) {
      const rr = r2(dx, dz);
      const x = CX + dx;
      const z = CZ + dz;
      if (rr <= 3 * 3) {
        put(x, FLOOR_Y + 1, z, GLOWSTONE); // basin floor glows through the water
        put(x, FLOOR_Y + 2, z, WATER);
      } else if (rr <= 4.5 * 4.5) {
        put(x, FLOOR_Y + 1, z, CARVED_LIMESTONE);
        put(x, FLOOR_Y + 2, z, dx === 0 || dz === 0 ? GOLD_TRIM : CARVED_LIMESTONE);
      } else if (rr <= 5.5 * 5.5) {
        put(x, FLOOR_Y + 1, z, STONE_SLAB); // outer tier step
      }
    }
  }
  // Central spire rising out of the pool, crowned in crystal — the fairy's perch.
  for (let y = FLOOR_Y + 2; y <= FLOOR_Y + 4; y++) put(CX, y, CZ, CARVED_LIMESTONE);
  put(CX, FLOOR_Y + 5, CZ, GOLD_TRIM);
  put(CX, FLOOR_Y + 6, CZ, CRYSTAL);
  put(CX, FLOOR_Y + 7, CZ, CRYSTAL);
  put(CX + 1, FLOOR_Y + 6, CZ, CRYSTAL);
  put(CX - 1, FLOOR_Y + 6, CZ, CRYSTAL);
  put(CX, FLOOR_Y + 6, CZ + 1, CRYSTAL);
  put(CX, FLOOR_Y + 6, CZ - 1, CRYSTAL);

  // --- Ring of four carved pillars with lanterns, joined to the pool by glass light channels ---
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const px = CX + sx * 6;
      const pz = CZ + sz * 6;
      for (let y = FLOOR_Y + 1; y <= FLOOR_Y + 6; y++) put(px, y, pz, LIMESTONE);
      put(px, FLOOR_Y + 7, pz, SLATE); // capital, meeting the dome underside
      put(px - sx, FLOOR_Y + 4, pz - sz, LANTERN);
      for (let k = 2; k <= 5; k++) {
        put(CX + sx * k, 0, CZ + sz * k, GLOWSTONE);
        put(CX + sx * k, FLOOR_Y, CZ + sz * k, CYAN_GLASS); // glowing floor sigil
      }
    }
  }

  // --- Life fringe: mossy mud and plants clinging to the ring around the fountain ---
  for (let dx = -8; dx <= 8; dx++) {
    for (let dz = -8; dz <= 8; dz++) {
      const rr = r2(dx, dz);
      if (rr < 5.5 * 5.5 || rr > 7.5 * 7.5) continue;
      if (Math.abs(dx) === 6 && Math.abs(dz) === 6) continue; // pillar bases
      const x = CX + dx;
      const z = CZ + dz;
      const h = hash(dx, dz);
      if (h % 3 === 0) put(x, FLOOR_Y, z, MUD);
      if (h % 5 === 0) put(x, FLOOR_Y + 1, z, FLOWER);
      else if (h % 5 === 1) put(x, FLOOR_Y + 1, z, TALL_GRASS);
    }
  }

  // --- Crystal stalactites hanging from the dome, and ore glints set into the walls ---
  const drips: ReadonlyArray<[number, number]> = [
    [3, -2],
    [-4, 3],
    [1, 4],
    [-3, -4],
    [5, 1],
    [-5, -2],
    [2, 6],
    [-1, -6],
  ];
  drips.forEach(([dx, dz], i) => {
    const top = domeTop(dx, dz);
    put(CX + dx, top, CZ + dz, CRYSTAL);
    if (i % 2 === 0) put(CX + dx, top - 1, CZ + dz, CRYSTAL);
  });
  put(CX - R, FLOOR_Y + 3, CZ, GOLD_ORE);
  put(CX + R, FLOOR_Y + 4, CZ, EMERALD_ORE);
  put(CX - 7, FLOOR_Y + 2, CZ - 7, GOLD_ORE);

  // --- Descent tunnel: 2-wide stepped passage from the chamber up to the surface mouth ---
  for (let z = 20; z < DIM_Z; z++) {
    const fy = tunnelFloorY(z);
    const insideChamber = z <= 22;
    for (const x of [CX - 1, CX]) {
      put(x, fy - 1, z, STONE);
      put(x, fy, z, COBBLESTONE);
      for (let y = fy + 1; y <= fy + 3; y++) put(x, y, z, AIR);
      if (!insideChamber && z < DIM_Z - 4) put(x, fy + 4, z, STONE); // ceiling, open near the mouth
    }
    if (!insideChamber) {
      for (const wx of [CX - 2, CX + 1]) {
        for (let y = fy - 1; y <= fy + 4; y++) {
          put(wx, y, z, y === fy + 2 && z % 6 === 3 && wx === CX - 2 ? LANTERN : STONE);
        }
      }
    }
  }

  // --- Surface mouth: widen the opening and raise a lantern-lit arch flanked by menhirs ---
  const my = FOUNTAIN_DEPTH; // mouth floor = local surface height
  for (let z = DIM_Z - 2; z < DIM_Z; z++) {
    for (let x = CX - 2; x <= CX + 1; x++) {
      put(x, my, z, COBBLESTONE);
      for (let y = my + 1; y <= my + 3; y++) put(x, y, z, AIR);
    }
  }
  for (const ax of [CX - 2, CX + 1]) {
    for (let y = my + 1; y <= my + 4; y++) put(ax, y, DIM_Z - 2, STONE);
  }
  for (let x = CX - 2; x <= CX + 1; x++) put(x, my + 5, DIM_Z - 2, STONE); // lintel
  put(CX - 1, my + 4, DIM_Z - 2, LANTERN);
  put(CX, my + 4, DIM_Z - 2, LANTERN);
  for (const [mx, mz] of [
    [CX - 4, DIM_Z - 1],
    [CX + 3, DIM_Z - 1],
  ]) {
    put(mx, my + 1, mz, STONE);
    put(mx, my + 2, mz, STONE);
  }

  const blocks: Array<[number, number, number, BlockId]> = [];
  for (const [k, id] of cells) {
    const x = k % DIM_X;
    const z = Math.floor(k / DIM_X) % DIM_Z;
    const y = Math.floor(k / (DIM_X * DIM_Z));
    blocks.push([x, y, z, id]);
  }
  return { dims: [DIM_X, DIM_Y, DIM_Z], blocks };
}

/** One deterministic candidate per cell, mirroring `placementsAt`'s hashing scheme. */
export function fountainPlacement(
  seed: WorldSeed,
  cellX: number,
  cellZ: number,
  cellSize: number,
  density: number,
  surfaceAt: (seed: WorldSeed, x: number, z: number) => number,
): { ox: number; oy: number; oz: number } | null {
  const rng = mulberry32(
    (Math.imul(cellX, 73856093) ^
      Math.imul(cellZ, 19349663) ^
      Math.imul(seed, 83492791) ^
      Math.imul(0xfa17, 2654435761)) >>>
      0,
  );
  if (rng() > density) return null;
  const ox = cellX * cellSize + Math.floor(rng() * Math.max(1, cellSize - DIM_X));
  const oz = cellZ * cellSize + Math.floor(rng() * Math.max(1, cellSize - DIM_Z));
  const [mx, mz] = FOUNTAIN_MOUTH;
  const mouthSurface = Math.round(surfaceAt(seed, ox + mx, oz + mz));
  if (mouthSurface <= SEA_LEVEL + 1) return null; // keep the entrance on dry land
  const oy = mouthSurface - FOUNTAIN_DEPTH;
  if (oy < 1) return null;
  // The chamber must stay buried: every sampled column above it needs cover past the dome top.
  const domeTopLocal = FLOOR_Y + 1 + DOME_H;
  for (const [dx, dz] of [
    [CX, CZ],
    [CX - 7, CZ - 7],
    [CX + 7, CZ - 7],
    [CX - 7, CZ + 7],
    [CX + 7, CZ + 7],
  ]) {
    if (Math.round(surfaceAt(seed, ox + dx, oz + dz)) - oy < domeTopLocal + 2) return null;
  }
  return { ox, oy, oz };
}

/**
 * An Overlay that buries rare Fairy's Fountains across a preset. Unlike `scatterStructures`, the
 * stamp writes AIR entries too — that's what carves the chamber and tunnel out of solid terrain.
 * Cells are large and density low on purpose: finding one should feel like a secret.
 */
export function scatterFairyFountains(
  surfaceAt: (seed: WorldSeed, x: number, z: number) => number,
  opts?: { cellSize?: number; density?: number },
): Overlay {
  const cellSize = opts?.cellSize ?? 320;
  const density = opts?.density ?? 0.4;
  const prefab = fairyFountain();
  return (chunk, cx, cz, seed) => {
    const baseX = cx * CHUNK_SIZE_X;
    const baseZ = cz * CHUNK_SIZE_Z;
    const minCellX = Math.floor((baseX - cellSize + 1) / cellSize);
    const maxCellX = Math.floor((baseX + CHUNK_SIZE_X - 1) / cellSize);
    const minCellZ = Math.floor((baseZ - cellSize + 1) / cellSize);
    const maxCellZ = Math.floor((baseZ + CHUNK_SIZE_Z - 1) / cellSize);
    for (let cellZ = minCellZ; cellZ <= maxCellZ; cellZ++) {
      for (let cellX = minCellX; cellX <= maxCellX; cellX++) {
        const p = fountainPlacement(seed, cellX, cellZ, cellSize, density, surfaceAt);
        if (!p) continue;
        for (const [dx, dy, dz, id] of prefab.blocks) {
          const wy = p.oy + dy;
          if (wy < 0 || wy >= WORLD_HEIGHT) continue;
          const lx = p.ox + dx - baseX;
          const lz = p.oz + dz - baseZ;
          if (lx < 0 || lx >= CHUNK_SIZE_X || lz < 0 || lz >= CHUNK_SIZE_Z) continue;
          chunk.set(lx, wy, lz, id);
        }
      }
    }
  };
}
