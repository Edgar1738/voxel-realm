// tests/blockRegistry.test.ts
import { describe, it, expect } from 'vitest';
import { BlockRegistry } from '../src/blocks/BlockRegistry';
import { GRASS, AIR, Face } from '../src/blocks/blocks';

describe('BlockRegistry', () => {
  const reg = new BlockRegistry();
  it('resolves a known face to a derived layer', () => {
    const top = reg.faceLayer(GRASS, Face.PosY);
    const bottom = reg.faceLayer(GRASS, Face.NegY);
    expect(Number.isInteger(top)).toBe(true);
    expect(top).toBeGreaterThanOrEqual(0);
    expect(top).toBeLessThan(reg.layerCount);
    expect(Number.isInteger(bottom)).toBe(true);
    expect(bottom).toBeGreaterThanOrEqual(0);
    expect(bottom).toBeLessThan(reg.layerCount);
    expect(top).not.toBe(bottom); // grass top (grass) and bottom (dirt) are different textures
  });
  it('throws faceLayer on AIR (no faces)', () => {
    expect(() => reg.faceLayer(AIR, Face.PosY)).toThrow();
  });
  it('reports emission and opacity from the table', () => {
    expect(reg.isOpaque(GRASS)).toBe(true);
    expect(reg.emission(AIR)).toBe(0);
  });
});
