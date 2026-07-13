import { WATER, LIMESTONE, STONE, AIR, CARVED_LIMESTONE } from '../blocks/blocks';
import { CitadelStamp } from './CitadelStamp';
import { FALLS, G } from './cloudspireFrame';
import { CLOUDSPIRE } from './CloudspireGenerator';

const RES = {
  y: CLOUDSPIRE.reservoirY,
  cx: 20,
  cz: -35,
  half: 18,
};

/** Elevated reservoirs, aqueducts, and contained waterfall columns. */
export function buildWater(s: CitadelStamp): void {
  const { cx, cz, half, y } = RES;
  s.fill(cx - half, y - 3, cz - half, cx + half, y, cz + half, LIMESTONE);
  s.fill(cx - half + 2, y - 2, cz - half + 2, cx + half - 2, y - 1, cz + half - 2, STONE);
  for (let z = cz - half + 2; z <= cz + half - 2; z++) {
    for (let x = cx - half + 2; x <= cx + half - 2; x++) {
      s.set(x, y - 1, z, WATER);
    }
  }
  s.outline(cx - half, cz - half, cx + half, cz + half, y + 1, CARVED_LIMESTONE);

  for (let x = cx; x < 70; x++) {
    s.fill(x, y - 1, cz - 1, x, y - 1, cz + 1, LIMESTONE);
    s.set(x, y - 1, cz, WATER);
    s.set(x, y, cz - 1, CARVED_LIMESTONE);
    s.set(x, y, cz + 1, CARVED_LIMESTONE);
  }

  for (const f of FALLS) {
    s.fill(f.x - 3, f.top - 2, f.z - 3, f.x + 3, f.top, f.z + 3, LIMESTONE);
    s.fill(f.x - 2, f.top - 1, f.z - 2, f.x + 2, f.top - 1, f.z + 2, WATER);
    for (let yb = f.bottom; yb <= f.top; yb++) {
      s.set(f.x, yb, f.z, WATER);
      s.set(f.x + 1, yb, f.z, WATER);
      if ((yb & 1) === 0) s.set(f.x, yb, f.z + 1, WATER);
    }
    s.fill(f.x - 4, f.bottom - 1, f.z - 4, f.x + 4, f.bottom, f.z + 4, STONE);
    for (let z = f.z - 3; z <= f.z + 3; z++) {
      for (let x = f.x - 3; x <= f.x + 3; x++) {
        s.set(x, f.bottom, z, WATER);
      }
    }
    s.fill(f.x - 5, f.bottom + 2, f.z + 5, f.x + 5, f.bottom + 2, f.z + 8, LIMESTONE);
    s.fill(f.x - 4, f.bottom + 3, f.z + 5, f.x + 4, f.bottom + 5, f.z + 7, AIR);
  }

  for (let a = 0; a < 360; a += 2) {
    const rad = (a * Math.PI) / 180;
    const x = Math.round(Math.cos(rad) * 62);
    const z = Math.round(Math.sin(rad) * 62);
    s.set(x, G + 8, z, STONE);
    s.set(x, G + 9, z, WATER);
  }
}
