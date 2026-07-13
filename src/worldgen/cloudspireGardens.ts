import {
  AIR,
  CARVED_LIMESTONE,
  PLANKS,
  GRASS,
  FLOWER,
  OAK_FENCE,
  LANTERN,
  STONE,
  LEAVES,
  WOOD,
  WATER,
} from '../blocks/blocks';
import { CitadelStamp, hash2 } from './CitadelStamp';
import { GP, CX, CZ, GX0, GX1, GZ0, GZ1, CATH, KEEP, G } from './cloudspireFrame';
import { cloudspireTerraceY } from './CloudspireGenerator';
import { fountain } from './cloudspirePrimitives';
import { stairFlightX } from './cloudspirePrimitives';

/** Formal garden terraces between outer walls and palace, graded onto the real terrace surface. */
export function buildGardens(s: CitadelStamp): void {
  // Garden terrace surface — every feature sits at the generator's grade so nothing buries.
  for (let z = Math.max(GZ0 + 8, s.wz0); z <= Math.min(GZ1 - 8, s.wz1); z++) {
    for (let x = Math.max(GX0 + 8, s.wx0); x <= Math.min(GX1 - 8, s.wx1); x++) {
      // Skip cathedral / palace footprints
      if (x >= CATH.x0 - 2 && x <= CATH.x1 + 2 && z >= CATH.z0 - 2 && z <= CATH.z1 + 14) continue;
      if (x >= KEEP.x0 - 2 && x <= KEEP.x1 + 2 && z >= KEEP.z0 - 2 && z <= KEEP.z1 + 2) continue;
      const cheb = Math.max(Math.abs(x - CX), Math.abs(z - CZ));
      if (cheb > 95 || cheb < 40) continue;
      const gy = cloudspireTerraceY(x, z);
      s.set(x, gy, z, GRASS);
      s.fill(x, gy + 1, z, x, gy + 3, z, AIR);
      const h = hash2(x, z, 0x6a7d);
      if (h < 0.04) s.set(x, gy + 1, z, FLOWER);
      if (h > 0.96) {
        // Topiary blob
        s.set(x, gy + 1, z, LEAVES);
        s.set(x, gy + 2, z, LEAVES);
      }
    }
  }

  // Geometric paths (cross + rings) at grade
  for (let z = GZ0 + 15; z < GZ1 - 15; z++) {
    for (let x = CX - 2; x <= CX + 2; x++) {
      const gy = cloudspireTerraceY(x, z);
      s.set(x, gy, z, PLANKS);
      s.fill(x, gy + 1, z, x, gy + 3, z, AIR);
    }
  }
  for (let x = GX0 + 15; x < GX1 - 15; x++) {
    for (let z = CZ - 2; z <= CZ + 2; z++) {
      const gy = cloudspireTerraceY(x, z);
      s.set(x, gy, z, PLANKS);
      s.fill(x, gy + 1, z, x, gy + 3, z, AIR);
    }
  }

  // Processional stone path gate → cathedral, graded so the avenue rides the terrace slope
  // (previously pinned to G/GG and buried under the rising natural grade).
  for (let z = -120; z < CATH.z0; z++) {
    for (let x = CX - 3; x <= CX + 3; x++) {
      const gy = cloudspireTerraceY(x, z);
      s.set(x, gy, z, STONE);
      s.fill(x, gy + 1, z, x, gy + 4, z, AIR);
    }
  }

  // Fountains (graded to their own terrace height)
  fountain(s, CX - 35, CZ - 20, cloudspireTerraceY(CX - 35, CZ - 20));
  fountain(s, CX + 35, CZ - 20, cloudspireTerraceY(CX + 35, CZ - 20));
  fountain(s, CX, CZ + 30, GP); // palace court

  // Reflecting pool, west garden (contained raised basin at grade)
  const px0 = CX - 55;
  const px1 = CX - 35;
  const pz0 = CZ + 5;
  const pz1 = CZ + 25;
  const py = cloudspireTerraceY((px0 + px1) >> 1, (pz0 + pz1) >> 1);
  s.fill(px0 - 1, py, pz0 - 1, px1 + 1, py + 1, pz1 + 1, CARVED_LIMESTONE);
  s.fill(px0, py, pz0, px1, py, pz1, STONE);
  for (let z = pz0; z <= pz1; z++) {
    for (let x = px0; x <= px1; x++) {
      s.set(x, py + 1, z, WATER);
    }
  }

  // Hedge rings at grade
  for (const r of [50, 60, 70]) {
    for (let a = 0; a < 360; a += 6) {
      const rad = (a * Math.PI) / 180;
      const x = Math.round(CX + Math.cos(rad) * r);
      const z = Math.round(CZ + Math.sin(rad) * r);
      if (x >= CATH.x0 - 3 && x <= CATH.x1 + 3 && z >= CATH.z0 - 3 && z <= CATH.z1 + 12) continue;
      // Keep hedges clear of the cross paths and the N–S processional spine.
      if (Math.abs(x - CX) <= 3 || Math.abs(z - CZ) <= 3) continue;
      const gy = cloudspireTerraceY(x, z);
      s.set(x, gy + 1, z, LEAVES);
      s.set(x, gy + 2, z, LEAVES);
    }
  }

  // Side stairs: outer terrace up onto the garden shelf
  stairFlightX(s, CZ - 5, CZ + 5, GX0 + 20, G + 1, cloudspireTerraceY(GX0 + 20, CZ) - G, 1);

  // Court paving
  for (let z = KEEP.z0 - 20; z < KEEP.z0; z++) {
    for (let x = KEEP.x0 - 10; x <= KEEP.x1 + 10; x++) {
      s.set(x, GP, z, STONE);
      s.fill(x, GP + 1, z, x, GP + 4, z, AIR);
    }
  }

  // Trees near outer garden edge (graded)
  for (const [tx, tz] of [
    [-80, -50],
    [80, -55],
    [-75, 50],
    [78, 55],
    [-60, 80],
    [65, 75],
  ] as const) {
    const gy = cloudspireTerraceY(tx, tz);
    s.fill(tx, gy + 1, tz, tx, gy + 5, tz, WOOD);
    for (let dy = 4; dy <= 7; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        for (let dz = -2; dz <= 2; dz++) {
          if (dx * dx + dz * dz <= 5) s.set(tx + dx, gy + dy, tz + dz, LEAVES);
        }
      }
    }
  }

  // Low garden walls (graded border so the rail follows the terrace, not a fixed buried course)
  gradedBorder(s, GX0 + 12, GZ0 + 12, GX1 - 12, GZ1 - 12);
}

