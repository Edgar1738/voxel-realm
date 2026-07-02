import { describe, it, expect } from 'vitest';
import { ChunkData } from '../src/world/ChunkData';
import { VoxelView } from '../src/world/VoxelView';
import { BlockRegistry } from '../src/blocks/BlockRegistry';
import { buildBlockTextures, type BlockDef } from '../src/blocks/blocks';
import { emitShaped, mergeMeshData } from '../src/mesh/emitShaped';
import { WORLD_HEIGHT } from '../src/core/constants';
import type { MeshData } from '../src/mesh/MeshTypes';
import { packState } from '../src/world/VoxelState';

const stoneFaces = { pattern: 'stone' as const, colors: [[128, 128, 132] as const] };
const DEFS: BlockDef[] = [
  { id: 0, name: 'air', opaque: false, transparent: true },
  { id: 1, name: 'stone', opaque: true, transparent: false, faces: stoneFaces },
  { id: 2, name: 'slab', opaque: true, transparent: false, shape: 'slab', faces: stoneFaces },
  {
    id: 3,
    name: 'plant',
    opaque: false,
    transparent: false,
    shape: 'cross',
    faces: { pattern: 'tallGrass', colors: [[60, 140, 60]] },
  },
];
const reg = new BlockRegistry(DEFS, buildBlockTextures(DEFS));
const view = (data: ChunkData) => new VoxelView(data, () => undefined);

describe('emitShaped slabs', () => {
  it('a slab in open air emits all 6 faces (24 verts) capped at y+0.5', () => {
    const d = new ChunkData(0, 0);
    d.set(2, 10, 2, 2);
    const { slabs } = emitShaped(view(d), reg);
    expect(slabs.positions.length / 3).toBe(24); // 6 faces × 4 verts
    expect(slabs.indices.length).toBe(36); // 6 faces × 2 tris × 3
    let maxY = -Infinity;
    for (let i = 1; i < slabs.positions.length; i += 3) maxY = Math.max(maxY, slabs.positions[i]);
    expect(maxY).toBeCloseTo(10.5, 5);
  });

  it('a top slab (half bit set) occupies y+0.5..y+1', () => {
    const d = new ChunkData(0, 0);
    d.set(2, 10, 2, 2);
    d.setState(2, 10, 2, packState(0, 1));
    const { slabs } = emitShaped(view(d), reg);
    expect(slabs.positions.length / 3).toBe(24);
    let minY = Infinity;
    let maxY = -Infinity;
    for (let i = 1; i < slabs.positions.length; i += 3) {
      minY = Math.min(minY, slabs.positions[i]);
      maxY = Math.max(maxY, slabs.positions[i]);
    }
    expect(minY).toBeCloseTo(10.5, 5);
    expect(maxY).toBeCloseTo(11, 5);
  });

  it('a top slab under a full cube culls its top face (20 verts)', () => {
    const d = new ChunkData(0, 0);
    d.set(2, 10, 2, 2); // top slab
    d.setState(2, 10, 2, packState(0, 1));
    d.set(2, 11, 2, 1); // cube above
    const { slabs } = emitShaped(view(d), reg);
    expect(slabs.positions.length / 3).toBe(20); // top face culled → 5 faces
  });

  it('a slab sitting on a full cube culls its bottom face (20 verts)', () => {
    const d = new ChunkData(0, 0);
    d.set(2, 9, 2, 1); // cube below
    d.set(2, 10, 2, 2); // slab on top
    const { slabs } = emitShaped(view(d), reg);
    expect(slabs.positions.length / 3).toBe(20); // bottom face culled → 5 faces
  });
});

describe('emitShaped cross', () => {
  it('a plant emits two billboard quads (8 verts) into the cutout buffer', () => {
    const d = new ChunkData(0, 0);
    d.set(4, 12, 4, 3);
    const { cross } = emitShaped(view(d), reg);
    expect(cross.positions.length / 3).toBe(8); // 2 quads × 4 verts
    expect(cross.indices.length).toBe(12); // 2 quads × 2 tris × 3
  });
});

