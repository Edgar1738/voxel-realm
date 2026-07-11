/**
 * Secondary destinations for Ember Spire Milestone 2:
 * - Cliff Monastery (NW shelf)
 * - Drowned Ruins (west lake shallows)
 * - Ash Mines (expanded east-rim network)
 */
import {
  AIR,
  STONE,
  COBBLESTONE,
  DEEPSLATE,
  BRICK,
  PLANKS,
  WOOD,
  GRAVEL,
  LANTERN,
  GLOWSTONE,
  CRYSTAL,
  BOOKSHELF,
  FURNACE,
  GOLD_ORE,
  EMERALD_ORE,
  STAIRS_STONE,
  STAIRS_COBBLE,
  STONEBRICK_WALL,
  COBBLE_WALL,
} from '../blocks/blocks';
import { packState, FACING } from '../world/VoxelState';
import { CitadelStamp, hash2, spiralStair } from './CitadelStamp';
import { ASHEN, ashenSurfaceAt } from './EmberSpireGenerator';
import { SEA_LEVEL } from '../core/constants';
import type { WorldSeed } from '../core/types';

/** Cliff Monastery on the NW rim shelf — stair approach, shrine, overlook of the spire. */
export function buildCliffMonastery(s: CitadelStamp, seed: WorldSeed): void {
  const { cx, cz, y } = ASHEN.monastery;
  const floorY = Math.max(y - 1, ashenSurfaceAt(seed, cx, cz));

  // Courtyard pad.
  for (let dz = -8; dz <= 8; dz++) {
    for (let dx = -8; dx <= 8; dx++) {
      if (dx * dx + dz * dz > 70) continue;
      s.fill(cx + dx, floorY - 8, cz + dz, cx + dx, floorY, cz + dz, DEEPSLATE);
      s.set(cx + dx, floorY, cz + dz, STONE);
    }
  }

  // Cloister walls + open court.
  s.walls(cx - 6, floorY + 1, cz - 6, cx + 6, floorY + 5, cz + 6, DEEPSLATE);
  s.fill(cx - 5, floorY + 1, cz - 5, cx + 5, floorY + 8, cz + 5, AIR);
  // Arcade posts.
  for (const [dx, dz] of [
    [-4, -4],
    [4, -4],
    [-4, 4],
    [4, 4],
    [0, -4],
    [0, 4],
    [-4, 0],
    [4, 0],
  ] as const) {
    s.fill(cx + dx, floorY + 1, cz + dz, cx + dx, floorY + 4, cz + dz, STONE);
  }
  // Roof ring.
  for (let dz = -6; dz <= 6; dz++) {
    for (let dx = -6; dx <= 6; dx++) {
      if (Math.abs(dx) === 6 || Math.abs(dz) === 6) s.set(cx + dx, floorY + 5, cz + dz, BRICK);
    }
  }

  // Shrine hall on north wall (into cliff).
  s.fill(cx - 3, floorY + 1, cz - 10, cx + 3, floorY + 6, cz - 6, AIR);
  s.walls(cx - 3, floorY + 1, cz - 10, cx + 3, floorY + 6, cz - 6, DEEPSLATE);
  s.slab(cx - 2, cz - 9, cx + 2, cz - 7, floorY, PLANKS);
  s.set(cx, floorY + 1, cz - 9, GLOWSTONE);
  s.set(cx, floorY + 2, cz - 9, CRYSTAL);
  s.set(cx - 2, floorY + 1, cz - 8, BOOKSHELF);
  s.set(cx + 2, floorY + 1, cz - 8, BOOKSHELF);
  s.set(cx, floorY + 4, cz - 8, LANTERN);

  // Balcony overlook toward spire (SE).
  for (let dx = -3; dx <= 3; dx++) {
    s.set(cx + dx, floorY, cz + 8, STONE);
    s.set(cx + dx, floorY + 1, cz + 8, STONEBRICK_WALL);
  }
  s.set(cx, floorY + 2, cz + 8, LANTERN);

  // Long stair path from district toward monastery (SE approach).
  for (let i = 0; i < 28; i++) {
    const x = cx + 8 + Math.floor(i * 0.6);
    const z = cz + 10 + i;
    const h = ashenSurfaceAt(seed, x, z);
    const yStep = Math.min(floorY, h + Math.floor(i / 3));
    s.fill(x - 1, yStep + 1, z, x + 1, yStep + 4, z, AIR);
    s.set(x, yStep, z, STAIRS_STONE, packState(FACING.N, 0));
    s.fill(x - 1, yStep - 1, z, x + 1, yStep - 6, z, DEEPSLATE);
    if (i % 5 === 0) s.set(x + 1, yStep + 1, z, LANTERN);
  }

  // Small bell tower.
  s.fill(cx + 5, floorY + 1, cz - 2, cx + 7, floorY + 10, cz, DEEPSLATE);
  s.fill(cx + 5, floorY + 11, cz - 2, cx + 7, floorY + 11, cz, BRICK);
  s.set(cx + 6, floorY + 12, cz - 1, GLOWSTONE);
}

