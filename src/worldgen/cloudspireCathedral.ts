import {
  AIR,
  LIMESTONE,
  CARVED_LIMESTONE,
  SLATE,
  CYAN_GLASS,
  GOLD_TRIM,
  LANTERN,
  GLOWSTONE,
  PLANKS,
  BOOKSHELF,
  OAK_FENCE,
} from '../blocks/blocks';
import { CitadelStamp } from './CitadelStamp';
import { CATH, CATH_CX, CATH_CZ, GP } from './cloudspireFrame';
import {
  pointedWindow,
  buttress,
  flyingButtress,
  gableRoofZ,
  pinnacle,
  spiralStair,
  hollowTower,
  steepRoof,
} from './cloudspirePrimitives';

/** Grand Gothic cathedral — full exterior shell + walkable nave interior. */
export function buildCathedral(s: CitadelStamp): void {
  const { x0, x1, z0, z1, floor, wallH, ridgeH, towerH } = CATH;
  const midX = CATH_CX;
  const midZ = CATH_CZ;

  // Pad / plinth
  s.fill(x0 - 4, GP, z0 - 4, x1 + 4, floor - 1, z1 + 4, LIMESTONE);

  // Outer walls
  s.walls(x0, floor, z0, x1, floor + wallH, z1, LIMESTONE);
  // Thick base
  s.walls(x0 - 1, floor, z0 - 1, x1 + 1, floor + 4, z1 + 1, CARVED_LIMESTONE);

  // Hollow interior volume
  s.fill(x0 + 1, floor, z0 + 1, x1 - 1, floor + wallH - 1, z1 - 1, AIR);

  // Nave floor
  s.slab(x0 + 1, z0 + 1, x1 - 1, z1 - 1, floor, PLANKS);
  // Center aisle runner
  s.fill(midX - 2, floor, z0 + 2, midX + 2, floor, z1 - 2, CARVED_LIMESTONE);

  // Side aisle columns
  for (let z = z0 + 6; z < z1 - 4; z += 6) {
    for (const x of [x0 + 8, x1 - 8]) {
      s.fill(x - 1, floor + 1, z - 1, x + 1, floor + wallH - 4, z + 1, LIMESTONE);
      s.set(x, floor + wallH - 3, z, CARVED_LIMESTONE);
    }
  }

  // Transept (east-west arms)
  const tHalf = 22;
  const tZ0 = midZ - 8;
  const tZ1 = midZ + 8;
  s.walls(midX - tHalf, floor, tZ0, midX + tHalf, floor + wallH - 4, tZ1, LIMESTONE);
  s.fill(midX - tHalf + 1, floor, tZ0 + 1, midX + tHalf - 1, floor + wallH - 5, tZ1 - 1, AIR);
  s.slab(midX - tHalf + 1, tZ0 + 1, midX + tHalf - 1, tZ1 - 1, floor, PLANKS);

  // Apse (north ceremonial chamber toward palace)
  const apseZ1 = z1 + 12;
  s.walls(midX - 10, floor, z1, midX + 10, floor + wallH - 6, apseZ1, LIMESTONE);
  s.fill(midX - 9, floor, z1, midX + 9, floor + wallH - 7, apseZ1 - 1, AIR);
  s.slab(midX - 9, z1, midX + 9, apseZ1 - 1, floor, PLANKS);
  // Altar offset from the processional aisle so the final route clear preserves it.
  const altarX = midX - 7;
  const altarZ = z1 + 2;
  s.fill(altarX - 3, floor + 1, altarZ - 2, altarX + 3, floor + 2, altarZ + 1, CARVED_LIMESTONE);
  s.set(altarX, floor + 3, altarZ, GOLD_TRIM);
  s.set(altarX, floor + 4, altarZ, GLOWSTONE);

  // Clerestory + tall windows on long walls
  for (let z = z0 + 5; z < z1 - 3; z += 5) {
    pointedWindow(s, x0, floor + 4, z, 10, 'x');
    pointedWindow(s, x1, floor + 4, z, 10, 'x');
    // Upper clerestory
    pointedWindow(s, x0, floor + 16, z, 8, 'x');
    pointedWindow(s, x1, floor + 16, z, 8, 'x');
  }
  // Rose-ish south façade windows
  for (const dx of [-12, -6, 0, 6, 12]) {
    pointedWindow(s, midX + dx, floor + 5, z0, 12, 'z');
  }

  // Buttresses along sides
  for (let z = z0 + 4; z < z1; z += 8) {
    buttress(s, x0 - 3, z, floor, floor + wallH - 2, 2, 0);
    buttress(s, x1 + 1, z, floor, floor + wallH - 2, 2, 0);
    flyingButtress(s, x0 - 8, z, x0 - 1, z, floor + wallH - 2, floor + 6);
    flyingButtress(s, x1 + 8, z, x1 + 1, z, floor + wallH - 2, floor + 6);
  }

  // Roof
  gableRoofZ(s, x0 - 1, x1 + 1, z0, z1, floor + wallH, SLATE);
  // Ridge height marker volume (for tests / silhouette)
  s.fill(midX - 1, floor + ridgeH - 4, midZ - 2, midX + 1, floor + ridgeH, midZ + 2, SLATE);

  // West bell tower
  const btx = x0 - 6;
  const btz = z0 + 8;
  hollowTower(s, btx, btz, 5, floor, floor + towerH, LIMESTONE, true);
  steepRoof(s, btx, btz, 6, floor + towerH + 1, SLATE);
  pinnacle(s, btx, floor + towerH + 8, btz, 10);
  spiralStair(s, btx, btz, floor + 1, floor + towerH - 2, PLANKS, CARVED_LIMESTONE);
  // Door from nave into tower
  s.fill(x0, floor + 1, btz - 1, x0, floor + 3, btz + 1, AIR);
  // Bell chamber glow
  s.set(btx, floor + towerH - 4, btz, GLOWSTONE);
  s.set(btx, floor + towerH - 3, btz, LANTERN);

  // East tower (shorter, gallery access)
  const etx = x1 + 6;
  const etz = z0 + 8;
  hollowTower(s, etx, etz, 4, floor, floor + 48, LIMESTONE, true);
  steepRoof(s, etx, etz, 5, floor + 49, SLATE);
  spiralStair(s, etx, etz, floor + 1, floor + 46, PLANKS, CARVED_LIMESTONE);
  s.fill(x1, floor + 1, etz - 1, x1, floor + 3, etz + 1, AIR);

  // Main south entrance (hero route)
  s.fill(midX - 3, floor, z0 - 2, midX + 3, floor + 7, z0 + 2, AIR);
  s.fill(midX - 4, floor, z0 - 1, midX + 4, floor, z0 + 1, CARVED_LIMESTONE);
  // Door surround
  for (const dx of [-4, 4]) {
    s.fill(midX + dx, floor, z0, midX + dx, floor + 8, z0, CARVED_LIMESTONE);
  }
  s.fill(midX - 4, floor + 8, z0, midX + 4, floor + 8, z0, CARVED_LIMESTONE);

  // North exit toward palace court
  s.fill(midX - 3, floor, z1 - 1, midX + 3, floor + 6, apseZ1 + 1, AIR);

  // Upper gallery (side balconies)
  const galY = floor + 14;
  s.fill(x0 + 2, galY, z0 + 4, x0 + 5, galY, z1 - 4, PLANKS);
  s.fill(x1 - 5, galY, z0 + 4, x1 - 2, galY, z1 - 4, PLANKS);
  for (let z = z0 + 6; z < z1 - 4; z += 4) {
    s.set(x0 + 3, galY + 1, z, OAK_FENCE);
    s.set(x1 - 3, galY + 1, z, OAK_FENCE);
    s.set(x0 + 4, galY + 1, z, LANTERN);
  }
  // Ladder/stair to gallery from SE
  spiralStair(s, x1 - 4, z0 + 4, floor + 1, galY, PLANKS, LIMESTONE);

  // Interior lighting — nave chandeliers, aisle floor lanterns, glowing columns so the nave
  // reads as a lit hall rather than a dark corridor.
  for (let z = z0 + 5; z < z1; z += 4) {
    // Chandelier hung at mid-height so its light actually reaches the nave floor
    s.set(midX, floor + 12, z, GLOWSTONE);
    s.set(midX, floor + 11, z, LANTERN);
    // A high ceiling accent
    s.set(midX, floor + wallH - 2, z, GLOWSTONE);
    // Aisle floor lanterns
    s.set(midX - 6, floor + 1, z, LANTERN);
    s.set(midX + 6, floor + 1, z, LANTERN);
  }
  // Glowing sconces set into the aisle columns
  for (let z = z0 + 6; z < z1 - 4; z += 6) {
    for (const x of [x0 + 8, x1 - 8]) {
      s.set(x, floor + 6, z, GLOWSTONE);
      s.set(x, floor + 12, z, GLOWSTONE);
    }
  }

  // Side chapels (books / pews)
  for (const side of [-1, 1]) {
    const cx = midX + side * 18;
    s.fill(cx - 3, floor + 1, midZ - 3, cx + 3, floor + 1, midZ + 3, PLANKS);
    for (let i = -2; i <= 2; i++) {
      s.set(cx + i, floor + 2, midZ - 2, BOOKSHELF);
    }
    s.set(cx, floor + 2, midZ + 2, LANTERN);
  }

  // Cyan glass roof accents
  for (let z = z0 + 10; z < z1 - 8; z += 10) {
    s.set(midX, floor + wallH + 6, z, CYAN_GLASS);
  }
}

/** Ensure cathedral processional openings stay clear. */
export function clearCathedralRoute(s: CitadelStamp): void {
  const midX = CATH_CX;
  s.fill(midX - 2, CATH.floor + 1, CATH.z0 - 3, midX + 2, CATH.floor + 5, CATH.z1 + 10, AIR);
}
