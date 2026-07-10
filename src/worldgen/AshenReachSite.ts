import {
  AIR,
  COBBLESTONE,
  COBBLE_WALL,
  CRYSTAL,
  DEEPSLATE,
  GLASS,
  GLOWSTONE,
  GRAVEL,
  LANTERN,
  LAVA,
  PLANKS,
  STAIRS_COBBLE,
  STONEBRICK_WALL,
  WOOD,
} from '../blocks/blocks';
import { ASHEN_REACH, ashenReachSurfaceAt } from './AshenReachGenerator';
import { CitadelStamp, floorWithStairHole, spiralStair } from './CitadelStamp';
import type { Overlay } from './Generator';

const A = ASHEN_REACH;
const G = A.keepY;

function buildLavaValley(s: CitadelStamp): void {
  // A shallow, glowing river at the valley floor reads clearly from the overlook without adding
  // a second simulation type. Its bed is enclosed by deepslate so it remains a clean landmark.
  s.fill(-8, 58, 6, 8, 59, 36, DEEPSLATE);
  s.fill(-6, 60, 8, 6, 61, 35, LAVA);
  s.fill(-8, 62, 6, -7, 64, 36, DEEPSLATE);
  s.fill(7, 62, 6, 8, 64, 36, DEEPSLATE);
}

function buildSpawnPlatform(s: CitadelStamp): void {
  // Raised basalt viewing deck just behind the trench mouth: spawn stands two blocks above the
  // plateau so Cinderkeep reads across the valley on arrival instead of a trench wall.
  s.fill(-3, 105, 93, 3, 106, 97, DEEPSLATE);
  s.slab(-3, 93, 3, 97, 106, COBBLESTONE);
  for (let x = -3; x <= 3; x += 2) s.set(x, 107, 97, STONEBRICK_WALL);
  for (let z = 93; z <= 97; z += 2) {
    s.set(-3, 107, z, STONEBRICK_WALL);
    s.set(3, 107, z, STONEBRICK_WALL);
  }
  s.set(-3, 108, 97, LANTERN);
  s.set(3, 108, 97, LANTERN);
  // A single open step down onto the plateau, straight toward the trench mouth.
  s.fill(-1, 105, 92, 1, 105, 92, GRAVEL);
}

function buildApproach(s: CitadelStamp): void {
  // A broad stepped descent deliberately frames Cinderkeep, then becomes a damaged bridge over
  // the lava channel. The unbroken center lane keeps the whole route walkable.
  for (let z = 42; z <= 90; z++) {
    const y = 80 + Math.floor((z - 42) / 2);
    // Carve headroom first: the upper half of the descent cuts a walkable trench through the
    // overlook plateau (solid to overlookY), otherwise the steps would be entombed in rock.
    s.fill(-4, y + 1, z, 4, y + 6, z, AIR);
    s.slab(-3, z, 3, z, y, GRAVEL);
    if (z % 8 === 2) {
      s.set(-4, y + 1, z, LANTERN);
      s.set(4, y + 1, z, LANTERN);
    }
  }
  s.slab(-3, -42, 3, 42, 79, PLANKS);
  for (let z = -36; z <= 34; z++) {
    if ((z + 36) % 7 === 0) {
      s.set(-4, 80, z, COBBLE_WALL);
      s.set(4, 80, z, COBBLE_WALL);
    }
  }
  // Two missing edge panels make the bridge feel damaged without breaking the main crossing.
  s.fill(-3, 79, 14, -2, 79, 18, AIR);
  s.fill(2, 79, -10, 3, 79, -6, AIR);
}

function buildCurtainWall(s: CitadelStamp): void {
  const x0 = -30;
  const x1 = 30;
  const z0 = -100;
  const z1 = -40;
  s.slab(x0, z0, x1, z1, G, COBBLESTONE);
  s.fill(x0, G + 1, z0, x0 + 2, G + 12, z1, DEEPSLATE);
  s.fill(x1 - 2, G + 1, z0, x1, G + 12, z1, DEEPSLATE);
  s.fill(x0, G + 1, z0, x1, G + 12, z0 + 2, DEEPSLATE);
  s.fill(x0, G + 1, z1 - 2, x1, G + 12, z1, DEEPSLATE);
  // South gate: the direct continuation of the bridge opens into the courtyard. The carve
  // starts one block above the bridge deck (G + 1) so the wall base doubles as the gate
  // threshold instead of deleting the bridge's last rows.
  s.fill(-3, G + 2, z1 - 2, 3, G + 6, z1, AIR);
  s.fill(-5, G + 7, z1 - 2, 5, G + 8, z1, DEEPSLATE);
  for (let x = x0; x <= x1; x += 2) {
    s.set(x, G + 13, z0, STONEBRICK_WALL);
    s.set(x, G + 13, z1, STONEBRICK_WALL);
  }
  for (let z = z0; z <= z1; z += 2) {
    s.set(x0, G + 13, z, STONEBRICK_WALL);
    s.set(x1, G + 13, z, STONEBRICK_WALL);
  }
}

