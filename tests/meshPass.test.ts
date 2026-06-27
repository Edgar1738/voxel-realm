import { describe, it, expect } from 'vitest';
import { opaquePass, transparentPass } from '../src/mesh/MeshPass';
import { BlockRegistry } from '../src/blocks/BlockRegistry';
import { AIR, GRASS, STONE, WATER } from '../src/blocks/blocks';

const reg = new BlockRegistry();

describe('opaquePass', () => {
  const pass = opaquePass(reg);
  it('includes opaque blocks, excludes air and water', () => {
    expect(pass.includes(STONE)).toBe(true);
    expect(pass.includes(AIR)).toBe(false);
    expect(pass.includes(WATER)).toBe(false);
  });
  it('shows a face against any non-opaque neighbor (air or water)', () => {
    expect(pass.faceVisible(STONE, AIR)).toBe(true);
    expect(pass.faceVisible(STONE, WATER)).toBe(true);
    expect(pass.faceVisible(STONE, GRASS)).toBe(false);
  });
});

describe('transparentPass', () => {
  const pass = transparentPass(reg);
  it('includes transparent blocks, excludes air and opaque solids', () => {
    expect(pass.includes(WATER)).toBe(true);
    expect(pass.includes(STONE)).toBe(false);
    expect(pass.includes(AIR)).toBe(false);
  });
  it('shows a transparent face only against air', () => {
    expect(pass.faceVisible(WATER, AIR)).toBe(true);
    expect(pass.faceVisible(WATER, WATER)).toBe(false);
    expect(pass.faceVisible(WATER, STONE)).toBe(false);
  });
});
