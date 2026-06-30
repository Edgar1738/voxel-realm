import { describe, it, expect } from 'vitest';
import { BlockRegistry } from '../src/blocks/BlockRegistry';
import { Face, GRASS, LEAVES, STONE, TALL_GRASS } from '../src/blocks/blocks';

const reg = new BlockRegistry();

describe('registry.tintCategory', () => {
  it('grass tints only its top face', () => {
    expect(reg.tintCategory(GRASS, Face.PosY)).toBe('grass');
    expect(reg.tintCategory(GRASS, Face.NegY)).toBeUndefined();
    expect(reg.tintCategory(GRASS, Face.PosX)).toBeUndefined();
  });
  it('leaves tint on every face; tall grass is foliage', () => {
    expect(reg.tintCategory(LEAVES, Face.PosX)).toBe('foliage');
    expect(reg.tintCategory(LEAVES, Face.NegY)).toBe('foliage');
    expect(reg.tintCategory(TALL_GRASS, Face.PosY)).toBe('foliage');
  });
  it('untinted blocks return undefined', () => {
    expect(reg.tintCategory(STONE, Face.PosY)).toBeUndefined();
  });
});
