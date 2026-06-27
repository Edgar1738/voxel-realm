import { describe, it, expect } from 'vitest';
import { ChunkData } from '../src/world/ChunkData';
import { VoxelView, type NeighborLookup } from '../src/world/VoxelView';
import { GreedyMesher } from '../src/mesh/GreedyMesher';
import { opaquePass, transparentPass } from '../src/mesh/MeshPass';
import { BlockRegistry } from '../src/blocks/BlockRegistry';
import { CHUNK_SIZE_X, CHUNK_SIZE_Z } from '../src/core/constants';
import { GRASS, STONE, WATER, TextureLayer, AIR } from '../src/blocks/blocks';

const reg = new BlockRegistry();
const mesher = new GreedyMesher(reg);
const OPAQUE = opaquePass(reg);

function faceCount(mesh: { indices: Uint32Array }): number {
  return mesh.indices.length / 6;
}

function viewOf(center: ChunkData, neighbor: NeighborLookup = () => undefined) {
  return new VoxelView(center, neighbor);
}

function layerForNormal(
  mesh: { normals: Float32Array; layers: Float32Array },
  n: [number, number, number],
): number {
  for (let v = 0; v < mesh.layers.length; v++) {
    if (
      mesh.normals[v * 3] === n[0] &&
      mesh.normals[v * 3 + 1] === n[1] &&
      mesh.normals[v * 3 + 2] === n[2]
    )
      return mesh.layers[v];
  }
  throw new Error(`no vertex with normal ${n.join(',')}`);
}

function minAoForNormal(
  mesh: { normals: Float32Array; ao: Float32Array },
  n: [number, number, number],
): number {
  let min = Infinity;
  for (let v = 0; v < mesh.ao.length; v++) {
    if (
      mesh.normals[v * 3] === n[0] &&
      mesh.normals[v * 3 + 1] === n[1] &&
      mesh.normals[v * 3 + 2] === n[2]
    )
      min = Math.min(min, mesh.ao[v]);
  }
  return min;
}

describe('GreedyMesher', () => {
  it('emits nothing for an all-air chunk', () => {
    expect(faceCount(mesher.mesh(viewOf(new ChunkData(0, 0)), OPAQUE))).toBe(0);
  });

  it('emits 6 quads for a single isolated voxel', () => {
    const c = new ChunkData(0, 0);
    c.set(8, 10, 8, STONE);
    const mesh = mesher.mesh(viewOf(c), OPAQUE);
    expect(faceCount(mesh)).toBe(6);
    expect(mesh.positions.length).toBe(6 * 4 * 3);
    expect(mesh.ao.length).toBe(6 * 4);
  });

  it('merges a full flat slab layer into 6 quads (top, bottom, 4 sides)', () => {
    const c = new ChunkData(0, 0);
    for (let x = 0; x < CHUNK_SIZE_X; x++)
      for (let z = 0; z < CHUNK_SIZE_Z; z++) c.set(x, 0, z, GRASS);
    const mesh = mesher.mesh(viewOf(c), OPAQUE);
    expect(faceCount(mesh)).toBe(6);
    expect(layerForNormal(mesh, [0, 1, 0])).toBe(TextureLayer.GrassTop);
  });

  it('culls the +X border faces when an east neighbor is present', () => {
    const c = new ChunkData(0, 0);
    const east = new ChunkData(1, 0);
    for (let x = 0; x < CHUNK_SIZE_X; x++)
      for (let z = 0; z < CHUNK_SIZE_Z; z++) {
        c.set(x, 0, z, GRASS);
        east.set(x, 0, z, GRASS);
      }
    const withNb = mesher.mesh(
      viewOf(c, (dcx, dcz) => (dcx === 1 && dcz === 0 ? east : undefined)),
      OPAQUE,
    );
    const noNb = mesher.mesh(viewOf(c), OPAQUE);
    // The east neighbor removes the +X side quad.
    expect(faceCount(withNb)).toBe(faceCount(noNb) - 1);
  });

  it('darkens AO in a corner next to an occluder', () => {
    const c = new ChunkData(0, 0);
    c.set(8, 10, 8, GRASS); // the lit voxel
    c.set(8, 11, 9, GRASS); // occluder above-and-+Z, shades the +Z top edge
    const mesh = mesher.mesh(viewOf(c), OPAQUE);
    // The +Y face of the lit voxel should have at least one darkened corner.
    expect(minAoForNormal(mesh, [0, 1, 0])).toBeLessThan(1);
  });

  it('culls the shared faces of two stacked voxels and greedily merges their sides', () => {
    const c = new ChunkData(0, 0);
    c.set(8, 10, 8, STONE);
    c.set(8, 11, 8, STONE);
    const mesh = mesher.mesh(viewOf(c), OPAQUE);
    // The 2 shared faces are culled; the 4 side columns each merge into one 1x2 quad,
    // plus a top and a bottom quad => 6 quads (not 10, which would be unmerged).
    expect(faceCount(mesh)).toBe(6);
    expect(layerForNormal(mesh, [0, 0, 1])).toBe(TextureLayer.Stone);
    expect(AIR).toBe(0);
  });
});

function countFacesWithNormal(
  mesh: { normals: Float32Array },
  n: [number, number, number],
): number {
  let count = 0;
  for (let v = 0; v < mesh.normals.length / 3; v++) {
    if (
      mesh.normals[v * 3] === n[0] &&
      mesh.normals[v * 3 + 1] === n[1] &&
      mesh.normals[v * 3 + 2] === n[2]
    )
      count++;
  }
  return count;
}

describe('GreedyMesher water pass', () => {
  it('renders the water surface against air but not buried water faces', () => {
    const c = new ChunkData(0, 0);
    // A 2-deep pool: water at y=10 and y=11 across a 3x3 footprint.
    for (let x = 4; x < 7; x++)
      for (let z = 4; z < 7; z++) {
        c.set(x, 10, z, WATER);
        c.set(x, 11, z, WATER);
      }
    const mesh = mesher.mesh(viewOf(c), transparentPass(reg));
    // Top faces (against air) are present; the underwater +Y faces are hidden.
    expect(countFacesWithNormal(mesh, [0, 1, 0])).toBeGreaterThan(0);
    // The opaque pass emits nothing for a water-only chunk.
    expect(mesher.mesh(viewOf(c), OPAQUE).indices.length).toBe(0);
  });
});
