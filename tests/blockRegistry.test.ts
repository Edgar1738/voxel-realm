// tests/blockRegistry.test.ts
import { describe, it, expect } from 'vitest';
import { BlockRegistry } from '../src/blocks/BlockRegistry';
import { GRASS, AIR, Face } from '../src/blocks/blocks';
import type { BlockDef, BlockTextures } from '../src/blocks/blocks';

function texturesFor(defs: BlockDef[]): BlockTextures {
  // minimal: every non-air def resolves to 6 layer-0 faces
  const faceLayers = new Map<number, number[]>();
  for (const d of defs) if (d.faces) faceLayers.set(d.id, [0, 0, 0, 0, 0, 0]);
  return { uniqueSpecs: [{ pattern: 'stone', colors: [[1, 2, 3]] }], faceLayers, layerCount: 1 };
}

describe('BlockRegistry self-check (injected defs)', () => {
  it('throws on a block id outside 0..255', () => {
    const defs: BlockDef[] = [
      {
        id: 300,
        name: 'big',
        opaque: true,
        transparent: false,
        faces: { pattern: 'stone', colors: [[1, 2, 3]] },
      },
    ];
    expect(() => new BlockRegistry(defs, texturesFor(defs))).toThrow(/0\.\.255|range/i);
  });
  it('throws on light outside 0..15', () => {
    const defs: BlockDef[] = [
      {
        id: 1,
        name: 'x',
        opaque: true,
        transparent: false,
        light: 99,
        faces: { pattern: 'stone', colors: [[1, 2, 3]] },
      },
    ];
    expect(() => new BlockRegistry(defs, texturesFor(defs))).toThrow(/light/i);
  });
  it('throws on a duplicate id', () => {
    const defs: BlockDef[] = [
      {
        id: 1,
        name: 'a',
        opaque: true,
        transparent: false,
        faces: { pattern: 'stone', colors: [[1, 2, 3]] },
      },
      {
        id: 1,
        name: 'b',
        opaque: true,
        transparent: false,
        faces: { pattern: 'stone', colors: [[1, 2, 3]] },
      },
    ];
    expect(() => new BlockRegistry(defs, texturesFor(defs))).toThrow(/duplicate/i);
  });
});

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
