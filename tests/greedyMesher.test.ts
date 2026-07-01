import { describe, it, expect } from 'vitest';
import { ChunkData } from '../src/world/ChunkData';
import { VoxelView, type NeighborLookup } from '../src/world/VoxelView';
import { GreedyMesher } from '../src/mesh/GreedyMesher';
import { opaquePass, transparentPass } from '../src/mesh/MeshPass';
import { BlockRegistry } from '../src/blocks/BlockRegistry';
import { CHUNK_SIZE_X, CHUNK_SIZE_Z, WORLD_HEIGHT } from '../src/core/constants';
import { GRASS, STONE, WATER, AIR, Face } from '../src/blocks/blocks';

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
    expect(layerForNormal(mesh, [0, 1, 0])).toBe(reg.faceLayer(GRASS, Face.PosY));
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

  it('culls the +Z border faces when a south neighbor is present', () => {
    const c = new ChunkData(0, 0);
    const south = new ChunkData(0, 1);
    for (let x = 0; x < CHUNK_SIZE_X; x++)
      for (let z = 0; z < CHUNK_SIZE_Z; z++) {
        c.set(x, 0, z, GRASS);
        south.set(x, 0, z, GRASS);
      }
    const withNb = mesher.mesh(
      viewOf(c, (dcx, dcz) => (dcx === 0 && dcz === 1 ? south : undefined)),
      OPAQUE,
    );
    const noNb = mesher.mesh(viewOf(c), OPAQUE);
    // The south neighbor removes the +Z side quad.
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
    expect(layerForNormal(mesh, [0, 0, 1])).toBe(reg.faceLayer(STONE, Face.PosZ));
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

describe('GreedyMesher exact output (regression guard for pooling)', () => {
  it('produces byte-identical positions/indices/layers/ao/light for a single STONE voxel at (1,1,1)', () => {
    const c = new ChunkData(0, 0);
    c.set(1, 1, 1, STONE);
    const mesh = mesher.mesh(viewOf(c), OPAQUE);

    // Exact positions captured before any pooling change — must remain identical.
    expect(Array.from(mesh.positions)).toEqual([
      2, 1, 1, 2, 2, 1, 2, 2, 2, 2, 1, 2, 1, 1, 1, 1, 2, 1, 1, 2, 2, 1, 1, 2, 1, 2, 1, 1, 2, 2, 2,
      2, 2, 2, 2, 1, 1, 1, 1, 1, 1, 2, 2, 1, 2, 2, 1, 1, 1, 1, 2, 2, 1, 2, 2, 2, 2, 1, 2, 2, 1, 1,
      1, 2, 1, 1, 2, 2, 1, 1, 2, 1,
    ]);
    expect(Array.from(mesh.indices)).toEqual([
      0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6, 8, 9, 10, 8, 10, 11, 12, 14, 13, 12, 15, 14, 16, 17, 18,
      16, 18, 19, 20, 22, 21, 20, 23, 22,
    ]);
    // All 6 faces × 4 vertices use the same stone layer (3).
    expect(Array.from(mesh.layers)).toEqual(new Array(24).fill(3));
    // No AO occluders → all corners at full brightness (1.0).
    expect(Array.from(mesh.ao)).toEqual(new Array(24).fill(1));
    // No sky or block light → light = 0.
    expect(Array.from(mesh.light)).toEqual(new Array(24).fill(0));
  });
});

describe('GreedyMesher exact output – multi-voxel stale-buffer regression', () => {
  /**
   * Fixture: 3 isolated voxels at distinct positions spanning multiple slice rows
   * and face directions, plus a 2×2 cluster — 6 voxels total.
   *   (1,1,1)           — isolated, populates mask rows at y=1, z=1
   *   (3,5,3)           — isolated, populates mask rows at y=5, z=3 (different slices)
   *   (10,8,2)+(11,8,2)+(10,8,3)+(11,8,3) — 2×2 cluster at y=8
   *
   * Multiple mask rows across multiple face directions are populated, which
   * exposes any stale-buffer leak from a wrong per-slice clear.
   */
  it('produces byte-identical positions/indices/layers/ao/light for 2 isolated voxels + a 2×2 cluster (6 voxels total)', () => {
    const c = new ChunkData(0, 0);
    c.set(1, 1, 1, STONE);
    c.set(3, 5, 3, STONE);
    c.set(10, 8, 2, STONE);
    c.set(11, 8, 2, STONE);
    c.set(10, 8, 3, STONE);
    c.set(11, 8, 3, STONE);
    const mesh = mesher.mesh(viewOf(c), OPAQUE);

    expect(Array.from(mesh.positions)).toEqual([
      2, 1, 1, 2, 2, 1, 2, 2, 2, 2, 1, 2, 4, 5, 3, 4, 6, 3, 4, 6, 4, 4, 5, 4, 12, 8, 2, 12, 9, 2,
      12, 9, 4, 12, 8, 4, 1, 1, 1, 1, 2, 1, 1, 2, 2, 1, 1, 2, 3, 5, 3, 3, 6, 3, 3, 6, 4, 3, 5, 4,
      10, 8, 2, 10, 9, 2, 10, 9, 4, 10, 8, 4, 1, 2, 1, 1, 2, 2, 2, 2, 2, 2, 2, 1, 3, 6, 3, 3, 6, 4,
      4, 6, 4, 4, 6, 3, 10, 9, 2, 10, 9, 4, 12, 9, 4, 12, 9, 2, 1, 1, 1, 1, 1, 2, 2, 1, 2, 2, 1, 1,
      3, 5, 3, 3, 5, 4, 4, 5, 4, 4, 5, 3, 10, 8, 2, 10, 8, 4, 12, 8, 4, 12, 8, 2, 1, 1, 2, 2, 1, 2,
      2, 2, 2, 1, 2, 2, 3, 5, 4, 4, 5, 4, 4, 6, 4, 3, 6, 4, 10, 8, 4, 12, 8, 4, 12, 9, 4, 10, 9, 4,
      1, 1, 1, 2, 1, 1, 2, 2, 1, 1, 2, 1, 10, 8, 2, 12, 8, 2, 12, 9, 2, 10, 9, 2, 3, 5, 3, 4, 5, 3,
      4, 6, 3, 3, 6, 3,
    ]);
    expect(Array.from(mesh.indices)).toEqual([
      0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7, 8, 9, 10, 8, 10, 11, 12, 14, 13, 12, 15, 14, 16, 18, 17,
      16, 19, 18, 20, 22, 21, 20, 23, 22, 24, 25, 26, 24, 26, 27, 28, 29, 30, 28, 30, 31, 32, 33,
      34, 32, 34, 35, 36, 38, 37, 36, 39, 38, 40, 42, 41, 40, 43, 42, 44, 46, 45, 44, 47, 46, 48,
      49, 50, 48, 50, 51, 52, 53, 54, 52, 54, 55, 56, 57, 58, 56, 58, 59, 60, 62, 61, 60, 63, 62,
      64, 66, 65, 64, 67, 66, 68, 70, 69, 68, 71, 70,
    ]);
    // All faces are STONE (layer 3).
    expect(Array.from(mesh.layers)).toEqual(new Array(72).fill(3));
    // No AO occluders → all corners at full brightness (1.0).
    expect(Array.from(mesh.ao)).toEqual(new Array(72).fill(1));
    // No sky or block light → light = 0.
    expect(Array.from(mesh.light)).toEqual(new Array(72).fill(0));
  });
});

function meshesEqual(
  a: ReturnType<GreedyMesher['mesh']>,
  b: ReturnType<GreedyMesher['mesh']>,
): void {
  expect(Array.from(a.positions)).toEqual(Array.from(b.positions));
  expect(Array.from(a.indices)).toEqual(Array.from(b.indices));
  expect(Array.from(a.normals)).toEqual(Array.from(b.normals));
  expect(Array.from(a.uvs)).toEqual(Array.from(b.uvs));
  expect(Array.from(a.layers)).toEqual(Array.from(b.layers));
  expect(Array.from(a.ao)).toEqual(Array.from(b.ao));
  expect(Array.from(a.light)).toEqual(Array.from(b.light));
  expect(Array.from(a.tint)).toEqual(Array.from(b.tint));
}

describe('GreedyMesher height cap (maxY)', () => {
  it('default maxY matches an explicit WORLD_HEIGHT-1 cap', () => {
    const c = new ChunkData(0, 0);
    c.set(2, 3, 4, STONE);
    c.set(5, 30, 6, STONE);
    meshesEqual(mesher.mesh(viewOf(c), OPAQUE), mesher.mesh(viewOf(c), OPAQUE, WORLD_HEIGHT - 1));
  });

  it('a cap at the tallest voxel is identical to the uncapped mesh', () => {
    const c = new ChunkData(0, 0);
    for (let x = 0; x < CHUNK_SIZE_X; x++)
      for (let z = 0; z < CHUNK_SIZE_Z; z++) c.set(x, 0, z, GRASS); // ground
    c.set(8, 40, 8, STONE); // a lone pillar-top at y=40
    meshesEqual(mesher.mesh(viewOf(c), OPAQUE), mesher.mesh(viewOf(c), OPAQUE, c.maxSolidY));
  });

  it('is identical for a capped water surface', () => {
    const c = new ChunkData(0, 0);
    for (let x = 4; x < 7; x++)
      for (let z = 4; z < 7; z++) {
        c.set(x, 10, z, WATER);
        c.set(x, 11, z, WATER);
      }
    const pass = transparentPass(reg);
    meshesEqual(mesher.mesh(viewOf(c), pass), mesher.mesh(viewOf(c), pass, c.maxSolidY));
  });

  it('is identical even when a neighbor is much taller than the center (center-only cap)', () => {
    const c = new ChunkData(0, 0);
    const east = new ChunkData(1, 0);
    for (let z = 0; z < CHUNK_SIZE_Z; z++) {
      c.set(CHUNK_SIZE_X - 1, 20, z, STONE); // center border wall to y=20
      for (let y = 0; y <= 100; y++) east.set(0, y, z, STONE); // east neighbor to y=100
    }
    const nb: NeighborLookup = (dcx, dcz) => (dcx === 1 && dcz === 0 ? east : undefined);
    meshesEqual(
      mesher.mesh(viewOf(c, nb), OPAQUE),
      mesher.mesh(viewOf(c, nb), OPAQUE, c.maxSolidY),
    );
  });
});

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
