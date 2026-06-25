import { describe, it, expect } from 'vitest';
import { fbm2D, type FbmOptions } from '../src/worldgen/fbm';

const OPTS: FbmOptions = { octaves: 4, persistence: 0.5, lacunarity: 2, frequency: 1 };

describe('fbm2D', () => {
  it('returns the constant when the sampler is constant (normalized)', () => {
    expect(fbm2D(() => 1, 0, 0, OPTS)).toBeCloseTo(1, 6);
    expect(fbm2D(() => -1, 3, 7, OPTS)).toBeCloseTo(-1, 6);
    expect(fbm2D(() => 0, 1, 1, OPTS)).toBeCloseTo(0, 6);
  });

  it('stays within the sampler range [-1, 1]', () => {
    const sample = (x: number, z: number) => Math.sin(x) * Math.cos(z);
    for (let i = 0; i < 50; i++) {
      const v = fbm2D(sample, i * 0.3, i * 0.7, OPTS);
      expect(v).toBeGreaterThanOrEqual(-1);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it('weights the first octave most (persistence < 1)', () => {
    const sample = (x: number) => (x === 0 ? 1 : 0);
    // At x=0 every octave samples x*freq = 0, so all octaves fire => normalized 1.
    expect(fbm2D(sample, 0, 0, OPTS)).toBeCloseTo(1, 6);
  });

  it('is deterministic', () => {
    const sample = (x: number, z: number) => Math.sin(x * 1.3 + z * 0.2);
    expect(fbm2D(sample, 2, 5, OPTS)).toBe(fbm2D(sample, 2, 5, OPTS));
  });
});
