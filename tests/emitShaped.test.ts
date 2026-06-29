import { describe, it, expect } from 'vitest';
import { ChunkData } from '../src/world/ChunkData';
import { VoxelView } from '../src/world/VoxelView';
import { BlockRegistry } from '../src/blocks/BlockRegistry';
import { buildBlockTextures, type BlockDef } from '../src/blocks/blocks';
import { emitShaped, mergeMeshData } from '../src/mesh/emitShaped';

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

describe('mergeMeshData', () => {
  it('concatenates and offsets indices', () => {
    const a = {
      positions: new Float32Array([0, 0, 0, 1, 0, 0, 1, 1, 0]),
      normals: new Float32Array(9),
      uvs: new Float32Array(6),
      layers: new Float32Array(3),
      ao: new Float32Array(3),
      light: new Float32Array(3),
      indices: new Uint32Array([0, 1, 2]),
    };
    const b = {
      positions: new Float32Array([0, 0, 0, 1, 0, 0, 1, 1, 0]),
      normals: new Float32Array(9),
      uvs: new Float32Array(6),
      layers: new Float32Array(3),
      ao: new Float32Array(3),
      light: new Float32Array(3),
      indices: new Uint32Array([0, 2, 1]),
    };
    const m = mergeMeshData(a, b);
    expect(m.positions.length).toBe(18);
    expect([...m.indices]).toEqual([0, 1, 2, 3, 5, 4]); // b's indices offset by 3
  });
});
