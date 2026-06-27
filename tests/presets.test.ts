import { describe, it, expect } from 'vitest';
import { createGenerator, isWorldPreset } from '../src/worldgen/Presets';
import { AIR, GRASS, COBBLESTONE } from '../src/blocks/blocks';
import { SEA_LEVEL } from '../src/core/constants';

const SEED = 1337;

describe('world presets', () => {
  it('flat: grass surface at sea level, solid below, air above, no overlays', () => {
    const { generator, overlays } = createGenerator('flat');
    const c = generator.generateBaseChunk(SEED, 0, 0);
    expect(c.get(0, SEA_LEVEL, 0)).toBe(GRASS);
    expect(c.get(0, SEA_LEVEL + 1, 0)).toBe(AIR);
    expect(c.get(0, SEA_LEVEL - 1, 0)).not.toBe(AIR);
    expect(overlays).toHaveLength(0);
  });

  it('void: entirely air', () => {
    const { generator } = createGenerator('void');
    const c = generator.generateBaseChunk(SEED, 2, -3);
    expect(c.get(0, SEA_LEVEL, 0)).toBe(AIR);
    expect(c.get(8, 0, 8)).toBe(AIR);
  });

  it('arena: cobblestone surface', () => {
    const { generator } = createGenerator('arena');
    const c = generator.generateBaseChunk(SEED, 0, 0);
    expect(c.get(0, SEA_LEVEL, 0)).toBe(COBBLESTONE);
  });

  it('default: keeps the tree overlay', () => {
    expect(createGenerator('default').overlays).toHaveLength(1);
  });

  it('isWorldPreset guards unknown values', () => {
    expect(isWorldPreset('flat')).toBe(true);
    expect(isWorldPreset('nonsense')).toBe(false);
    expect(isWorldPreset(null)).toBe(false);
  });
});
