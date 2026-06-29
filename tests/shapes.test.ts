import { describe, it, expect } from 'vitest';
import { BlockRegistry } from '../src/blocks/BlockRegistry';
import { buildBlockTextures, type BlockDef } from '../src/blocks/blocks';

const DEFS: BlockDef[] = [
  { id: 0, name: 'air', opaque: false, transparent: true },
  {
    id: 1,
    name: 'stone',
    opaque: true,
    transparent: false,
    faces: { pattern: 'stone', colors: [[128, 128, 132]] },
  },
  {
    id: 2,
    name: 'slab',
    opaque: true,
    transparent: false,
    shape: 'slab',
    faces: { pattern: 'stone', colors: [[128, 128, 132]] },
  },
  {
    id: 3,
    name: 'plant',
    opaque: false,
    transparent: false,
    shape: 'cross',
    faces: { pattern: 'speckle', colors: [[60, 140, 60]] },
  },
  {
    id: 4,
    name: 'water',
    opaque: false,
    transparent: true,
    faces: { pattern: 'speckle', colors: [[50, 110, 200]], amp: 10 },
  },
];
const reg = new BlockRegistry(DEFS, buildBlockTextures(DEFS));

describe('BlockRegistry shape/occludes/collisionBox', () => {
  it('defaults a block with no shape to cube', () => {
    expect(reg.shape(1)).toBe('cube');
  });
  it('reads explicit shapes', () => {
    expect(reg.shape(2)).toBe('slab');
    expect(reg.shape(3)).toBe('cross');
  });
  it('occludes only full opaque cubes', () => {
    expect(reg.occludes(1)).toBe(true); // opaque cube
    expect(reg.occludes(2)).toBe(false); // opaque slab — not a full cube
    expect(reg.occludes(3)).toBe(false); // non-opaque plant
    expect(reg.occludes(4)).toBe(false); // non-opaque cube (water)
  });
  it('maps shape to a collision box', () => {
    expect(reg.collisionBox(1)).toBe('full');
    expect(reg.collisionBox(2)).toBe('lowerHalf');
    expect(reg.collisionBox(3)).toBe('none');
  });
});
