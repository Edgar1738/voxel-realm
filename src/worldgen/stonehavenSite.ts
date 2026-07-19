import { COBBLESTONE, GRAVEL, STONE } from '../blocks/blocks';
import { CitadelStamp, hash2 } from './CitadelStamp';
import { stonehavenRoad, stonehavenSurfaceAt } from './StonehavenGenerator';
import type { Overlay } from './Generator';
import type { WorldSeed } from '../core/types';

/**
 * The old kingdom road: a worn cobble-and-gravel surface laid along the graded corridor the
 * terrain generator already cut. Width wobbles per column so the edges fray organically instead
 * of reading as a ruler line. The same route spline drives grading, paving, and (in later
 * milestones) the bridge, gate, and wayside dressing — one authored line, many readers.
 */
function paveRoad(s: CitadelStamp, seed: WorldSeed): void {
  const road = stonehavenRoad();
  for (let wz = s.wz0; wz <= s.wz1; wz++) {
    for (let wx = s.wx0; wx <= s.wx1; wx++) {
      const hit = road.project(wx, wz);
      const width = 2.3 + hash2(wx, wz, 0x70ad) * 0.9;
      if (hit.dist > width) continue;
      const h = stonehavenSurfaceAt(seed, wx, wz);
      const m = hash2(wx, wz, 0x9a7e);
      s.set(wx, h, wz, m < 0.5 ? COBBLESTONE : m < 0.82 ? GRAVEL : STONE);
    }
  }
}

/** The Stonehaven site overlay: everything authored on top of the terrain, clipped per chunk. */
export function stonehavenSite(): Overlay {
  return (chunk, cx, cz, seed) => {
    const s = new CitadelStamp(chunk, cx, cz);
    paveRoad(s, seed);
  };
}
