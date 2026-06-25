import { describe, it, expect } from 'vitest';
import { ChunkData } from '../src/world/ChunkData';
import { BasicMesher } from '../src/mesh/BasicMesher';
import { BlockRegistry } from '../src/blocks/BlockRegistry';
import { GRASS, STONE, TextureLayer } from '../src/blocks/blocks';

const reg = new BlockRegistry();
const mesher = new BasicMesher(reg);

/** Vertices per face = 4; the mesher emits 6 indices (two triangles) per face. */
function faceCount(mesh: { indices: Uint32Array }): number {
  return mesh.indices.length / 6;
}

function layerForNormal(
  mesh: { normals: Float32Array; layers: Float32Array },
  n: [number, number, number],
): number {
  for (let v = 0; v < mesh.layers.length; v++) {
    const nx = mesh.normals[v * 3];
    const ny = mesh.normals[v * 3 + 1];
    const nz = mesh.normals[v * 3 + 2];
    if (nx === n[0] && ny === n[1] && nz === n[2]) return mesh.layers[v];
  }
  throw new Error(`no vertex with normal ${n.join(',')}`);
}

describe('BasicMesher', () => {
  it('emits 6 faces for a single isolated voxel', () => {
    const c = new ChunkData(0, 0);
    c.set(8, 10, 8, STONE);
    const mesh = mesher.mesh(c);
    expect(faceCount(mesh)).toBe(6);
    expect(mesh.positions.length).toBe(6 * 4 * 3);
    expect(mesh.normals.length).toBe(6 * 4 * 3);
    expect(mesh.uvs.length).toBe(6 * 4 * 2);
    expect(mesh.layers.length).toBe(6 * 4);
  });

  it('culls the shared face between two adjacent voxels (10 faces, not 12)', () => {
    const c = new ChunkData(0, 0);
    c.set(8, 10, 8, STONE);
    c.set(9, 10, 8, STONE);
    const mesh = mesher.mesh(c);
    expect(faceCount(mesh)).toBe(10);
  });

  it('emits nothing for an all-air chunk', () => {
    const c = new ChunkData(0, 0);
    const mesh = mesher.mesh(c);
    expect(faceCount(mesh)).toBe(0);
  });

  it('uses grass-top layer on the +Y face and grass-side on a side face', () => {
    const c = new ChunkData(0, 0);
    c.set(8, 10, 8, GRASS);
    const mesh = mesher.mesh(c);
    expect(layerForNormal(mesh, [0, 1, 0])).toBe(TextureLayer.GrassTop);
    expect(layerForNormal(mesh, [1, 0, 0])).toBe(TextureLayer.GrassSide);
  });
});
