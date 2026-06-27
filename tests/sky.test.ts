import { describe, it, expect } from 'vitest';
import { skyState } from '../src/render/Sky';

describe('skyState', () => {
  it('is bright at noon and dark at midnight', () => {
    const noon = skyState(0.5);
    const midnight = skyState(0);
    expect(noon.daylight).toBeGreaterThan(0.9);
    expect(midnight.daylight).toBeLessThan(0.3);
    expect(noon.sky[2]).toBeGreaterThan(midnight.sky[2]); // brighter blue at noon
  });

  it('wraps time of day', () => {
    expect(skyState(1.5)).toEqual(skyState(0.5));
    expect(skyState(-0.5)).toEqual(skyState(0.5));
  });

  it('keeps the light coming from above so shading reads', () => {
    expect(skyState(0.5).sun[1]).toBeGreaterThan(0);
    expect(skyState(0).sun[1]).toBeGreaterThan(0);
  });
});
