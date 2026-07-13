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
import { GG, GP, CX, CZ, GX0, GX1, GZ0, GZ1, CATH, KEEP, G } from './cloudspireFrame';
import { fountain } from './cloudspirePrimitives';
import { stairFlightZ, stairFlightX } from './cloudspirePrimitives';

/** Formal garden terraces between outer walls and palace. */
export function buildGardens(s: CitadelStamp): void {
  // Garden terrace surface
  for (let z = Math.max(GZ0 + 8, s.wz0); z <= Math.min(GZ1 - 8, s.wz1); z++) {
    for (let x = Math.max(GX0 + 8, s.wx0); x <= Math.min(GX1 - 8, s.wx1); x++) {
      // Skip cathedral / palace footprints
      if (x >= CATH.x0 - 2 && x <= CATH.x1 + 2 && z >= CATH.z0 - 2 && z <= CATH.z1 + 14) continue;
      if (x >= KEEP.x0 - 2 && x <= KEEP.x1 + 2 && z >= KEEP.z0 - 2 && z <= KEEP.z1 + 2) continue;
      const cheb = Math.max(Math.abs(x - CX), Math.abs(z - CZ));
      if (cheb > 95 || cheb < 40) continue;
      s.set(x, GG, z, GRASS);
      s.fill(x, GG + 1, z, x, GG + 3, z, AIR);
      const h = hash2(x, z, 0x6a7d);
      if (h < 0.04) s.set(x, GG + 1, z, FLOWER);
      if (h > 0.96) {
        // Topiary blob
        s.set(x, GG + 1, z, LEAVES);
        s.set(x, GG + 2, z, LEAVES);
      }
    }
  }

  // Geometric paths (cross + rings)
  for (let z = GZ0 + 15; z < GZ1 - 15; z++) {
    for (let x = CX - 2; x <= CX + 2; x++) {
      if (z > CATH.z0 - 5 && z < CATH.z1 + 12 && Math.abs(x - CX) < 30) {
        // leave cathedral approach to stone path
      }
      s.set(x, GG, z, PLANKS);
      s.fill(x, GG + 1, z, x, GG + 3, z, AIR);
    }
  }
  for (let x = GX0 + 15; x < GX1 - 15; x++) {
    for (let z = CZ - 2; z <= CZ + 2; z++) {
      s.set(x, GG, z, PLANKS);
      s.fill(x, GG + 1, z, x, GG + 3, z, AIR);
    }
  }

  // Processional stone path gate → cathedral
  for (let z = -120; z < CATH.z0; z++) {
    for (let x = CX - 3; x <= CX + 3; x++) {
      const y = z < -100 ? G : z < -70 ? G : GG;
      s.set(x, y, z, STONE);
      s.fill(x, y + 1, z, x, y + 4, z, AIR);
    }
  }

  // Fountains
  fountain(s, CX - 35, CZ - 20, GG);
  fountain(s, CX + 35, CZ - 20, GG);
  fountain(s, CX, CZ + 30, GP); // palace court

  // Reflecting pool west garden
  const px0 = CX - 55;
  const px1 = CX - 35;
  const pz0 = CZ + 5;
  const pz1 = CZ + 25;
  s.fill(px0 - 1, GG, pz0 - 1, px1 + 1, GG, pz1 + 1, CARVED_LIMESTONE);
  s.fill(px0, GG, pz0, px1, GG, pz1, STONE);
  for (let z = pz0; z <= pz1; z++) {
    for (let x = px0; x <= px1; x++) {
      s.set(x, GG + 1, z, WATER);
    }
  }

  // Hedge rings
  for (const r of [50, 60, 70]) {
    for (let a = 0; a < 360; a += 6) {
      const rad = (a * Math.PI) / 180;
      const x = Math.round(CX + Math.cos(rad) * r);
      const z = Math.round(CZ + Math.sin(rad) * r);
      if (x >= CATH.x0 - 3 && x <= CATH.x1 + 3 && z >= CATH.z0 - 3 && z <= CATH.z1 + 12) continue;
      s.set(x, GG + 1, z, LEAVES);
      s.set(x, GG + 2, z, LEAVES);
    }
  }

  // Terrace stairs garden → palace
  stairFlightZ(s, CX - 3, CX + 3, CATH.z1 + 14, GG + 1, GP - GG, 1);
  // Side stairs
  stairFlightX(s, CZ - 5, CZ + 5, GX0 + 20, G + 1, GG - G, 1);

  // Court paving
  for (let z = KEEP.z0 - 20; z < KEEP.z0; z++) {
    for (let x = KEEP.x0 - 10; x <= KEEP.x1 + 10; x++) {
      s.set(x, GP, z, STONE);
      s.fill(x, GP + 1, z, x, GP + 4, z, AIR);
    }
  }

  // Trees near outer garden edge
  for (const [tx, tz] of [
    [-80, -50],
    [80, -55],
    [-75, 50],
    [78, 55],
    [-60, 80],
    [65, 75],
  ] as const) {
    s.fill(tx, GG + 1, tz, tx, GG + 5, tz, WOOD);
    for (let dy = 4; dy <= 7; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        for (let dz = -2; dz <= 2; dz++) {
          if (dx * dx + dz * dz <= 5) s.set(tx + dx, GG + dy, tz + dz, LEAVES);
        }
      }
    }
  }

  // Low garden walls
  s.outline(GX0 + 12, GZ0 + 12, GX1 - 12, GZ1 - 12, GG + 1, OAK_FENCE);
  for (let x = GX0 + 12; x < GX1 - 12; x += 12) {
    s.set(x, GG + 2, GZ0 + 12, LANTERN);
    s.set(x, GG + 2, GZ1 - 12, LANTERN);
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
