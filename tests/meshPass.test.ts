import { describe, it, expect } from 'vitest';
import { opaquePass, transparentPass } from '../src/mesh/MeshPass';
import { BlockRegistry } from '../src/blocks/BlockRegistry';
import { AIR, GRASS, STONE, WATER, GLASS } from '../src/blocks/blocks';

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

  it('includes GLASS in the transparent pass', () => {
    expect(pass.includes(GLASS)).toBe(true);
  });
  it('shows a transparent face against air, culls same-type and solid neighbors', () => {
    expect(pass.faceVisible(WATER, AIR)).toBe(true);
    expect(pass.faceVisible(WATER, WATER)).toBe(false);
    expect(pass.faceVisible(WATER, STONE)).toBe(false);
  });

  it('shows a face at a water<->glass boundary from both sides', () => {
    expect(pass.faceVisible(WATER, GLASS)).toBe(true);
    expect(pass.faceVisible(GLASS, WATER)).toBe(true);
    expect(pass.faceVisible(GLASS, GLASS)).toBe(false); // same type still culled
  });
});
