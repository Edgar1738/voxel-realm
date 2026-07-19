import { describe, it, expect } from 'vitest';
import { BlockRegistry } from '../src/blocks/BlockRegistry';
import { buildBlockTextures, type BlockDef } from '../src/blocks/blocks';
import { lavaPass, opaquePass, transparentPass, waterPass } from '../src/mesh/MeshPass';
import { AIR, GRASS, STONE, WATER, GLASS, LAVA } from '../src/blocks/blocks';

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
  it('includes glass-like blocks, excluding liquids, air, and opaque solids', () => {
    expect(pass.includes(WATER)).toBe(false);
    expect(pass.includes(LAVA)).toBe(false);
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

describe('liquid passes', () => {
  it('keeps water and lava in separate material buckets', () => {
    const water = waterPass(reg);
    const lava = lavaPass(reg);
    expect(water.includes(WATER)).toBe(true);
    expect(water.includes(LAVA)).toBe(false);
    expect(lava.includes(LAVA)).toBe(true);
    expect(lava.includes(WATER)).toBe(false);
  });
});

// --- Shape-aware tests (Task 2) ---

const stoneFaces = {
  pattern: 'stone' as const,
  colors: [[128, 128, 132]] as [number, number, number][],
};
const DEFS: BlockDef[] = [
  { id: 0, name: 'air', opaque: false, transparent: true },
  { id: 1, name: 'stone', opaque: true, transparent: false, faces: stoneFaces },
  { id: 2, name: 'slab', opaque: true, transparent: false, shape: 'slab', faces: stoneFaces },
  {
    id: 3,
    name: 'glass',
    opaque: false,
    transparent: true,
    faces: { pattern: 'glass' as const, colors: [[205, 232, 240]] as [number, number, number][] },
  },
  {
    id: 4,
    name: 'plant',
    opaque: false,
    transparent: false,
    shape: 'cross',
    faces: { pattern: 'grassTop' as const, colors: [[60, 140, 60]] as [number, number, number][] },
  },
];
const reg2 = new BlockRegistry(DEFS, buildBlockTextures(DEFS));
const op = opaquePass(reg2);
const tp = transparentPass(reg2);

describe('opaquePass (shape-aware)', () => {
  it('greedy-meshes only full cubes (not slabs)', () => {
    expect(op.includes(1)).toBe(true);
    expect(op.includes(2)).toBe(false); // slab emitted separately
  });
  it('shows a cube face against a non-occluding slab', () => {
    expect(op.faceVisible(1, 2)).toBe(true); // cube next to slab → face visible
    expect(op.faceVisible(1, 1)).toBe(false); // cube next to cube → culled
    expect(op.faceVisible(1, 0)).toBe(true); // cube next to air → visible
  });
});

describe('transparentPass (shape-aware)', () => {
  it('includes transparent cubes but never non-cube shapes', () => {
    expect(tp.includes(3)).toBe(true); // glass cube
    expect(tp.includes(4)).toBe(false); // plant is non-cube → not in transparent cube pass
    expect(tp.includes(1)).toBe(false); // opaque cube
  });
});
