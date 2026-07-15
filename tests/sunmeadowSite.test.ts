import { describe, expect, it } from 'vitest';
import { BRICK, OAK_FENCE, PLANKS } from '../src/blocks/blocks';
import { curatedPresetMeta } from '../src/app/curatedPreset';
import { applyOverlays } from '../src/worldgen/Generator';
import { createGenerator, isWorldPreset } from '../src/worldgen/Presets';

const SEED = 1337;

describe('Sunmeadow Trial Grounds', () => {
  it('is a curated, selectable preset with Piper-facing arrival metadata', () => {
    expect(isWorldPreset('sunmeadow-trials')).toBe(true);
    expect(curatedPresetMeta('sunmeadow-trials', SEED, 2)).toMatchObject({
      title: 'Sunmeadow Trial Grounds',
      spawn: { x: 0.5, y: 63.9, z: 30.5 },
      look: { yaw: 0, pitch: 0 },
    });
  });

  it('stamps the start pavilion and a readable block flag', () => {
    const { generator, overlays } = createGenerator('sunmeadow-trials');
    const start = generator.generateBaseChunk(SEED, 0, 1);
    applyOverlays(start, 0, 1, SEED, overlays);
    expect(start.get(0, 62, 8)).toBe(PLANKS); // world (0,62,24)

    const west = generator.generateBaseChunk(SEED, -2, 0);
    applyOverlays(west, -2, 0, SEED, overlays);
    expect(west.get(8, 63, 2)).toBe(OAK_FENCE); // world (-24,63,2)
    expect(west.get(9, 65, 2)).toBe(BRICK);
  });
});