/** Drowned ruins — partial arches and foundations in the west shallows. */
export function buildDrownedRuins(s: CitadelStamp, seed: WorldSeed): void {
  const { cx, cz } = ASHEN.drowned;
  // Broken arch rings poking above water.
  for (const [ox, oz, r] of [
    [0, 0, 5],
    [-6, 4, 4],
    [5, -3, 3],
  ] as const) {
    for (let a = 0; a < 16; a++) {
      if (hash2(ox + a, oz, 0xd04d) < 0.35) continue; // missing stones
      const ang = (a / 16) * Math.PI * 2;
      const px = Math.round(cx + ox + Math.cos(ang) * r);
      const pz = Math.round(cz + oz + Math.sin(ang) * r);
      const base = Math.max(SEA_LEVEL - 3, ashenSurfaceAt(seed, px, pz));
      s.fill(px, base, pz, px, SEA_LEVEL + 1 + (a % 3), pz, DEEPSLATE);
    }
  }
  // Collapsed path of stepping stones from west shore toward ruins.
  for (let i = 0; i < 16; i++) {
    const x = cx - 12 + i;
    const z = cz - 2 + (i % 3) - 1;
    if (hash2(x, z, 0x51e0) < 0.25) continue;
    s.set(x, SEA_LEVEL, z, COBBLESTONE);
    s.set(x, SEA_LEVEL + 1, z, AIR);
  }
  // Partially accessible chamber on a basalt knuckle.
  const hx = cx;
  const hz = cz;
  const hy = SEA_LEVEL;
  s.fill(hx - 2, hy - 1, hz - 2, hx + 2, hy - 1, hz + 2, DEEPSLATE);
  s.walls(hx - 2, hy, hz - 2, hx + 2, hy + 3, hz + 2, STONE);
  s.fill(hx - 1, hy, hz - 1, hx + 1, hy + 3, hz + 1, AIR);
  s.set(hx, hy, hz - 2, AIR); // door at waterline
  s.set(hx, hy + 1, hz - 2, AIR);
  s.set(hx, hy + 2, hz, LANTERN);
  s.set(hx + 1, hy, hz + 1, GOLD_ORE);
  s.set(hx - 1, hy, hz + 1, CRYSTAL);

  // Retaining wall stubs on west shore facing ruins.
  for (let z = cz - 10; z <= cz + 6; z += 2) {
    const x = cx - 18;
    const h = ashenSurfaceAt(seed, x, z);
    if (h < SEA_LEVEL - 1) continue;
    s.fill(x, h + 1, z, x, h + 2, z, DEEPSLATE);
  }
}

