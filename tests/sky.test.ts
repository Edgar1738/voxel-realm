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

  it('sun rises at 0.25, peaks at noon, sets at 0.75, and is below the horizon at night', () => {
    expect(skyState(0.25).sun[1]).toBeCloseTo(0, 6);
    expect(skyState(0.5).sun[1]).toBeGreaterThan(0.8);
    expect(skyState(0.75).sun[1]).toBeCloseTo(0, 6);
    expect(skyState(0).sun[1]).toBeLessThan(-0.8);
    // Rises in +X, sets in -X.
    expect(skyState(0.25).sun[0]).toBeGreaterThan(0.9);
    expect(skyState(0.75).sun[0]).toBeLessThan(-0.9);
  });

  it('keeps the shading light above the horizon (moon takes over at night)', () => {
    for (let i = 0; i < 24; i++) {
      expect(skyState(i / 24).light[1]).toBeGreaterThanOrEqual(0);
    }
    // At midnight the moon rides the sun's noon position.
    const midnight = skyState(0);
    expect(midnight.light[1]).toBeGreaterThan(0.8);
    expect(midnight.light[0]).toBeCloseTo(-midnight.sun[0], 6);
  });

  it('fades directional shading out across twilight and softens it under moonlight', () => {
    expect(skyState(0.5).dirStrength).toBe(1);
    expect(skyState(0.25).dirStrength).toBeCloseTo(0, 12);
    expect(skyState(0.75).dirStrength).toBeCloseTo(0, 12);
    const midnight = skyState(0).dirStrength;
    expect(midnight).toBeGreaterThan(0.4);
    expect(midnight).toBeLessThan(1); // moonlight models softer than sun
  });

  it('tints the light warm at golden hour, white at noon, cool under the moon', () => {
    const golden = skyState(0.28).lightColor; // low morning sun
    expect(golden[0]).toBeGreaterThan(golden[2]);
    const noon = skyState(0.5).lightColor;
    expect(noon[0]).toBeCloseTo(1, 6);
    expect(noon[1]).toBeCloseTo(1, 6);
    expect(noon[2]).toBeCloseTo(1, 6);
    const moon = skyState(0).lightColor;
    expect(moon[2]).toBeGreaterThan(moon[0]);
  });
});
