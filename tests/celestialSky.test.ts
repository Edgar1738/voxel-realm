import { describe, it, expect } from 'vitest';
import { starOpacity, discOpacity } from '../src/render/CelestialSky';
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

describe('discOpacity', () => {
  it('keeps a disc at full strength down to the horizon', () => {
    expect(discOpacity(0.9)).toBe(1); // high noon sun
    expect(discOpacity(0)).toBe(1); // sitting on the skyline
  });

  it('fades a disc out as it slips below the horizon', () => {
    expect(discOpacity(-0.05)).toBeGreaterThan(0);
    expect(discOpacity(-0.05)).toBeLessThan(1);
    expect(discOpacity(-0.14)).toBe(0);
    expect(discOpacity(-0.9)).toBe(0); // sun at midnight
  });

  it('sun and moon trade places across the night', () => {
    const midnightSunY = skyState(0).sun[1];
    expect(discOpacity(midnightSunY)).toBe(0); // sun hidden
    expect(discOpacity(-midnightSunY)).toBe(1); // moon high
    const noonSunY = skyState(0.5).sun[1];
    expect(discOpacity(noonSunY)).toBe(1); // sun high
    expect(discOpacity(-noonSunY)).toBe(0); // moon hidden
  });
});