/** Expanded ash mines — monumental entrance, branching tunnels, chamber, vertical shaft. */
export function buildAshMinesM2(s: CitadelStamp, seed: WorldSeed): void {
  const { cx, cz } = ASHEN.mine;
  const mouthY = ashenSurfaceAt(seed, cx, cz);

  // Monumental portal.
  s.fill(cx - 3, mouthY - 1, cz - 4, cx + 3, mouthY - 1, cz + 4, COBBLESTONE);
  s.fill(cx - 2, mouthY + 1, cz - 3, cx + 2, mouthY + 6, cz + 3, AIR);
  s.walls(cx - 3, mouthY, cz - 4, cx + 3, mouthY + 7, cz + 4, DEEPSLATE);
  s.fill(cx - 3, mouthY + 7, cz - 4, cx + 3, mouthY + 7, cz + 4, BRICK);
  s.set(cx - 3, mouthY + 8, cz, GLOWSTONE);
  s.set(cx + 3, mouthY + 8, cz, GLOWSTONE);
  // Timber posts.
  for (const z of [cz - 3, cz + 3]) {
    s.fill(cx - 2, mouthY + 1, z, cx - 2, mouthY + 6, z, WOOD);
    s.fill(cx + 2, mouthY + 1, z, cx + 2, mouthY + 6, z, WOOD);
  }

  // Main tunnel east (+x) with supports.
  for (let i = 0; i <= 22; i++) {
    const x = cx + i;
    s.fill(x, mouthY + 1, cz - 2, x, mouthY + 4, cz + 2, AIR);
    s.fill(x, mouthY, cz - 2, x, mouthY, cz + 2, COBBLESTONE);
    if (i % 4 === 0) {
      s.fill(x, mouthY + 1, cz - 2, x, mouthY + 4, cz - 2, WOOD);
      s.fill(x, mouthY + 1, cz + 2, x, mouthY + 4, cz + 2, WOOD);
      s.set(x, mouthY + 4, cz, LANTERN);
    }
    if (hash2(x, cz, 0x01a1) < 0.18) s.set(x, mouthY + 1, cz - 2, GOLD_ORE);
    if (hash2(x, cz, 0x02b2) < 0.12) s.set(x, mouthY + 2, cz + 2, EMERALD_ORE);
    if (i > 10 && i < 14) s.set(x, mouthY + 1, cz, GLOWSTONE);
  }

  // Branch north.
  const bx = cx + 12;
  for (let j = 0; j <= 10; j++) {
    const z = cz - 3 - j;
    s.fill(bx - 1, mouthY + 1, z, bx + 1, mouthY + 3, z, AIR);
    s.fill(bx - 1, mouthY, z, bx + 1, mouthY, z, COBBLESTONE);
    if (j % 3 === 0) s.set(bx, mouthY + 3, z, LANTERN);
  }

  // Chamber at end of main tunnel.
  const ex = cx + 22;
  s.fill(ex - 3, mouthY, cz - 4, ex + 3, mouthY + 5, cz + 4, AIR);
  s.walls(ex - 4, mouthY, cz - 5, ex + 4, mouthY + 5, cz + 5, DEEPSLATE);
  s.slab(ex - 3, cz - 4, ex + 3, cz + 4, mouthY, STONE);
  s.set(ex, mouthY + 1, cz, FURNACE);
  s.set(ex - 2, mouthY + 1, cz - 2, WOOD);
  s.set(ex + 2, mouthY + 1, cz + 2, WOOD);
  s.set(ex, mouthY + 4, cz, GLOWSTONE);
  s.set(ex + 3, mouthY + 1, cz, CRYSTAL);

  // Vertical shaft down + spiral.
  s.fill(ex - 1, mouthY - 12, cz - 1, ex + 1, mouthY, cz + 1, AIR);
  spiralStair(s, ex, cz, mouthY - 11, mouthY, STAIRS_COBBLE, DEEPSLATE);
  // Lower gallery.
  for (let i = 0; i <= 8; i++) {
    const x = ex + i;
    s.fill(x, mouthY - 11, cz - 1, x, mouthY - 9, cz + 1, AIR);
    s.set(x, mouthY - 12, cz, COBBLESTONE);
    if (i % 2 === 0) s.set(x, mouthY - 9, cz, LANTERN);
    if (hash2(x, cz, 0x0a11) < 0.3) s.set(x, mouthY - 11, cz - 1, GOLD_ORE);
  }

  // Path markers from district road toward mine mouth.
  for (let i = 0; i < 12; i++) {
    const x = cx - 8 + i;
    const z = cz - 6;
    const h = ashenSurfaceAt(seed, x, z);
    s.set(x, h, z, GRAVEL);
    if (i % 3 === 0) {
      s.set(x, h + 1, z, COBBLE_WALL);
      s.set(x, h + 2, z, LANTERN);
    }
  }
}

/** Large ancient structure embedded in SE cliff horn — visible silhouette + interior. */
export function buildCliffEmbeddedRuin(s: CitadelStamp, seed: WorldSeed): void {
  const { cx, cz, y } = ASHEN.cliffHorn;
  const floorY = Math.max(y - 8, ashenSurfaceAt(seed, cx, cz) - 4);
  // Stepped facade into the cliff face (west-facing toward caldera).
  for (let tier = 0; tier < 4; tier++) {
    const x0 = cx - 10 + tier * 2;
    const half = 8 - tier;
    s.fill(x0, floorY + tier * 3, cz - half, x0 + 2, floorY + tier * 3 + 4, cz + half, DEEPSLATE);
  }
  // Hall carved in.
  s.fill(cx - 6, floorY + 1, cz - 4, cx + 2, floorY + 8, cz + 4, AIR);
  s.walls(cx - 6, floorY + 1, cz - 4, cx + 2, floorY + 8, cz + 4, STONE);
  s.set(cx - 6, floorY + 2, cz, AIR);
  s.set(cx - 6, floorY + 3, cz, AIR);
  s.set(cx - 3, floorY + 1, cz, GLOWSTONE);
  s.set(cx, floorY + 1, cz - 2, BOOKSHELF);
  s.set(cx, floorY + 1, cz + 2, BOOKSHELF);
  s.set(cx + 1, floorY + 6, cz, LANTERN);
  // Beacon on crown of horn.
  s.fill(cx, floorY + 14, cz, cx, floorY + 18, cz, BRICK);
  s.set(cx, floorY + 19, cz, GLOWSTONE);
}
