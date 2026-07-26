import { describe, it, expect } from 'vitest';
import { ChunkData } from '../src/world/ChunkData';
import { VoxelView } from '../src/world/VoxelView';
import { GreedyMesher } from '../src/mesh/GreedyMesher';
import { transparentPass } from '../src/mesh/MeshPass';
import { BlockRegistry } from '../src/blocks/BlockRegistry';
import { WATER, SAND, Face } from '../src/blocks/blocks';

const reg = new BlockRegistry();
const mesher = new GreedyMesher(reg);
const PASS = transparentPass(reg);
const waterTopLayer = reg.faceLayer(WATER, Face.PosY);

interface Vert {
  x: number;
  y: number;
  z: number;
  nx: number;
  ny: number;
  nz: number;
  r: number;
  g: number;
}

function waterVerts(mesh: {
  positions: Float32Array;
  normals: Float32Array;
  layers: Float32Array;
  tint: Float32Array;
}): Vert[] {
  const out: Vert[] = [];
  for (let i = 0; i < mesh.layers.length; i++) {
    if (mesh.layers[i] !== waterTopLayer) continue;
    out.push({
      x: mesh.positions[i * 3],
      y: mesh.positions[i * 3 + 1],
      z: mesh.positions[i * 3 + 2],
      nx: mesh.normals[i * 3],
      ny: mesh.normals[i * 3 + 1],
      nz: mesh.normals[i * 3 + 2],
      r: mesh.tint[i * 3],
      g: mesh.tint[i * 3 + 1],
    });
  }
  return out;
}

describe('water surface data (depth + shore distance in the tint channel)', () => {
  it('bakes column depth into r and shore distance into g on top faces', () => {
    const c = new ChunkData(0, 0);
    // A 3-deep column at (5,·,5) beside a sand block, and an isolated 1-deep at (8,·,5).
    c.set(5, 8, 5, WATER);
    c.set(5, 9, 5, WATER);
    c.set(5, 10, 5, WATER);
    c.set(4, 10, 5, SAND);
    c.set(8, 10, 5, WATER);
    const mesh = mesher.mesh(new VoxelView(c, () => undefined), PASS);
    const tops = waterVerts(mesh).filter((v) => v.ny === 1);

    const deepShore = tops.filter((v) => v.x >= 5 && v.x <= 6 && v.z >= 5 && v.z <= 6);
    expect(deepShore.length).toBe(4);
    for (const v of deepShore) {
      expect(v.r).toBeCloseTo(3 / 7); // 3 blocks of water
      expect(v.g).toBeCloseTo(0); // sand touches the column
    }

    const shallowOpen = tops.filter((v) => v.x >= 8 && v.x <= 9 && v.z >= 5 && v.z <= 6);
    expect(shallowOpen.length).toBe(4);
    for (const v of shallowOpen) {
      expect(v.r).toBeCloseTo(1 / 7); // single block of water
      expect(v.g).toBeCloseTo(1); // no land within the 3-block ring
    }
  });

  it('keeps side faces on deep/far defaults and merges uniform open water', () => {
    const c = new ChunkData(0, 0);
    for (let x = 8; x <= 11; x++) for (let z = 8; z <= 11; z++) c.set(x, 10, z, WATER);
    const mesh = mesher.mesh(new VoxelView(c, () => undefined), PASS);
    const verts = waterVerts(mesh);

    // All 16 columns share depth 1 / shore 3, so the whole 4x4 top merges into ONE quad.
    const tops = verts.filter((v) => v.ny === 1);
    expect(tops.length).toBe(4);

    // Side faces carry the deep/far sentinel (plain deep-water look, no foam).
    const sides = verts.filter((v) => v.ny === 0);
    expect(sides.length).toBeGreaterThan(0);
    for (const v of sides) {
      expect(v.r).toBe(1);
      expect(v.g).toBe(1);
    }
  });
});
