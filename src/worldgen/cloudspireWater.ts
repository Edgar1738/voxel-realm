import { WATER, LIMESTONE, STONE, AIR, CARVED_LIMESTONE } from '../blocks/blocks';
import { CitadelStamp } from './CitadelStamp';
import { FALLS } from './cloudspireFrame';
import { CLOUDSPIRE, cloudspireTerraceY } from './CloudspireGenerator';

// Elevated cistern east of the cathedral on support piers down to grade.
const RES = {
  y: CLOUDSPIRE.reservoirY,
  cx: CLOUDSPIRE.reservoirCx,
  cz: CLOUDSPIRE.reservoirCz,
  half: 12,
};

/** Elevated cistern on piers, aqueduct, and contained waterfall cascades. */
export function buildWater(s: CitadelStamp): void {
  const { cx, cz, half, y } = RES;

  // Cistern basin
  s.fill(cx - half, y - 3, cz - half, cx + half, y, cz + half, LIMESTONE);
  s.fill(cx - half + 2, y - 2, cz - half + 2, cx + half - 2, y - 1, cz + half - 2, STONE);
  for (let z = cz - half + 2; z <= cz + half - 2; z++) {
    for (let x = cx - half + 2; x <= cx + half - 2; x++) {
      s.set(x, y - 1, z, WATER);
    }
  }
  s.outline(cx - half, cz - half, cx + half, cz + half, y + 1, CARVED_LIMESTONE);

  // Support piers down to the terrace so the cistern reads as a water tower, not a floating slab.
  for (const [px, pz] of [
    [cx - half, cz - half],
    [cx + half, cz - half],
    [cx - half, cz + half],
    [cx + half, cz + half],
    [cx, cz - half],
    [cx, cz + half],
    [cx - half, cz],
    [cx + half, cz],
  ] as const) {
    const gy = cloudspireTerraceY(px, pz);
    s.fill(px - 1, gy, pz - 1, px, y - 4, pz, LIMESTONE);
  }

  // Aqueduct channel feeding the east cascade
  for (let x = cx + half; x <= 70; x++) {
    s.fill(x, y - 1, cz - 1, x, y - 1, cz + 1, LIMESTONE);
    s.set(x, y - 1, cz, WATER);
    s.set(x, y, cz - 1, CARVED_LIMESTONE);
    s.set(x, y, cz + 1, CARVED_LIMESTONE);
  }

  // Waterfall cascades — a wide sheet in a stone chute with a two-tier ledge and a contained pool.
  for (const f of FALLS) {
    const basinFloor = Math.max(f.bottom - 1, cloudspireTerraceY(f.x, f.z));
    const waterY = basinFloor + 1;

    // Header pool + spill lip
    s.fill(f.x - 4, f.top - 2, f.z - 3, f.x + 4, f.top, f.z + 3, LIMESTONE);
    s.fill(f.x - 3, f.top - 1, f.z - 2, f.x + 3, f.top - 1, f.z + 2, WATER);

    // Wide falling sheet inside a stone chute
    for (let yb = waterY; yb <= f.top; yb++) {
      for (let dx = -2; dx <= 2; dx++) s.set(f.x + dx, yb, f.z, WATER);
      s.set(f.x - 3, yb, f.z, LIMESTONE);
      s.set(f.x + 3, yb, f.z, LIMESTONE);
      s.set(f.x - 3, yb, f.z - 1, LIMESTONE);
      s.set(f.x + 3, yb, f.z - 1, LIMESTONE);
    }

    // Mid ledge → a second cascade tier spilling forward
    const midY = (f.top + waterY) >> 1;
    s.fill(f.x - 3, midY, f.z + 1, f.x + 3, midY, f.z + 2, LIMESTONE);
    for (let dx = -2; dx <= 2; dx++) s.set(f.x + dx, midY + 1, f.z + 1, WATER);

    // Contained splash basin
    s.fill(f.x - 5, basinFloor, f.z - 4, f.x + 5, basinFloor, f.z + 5, STONE);
    for (let z = f.z - 4; z <= f.z + 5; z++) {
      for (let x = f.x - 5; x <= f.x + 5; x++) {
        const rim = x === f.x - 5 || x === f.x + 5 || z === f.z - 4 || z === f.z + 5;
        if (rim) {
          s.set(x, waterY, z, CARVED_LIMESTONE);
          s.set(x, waterY + 1, z, CARVED_LIMESTONE);
        } else {
          s.set(x, waterY, z, WATER);
        }
      }
    }

    // Grotto alcove behind the falls
    s.fill(f.x - 5, waterY, f.z + 5, f.x + 5, waterY + 6, f.z + 9, LIMESTONE);
    s.fill(f.x - 4, waterY + 1, f.z + 5, f.x + 4, waterY + 5, f.z + 8, AIR);
  }
}
