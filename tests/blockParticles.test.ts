import { describe, it, expect } from 'vitest';
import { particleColorOf } from '../src/render/BlockParticles';
import { BLOCK_DEFS, AIR } from '../src/blocks/blocks';

describe('particleColorOf', () => {
  it('returns a valid RGB triple for every block, including AIR fallback', () => {
    for (const def of BLOCK_DEFS) {
      const color = particleColorOf(def);
      expect(color, def.name).toHaveLength(3);
      for (const channel of color) {
        expect(channel, def.name).toBeGreaterThanOrEqual(0);
        expect(channel, def.name).toBeLessThanOrEqual(255);
      }
    }
  });

  it('uses the fallback gray for the faceless AIR def', () => {
    const air = BLOCK_DEFS.find((d) => d.id === AIR);
    expect(air).toBeDefined();
    expect(particleColorOf(air!)).toEqual([130, 130, 136]);
  });

  it('picks distinct tints for visually distinct materials', () => {
    const grass = BLOCK_DEFS.find((d) => d.name === 'Grass');
    const stone = BLOCK_DEFS.find((d) => d.name === 'Stone');
    if (!grass || !stone) return; // names are display data; skip rather than pin them
    expect(particleColorOf(grass)).not.toEqual(particleColorOf(stone));
  });
});
