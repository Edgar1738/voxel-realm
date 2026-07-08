// Frostvale Valley site guard: pins the seed-1337 `default` terrain at the surveyed site
// (docs/worlds/frostvale-valley-brief.md §3, Phase 0 record). The shipped world's sculpted
// deltas assume exactly these generated heights/biomes — if worldgen or the biome map change,
// this fails first, flagging that the site record (and any shipped Frostvale save) is stale.
import { describe, expect, it } from 'vitest';
import { layeredSurfaceAt } from '../src/worldgen/layeredHeight';
import { BiomeMap } from '../src/worldgen/BiomeMap';

const SEED = 1337;

// [x, z, height, biome] — key site anchors: massif peak, falls face, plunge basin,
// village bowl, west lake, pass area (biomes: 3 = Mountains, 4 = Tundra, 5 = Swamp).
const POINTS: Array<[number, number, number, number]> = [
  [544, 2944, 67, 3],
  [544, 3104, 102, 3],
  [544, 3184, 100, 3],
  [560, 3184, 113, 3], // massif peak / falls headwall
  [544, 3248, 60, 4], // plunge basin
  [496, 3344, 68, 4], // village bowl
  [136, 3200, 60, 4], // west lake
  [700, 3240, 63, 5], // east swamp fringe (re-surface zone)
  [676, 3100, 78, 3],
  [300, 3400, 69, 3],
  [584, 3160, 102, 3],
  [620, 3080, 53, 3],
];

describe('frostvale valley site terrain', () => {
  it('matches the surveyed heights and biomes at seed 1337', () => {
    const biomes = new BiomeMap(SEED);
    for (const [x, z, h, b] of POINTS) {
      expect(layeredSurfaceAt(SEED, x, z), `height at (${x},${z})`).toBe(h);
      expect(biomes.biomeAt(x, z), `biome at (${x},${z})`).toBe(b);
    }
  });
});