function buildTower(s: CitadelStamp, cx: number, cz: number, ruined = false): void {
  const top = ruined ? G + 17 : G + 23;
  s.walls(cx - 4, G + 1, cz - 4, cx + 4, top, cz + 4, DEEPSLATE);
  s.slab(cx - 4, cz - 4, cx + 4, cz + 4, top, COBBLESTONE);
  for (let x = cx - 4; x <= cx + 4; x += 2) {
    s.set(x, top + 1, cz - 4, STONEBRICK_WALL);
    s.set(x, top + 1, cz + 4, STONEBRICK_WALL);
  }
  for (let z = cz - 2; z <= cz + 2; z += 2) {
    s.set(cx - 4, top + 1, z, STONEBRICK_WALL);
    s.set(cx + 4, top + 1, z, STONEBRICK_WALL);
  }
  if (ruined) s.fill(cx + 1, top, cz - 1, cx + 4, top + 2, cz + 3, AIR);
}

function buildCinderkeep(s: CitadelStamp): void {
  buildCurtainWall(s);
  buildTower(s, -26, -96);
  buildTower(s, 26, -96, true);
  buildTower(s, -26, -44, true);
  buildTower(s, 26, -44);

  // Great keep: three usable levels with a central stair shaft and glazed arrow slits.
  const x0 = -16;
  const x1 = 16;
  const z0 = -92;
  const z1 = -64;
  const roof = G + 28;
  s.walls(x0, G + 1, z0, x1, roof, z1, DEEPSLATE);
  s.slab(x0, z0, x1, z1, roof, COBBLESTONE);
  s.fill(-3, G + 1, z1, 3, G + 5, z1, AIR);
  // Keep the 3x3 stair shaft open through every floor and the roof so the spiral actually
  // climbs from the hall to the battlements.
  for (const y of [G + 10, G + 19]) {
    floorWithStairHole(s, x0 + 1, z0 + 1, x1 - 1, z1 - 1, y, 10, -78, PLANKS);
  }
  s.fill(9, roof, -79, 11, roof, -77, AIR);
  spiralStair(s, 10, -78, G + 1, roof, STAIRS_COBBLE, DEEPSLATE);
  for (const y of [G + 5, G + 14, G + 23]) {
    for (let x = -11; x <= 11; x += 5) {
      s.set(x, y, z0, GLASS);
      s.set(x, y, z1, GLASS);
    }
    s.set(x0, y, -78, GLASS);
    s.set(x1, y, -78, GLASS);
  }
  s.set(0, G + 30, -78, GLOWSTONE);
  s.set(0, G + 29, -78, CRYSTAL);
  for (let x = x0; x <= x1; x += 2) {
    s.set(x, roof + 1, z0, STONEBRICK_WALL);
    s.set(x, roof + 1, z1, STONEBRICK_WALL);
  }
  for (let z = z0 + 2; z <= z1 - 2; z += 2) {
    s.set(x0, roof + 1, z, STONEBRICK_WALL);
    s.set(x1, roof + 1, z, STONEBRICK_WALL);
  }
}

function buildWatchtower(s: CitadelStamp, seed: number): void {
  const x = 28;
  const z = 38;
  const base = ashenReachSurfaceAt(seed, x, z) + 1;
  s.fill(x - 3, base - 1, z - 3, x + 3, base - 1, z + 3, DEEPSLATE);
  s.walls(x - 3, base, z - 3, x + 3, base + 14, z + 3, COBBLESTONE);
  s.fill(x - 1, base, z - 3, x + 1, base + 3, z - 3, AIR);
  s.slab(x - 3, z - 3, x + 3, z + 3, base + 14, PLANKS);
  s.set(x, base + 15, z, LANTERN);
}

function buildExplorationProps(s: CitadelStamp): void {
  for (const [x, z, h] of [
    [-31, 31, 7],
    [-42, 6, 9],
    [38, -8, 6],
  ] as const) {
    s.fill(x - 2, 63, z - 2, x + 2, 63, z + 2, COBBLESTONE);
    s.walls(x - 2, 64, z - 2, x + 2, 64 + h, z + 2, DEEPSLATE);
    s.fill(x - 1, 64 + h - 2, z - 1, x + 2, 64 + h + 2, z + 2, AIR);
  }
  for (const [x, z] of [
    [-16, 44],
    [18, 46],
    [-36, -18],
  ] as const) {
    s.fill(x, 64, z, x, 70, z, WOOD);
    s.fill(x - 2, 68, z, x + 2, 68, z, WOOD);
  }
  for (const [x, z] of [
    [-10, 14],
    [11, 26],
    [-22, 25],
  ] as const) {
    s.fill(x, 62, z, x, 66, z, CRYSTAL);
    s.set(x + 1, 62, z, CRYSTAL);
  }
}

/** Chunk-clipped authored landmarks for the Ashen Reach exploration route. */
export function ashenReachSite(): Overlay {
  return (chunk, cx, cz, seed) => {
    const stamp = new CitadelStamp(chunk, cx, cz);
    buildSpawnPlatform(stamp);
    buildLavaValley(stamp);
    buildApproach(stamp);
    buildCinderkeep(stamp);
    buildWatchtower(stamp, seed);
    buildExplorationProps(stamp);
  };
}
