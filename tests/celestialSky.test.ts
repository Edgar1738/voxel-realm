import { describe, it, expect } from 'vitest';
import { starOpacity } from '../src/render/CelestialSky';
import { skyState } from '../src/render/Sky';

describe('starOpacity', () => {
  it('is strongly visible at night and invisible at noon', () => {
    // Night floors daylight at 0.16, so stars sit near (but not at) full opacity.
    expect(starOpacity(skyState(0).daylight)).toBeGreaterThan(0.7);
    expect(starOpacity(skyState(0.5).daylight)).toBe(0);
  });

  it('is fully opaque only when daylight reaches zero', () => {
    expect(starOpacity(0)).toBe(1);
  });

  it('stays clamped to [0, 1]', () => {
    expect(starOpacity(-1)).toBeLessThanOrEqual(1);
    expect(starOpacity(-1)).toBeGreaterThanOrEqual(0);
    expect(starOpacity(2)).toBe(0);
  });

  it('fades monotonically as daylight grows', () => {
    const dawn = starOpacity(0.2);
    const morning = starOpacity(0.5);
    expect(dawn).toBeGreaterThanOrEqual(morning);
  });
});
