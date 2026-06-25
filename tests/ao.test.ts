import { describe, it, expect } from 'vitest';
import { vertexAO, aoBrightness } from '../src/mesh/Ao';

describe('vertexAO', () => {
  it('is fully occluded (0) when both sides are solid', () => {
    expect(vertexAO(1, 1, 0)).toBe(0);
    expect(vertexAO(1, 1, 1)).toBe(0);
  });

  it('is unoccluded (3) with no neighbors', () => {
    expect(vertexAO(0, 0, 0)).toBe(3);
  });

  it('decreases with each occluder', () => {
    expect(vertexAO(1, 0, 0)).toBe(2);
    expect(vertexAO(0, 1, 0)).toBe(2);
    expect(vertexAO(0, 0, 1)).toBe(2);
    expect(vertexAO(1, 0, 1)).toBe(1);
  });
});

describe('aoBrightness', () => {
  it('maps occlusion levels to an increasing brightness ramp in (0,1]', () => {
    const ramp = [0, 1, 2, 3].map(aoBrightness);
    expect(ramp[0]).toBeGreaterThan(0);
    expect(ramp[3]).toBe(1);
    for (let i = 1; i < ramp.length; i++) expect(ramp[i]).toBeGreaterThan(ramp[i - 1]);
  });
});
