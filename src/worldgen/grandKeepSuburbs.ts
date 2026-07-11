import {
  AIR,
  BRICK,
  COBBLESTONE,
  GRAVEL,
  LANTERN,
  LEAVES,
  PLANKS,
  STONE,
  WOOD,
} from '../blocks/blocks';
import { CitadelStamp, hash2 } from './CitadelStamp';
import { G } from './grandKeepFrame';

function road(s: CitadelStamp, x0: number, z0: number, x1: number, z1: number): void {
  const minX = Math.max(Math.min(x0, x1), s.wx0);
  const maxX = Math.min(Math.max(x0, x1), s.wx1);
  const minZ = Math.max(Math.min(z0, z1), s.wz0);
  const maxZ = Math.min(Math.max(z0, z1), s.wz1);
  for (let z = minZ; z <= maxZ; z++) {
    for (let x = minX; x <= maxX; x++) {
      const r = hash2(x, z, 0x5b87);
      s.set(x, G, z, r < 0.5 ? GRAVEL : r < 0.8 ? COBBLESTONE : STONE);
      s.fill(x, G + 1, z, x, G + 4, z, AIR);
    }
  }
}

function cottage(s: CitadelStamp, x: number, z: number, w = 10, d = 8): void {
  const x1 = x + w - 1;
  const z1 = z + d - 1;
  s.slab(x, z, x1, z1, G, STONE);
  s.walls(x, G + 1, z, x1, G + 5, z1, BRICK);
  s.fill(x + 1, G + 1, z + 1, x1 - 1, G + 4, z1 - 1, AIR);
  s.slab(x, z, x1, z1, G + 6, PLANKS);
  s.set(x + 2, G + 2, z, WOOD);
  s.set((x + x1) >> 1, G + 7, (z + z1) >> 1, LANTERN);
}

/** Ribbon suburbs and rural anchors beyond the newest curtain. */
export function buildCapitalSuburbs(s: CitadelStamp): void {
  // South road suburb, loose enough to read as new unprotected growth.
  road(s, 5, -340, 11, -221);
  for (let i = 0; i < 7; i++) {
    const z = -252 - i * 13;
    cottage(s, -22 - (i % 2) * 5, z, 11, 9);
    cottage(s, 24 + (i % 3) * 4, z - 4, 11, 9);
  }
  s.set(-18, G + 2, -260, WOOD);
  s.set(28, G + 2, -285, BRICK);

  // Small east and west ribbons following the cardinal gate roads.
  road(s, -300, 17, -233, 23);
  road(s, 249, 17, 310, 23);
  for (let i = 0; i < 4; i++) {
    cottage(s, -292 + i * 17, 4, 11, 9);
    cottage(s, 258 + i * 17, 28, 11, 9);
  }
  s.set(-270, G + 2, 8, WOOD);
  s.set(285, G + 2, 32, BRICK);

  // Roadside chapel southeast: nave, apse marker, and bell peak.
  cottage(s, 60, -306, 14, 22);
  s.fill(65, G + 2, -300, 65, G + 12, -300, STONE);
  s.set(65, G + 13, -300, LANTERN);

  // Farmstead southwest with fenced court and barn.
  s.outline(-120, -325, -82, -294, G + 1, WOOD);
  cottage(s, -112, -322, 18, 12);
  s.set(-105, G + 2, -315, PLANKS);

  // Orchard southeast, planted on a strict productive grid.
  for (let x = 120; x <= 150; x += 6) {
    for (let z = -322; z <= -298; z += 6) {
      s.fill(x, G + 1, z, x, G + 3, z, WOOD);
      s.fill(x - 1, G + 4, z - 1, x + 1, G + 5, z + 1, LEAVES);
    }
  }
  s.set(125, G + 1, -315, LEAVES);

  // Windmill on the western rise, with a tall stone base and crossed sails.
  s.fill(-173, G, -288, -167, G + 13, -282, STONE);
  s.fill(-170, G + 8, -296, -170, G + 8, -274, WOOD);
  s.fill(-181, G + 8, -285, -159, G + 8, -285, WOOD);
  s.set(-170, G + 8, -285, BRICK);
}