/** Fence rail + lanterns tracing a rectangle border, each post placed one above the terrace grade. */
function gradedBorder(s: CitadelStamp, x0: number, z0: number, x1: number, z1: number): void {
  const post = (x: number, z: number, lantern: boolean): void => {
    const gy = cloudspireTerraceY(x, z);
    s.set(x, gy + 1, z, OAK_FENCE);
    if (lantern) s.set(x, gy + 2, z, LANTERN);
  };
  for (let x = x0; x <= x1; x++) {
    post(x, z0, (x - x0) % 12 === 0);
    post(x, z1, (x - x0) % 12 === 0);
  }
  for (let z = z0 + 1; z < z1; z++) {
    post(x0, z, false);
    post(x1, z, false);
  }
}

/** Inner palace court dressing. */
export function buildInnerCourt(s: CitadelStamp): void {
  fountain(s, CX, KEEP.z0 - 10, GP);
  // Statue plinths
  for (const [x, z] of [
    [CX - 15, KEEP.z0 - 12],
    [CX + 15, KEEP.z0 - 12],
  ] as const) {
    s.fill(x - 1, GP + 1, z - 1, x + 1, GP + 4, z + 1, CARVED_LIMESTONE);
    s.set(x, GP + 5, z, LANTERN);
  }
  // Clear path cathedral apse → palace door
  s.fill(CX - 3, GP + 1, CATH.z1 + 8, CX + 3, GP + 5, KEEP.z0 + 2, AIR);
}