describe('emitShaped early-out (P3)', () => {
  it('returns empty buffers without scanning when hasShaped is false', () => {
    const d = new ChunkData(0, 0);
    d.set(2, 10, 2, 2); // a slab
    d.set(4, 12, 4, 3); // a plant (cross)
    const { slabs, cross } = emitShaped(view(d), reg, false);
    expect(slabs.positions.length).toBe(0);
    expect(slabs.indices.length).toBe(0);
    expect(cross.positions.length).toBe(0);
    expect(cross.indices.length).toBe(0);
  });

  it('emits as normal when hasShaped is true', () => {
    const d = new ChunkData(0, 0);
    d.set(2, 10, 2, 2);
    const { slabs } = emitShaped(view(d), reg, true);
    expect(slabs.positions.length / 3).toBe(24);
  });
});

function meshesEqual(a: MeshData, b: MeshData): void {
  expect(Array.from(a.positions)).toEqual(Array.from(b.positions));
  expect(Array.from(a.indices)).toEqual(Array.from(b.indices));
  expect(Array.from(a.normals)).toEqual(Array.from(b.normals));
  expect(Array.from(a.uvs)).toEqual(Array.from(b.uvs));
  expect(Array.from(a.layers)).toEqual(Array.from(b.layers));
  expect(Array.from(a.ao)).toEqual(Array.from(b.ao));
  expect(Array.from(a.light)).toEqual(Array.from(b.light));
  expect(Array.from(a.tint)).toEqual(Array.from(b.tint));
}

describe('emitShaped height cap (maxY, P-height)', () => {
  it('default maxY matches an explicit WORLD_HEIGHT-1 cap', () => {
    const d = new ChunkData(0, 0);
    d.set(2, 10, 2, 2); // slab
    d.set(4, 12, 4, 3); // plant
    const uncapped = emitShaped(view(d), reg);
    const explicit = emitShaped(view(d), reg, true, WORLD_HEIGHT - 1);
    meshesEqual(uncapped.slabs, explicit.slabs);
    meshesEqual(uncapped.cross, explicit.cross);
  });

  it('a cap at the tallest shaped voxel is identical to the uncapped mesh', () => {
    const d = new ChunkData(0, 0);
    d.set(2, 10, 2, 2); // slab well below the cap
    d.set(4, 12, 4, 3); // plant also below the cap
    const maxSolidY = 12; // matches ChunkData.maxSolidY for this chunk
    const uncapped = emitShaped(view(d), reg);
    const capped = emitShaped(view(d), reg, true, maxSolidY);
    meshesEqual(uncapped.slabs, capped.slabs);
    meshesEqual(uncapped.cross, capped.cross);
  });

  it('a cap below the tallest shaped voxel omits geometry above the cap', () => {
    const d = new ChunkData(0, 0);
    d.set(2, 10, 2, 2); // slab at y=10, above a cap of 5
    const capped = emitShaped(view(d), reg, true, 5);
    expect(capped.slabs.positions.length).toBe(0); // capped out entirely
  });
});

describe('mergeMeshData', () => {
  it('concatenates and offsets indices', () => {
    const a = {
      positions: new Float32Array([0, 0, 0, 1, 0, 0, 1, 1, 0]),
      normals: new Float32Array(9),
      uvs: new Float32Array(6),
      layers: new Float32Array(3),
      ao: new Float32Array(3),
      light: new Float32Array(3),
      tint: new Float32Array(9).fill(1),
      indices: new Uint32Array([0, 1, 2]),
    };
    const b = {
      positions: new Float32Array([0, 0, 0, 1, 0, 0, 1, 1, 0]),
      normals: new Float32Array(9),
      uvs: new Float32Array(6),
      layers: new Float32Array(3),
      ao: new Float32Array(3),
      light: new Float32Array(3),
      tint: new Float32Array(9).fill(1),
      indices: new Uint32Array([0, 2, 1]),
    };
    const m = mergeMeshData(a, b);
    expect(m.positions.length).toBe(18);
    expect([...m.indices]).toEqual([0, 1, 2, 3, 5, 4]); // b's indices offset by 3
  });
});
