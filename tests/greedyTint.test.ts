import { describe, it, expect } from 'vitest';
import { ChunkData } from '../src/world/ChunkData';
import { VoxelView } from '../src/world/VoxelView';
import { GreedyMesher } from '../src/mesh/GreedyMesher';
import { BlockRegistry } from '../src/blocks/BlockRegistry';
import { opaquePass } from '../src/mesh/MeshPass';
import { GRASS, STONE } from '../src/blocks/blocks';
import { Biome } from '../src/worldgen/BiomeMap';

const reg = new BlockRegistry();
const opaque = opaquePass(reg);
const mesher = new GreedyMesher(reg);
const view = (d: ChunkData) => new VoxelView(d, () => undefined);

function topTints(biome: number, id: number): number[][] {
  const d = new ChunkData(0, 0);
  d.set(2, 1, 2, id);
  d.setBiome(2, 2, biome);
  // bake full skylight so the face emits
  for (let i = 0; i < d.skyLight.length; i++) d.skyLight[i] = 15;
  const m = mesher.mesh(view(d), opaque);
  const out: number[][] = [];
  for (let v = 0; v < m.positions.length / 3; v++) {
    if (m.normals[v * 3 + 1] === 1) out.push([m.tint[v * 3], m.tint[v * 3 + 1], m.tint[v * 3 + 2]]);
  }
  return out;
}

describe('greedy mesher tint', () => {
  it('grass top is white in Plains, non-white in Swamp', () => {
    expect(topTints(Biome.Plains, GRASS).every((t) => t[0] === 1 && t[1] === 1 && t[2] === 1)).toBe(
      true,
    );
    const swamp = topTints(Biome.Swamp, GRASS);
    expect(swamp.length).toBeGreaterThan(0);
    expect(swamp.some((t) => t[0] !== 1 || t[1] !== 1 || t[2] !== 1)).toBe(true);
  });
  it('a stone top is always white (untinted)', () => {
    expect(topTints(Biome.Swamp, STONE).every((t) => t[0] === 1 && t[1] === 1 && t[2] === 1)).toBe(
      true,
    );
  });
});

describe('greedy merge with tint', () => {
  it('same-biome grass tops merge (1 quad); different biomes split (2 quads)', () => {
    const same = new ChunkData(0, 0);
    same.set(1, 1, 1, GRASS);
    same.set(2, 1, 1, GRASS);
    for (let i = 0; i < same.skyLight.length; i++) same.skyLight[i] = 15;
    // both columns Swamp → merge
    same.setBiome(1, 1, Biome.Swamp);
    same.setBiome(2, 1, Biome.Swamp);
    const m1 = mesher.mesh(view(same), opaque);
    const topQuadsSame = countTopQuads(m1);

    const diff = new ChunkData(0, 0);
    diff.set(1, 1, 1, GRASS);
    diff.set(2, 1, 1, GRASS);
    for (let i = 0; i < diff.skyLight.length; i++) diff.skyLight[i] = 15;
    diff.setBiome(1, 1, Biome.Swamp);
    diff.setBiome(2, 1, Biome.Desert);
    const m2 = mesher.mesh(view(diff), opaque);
    expect(countTopQuads(m2)).toBe(topQuadsSame + 1); // border split
  });
});

function countTopQuads(m: {
  positions: Float32Array;
  normals: Float32Array;
  indices: Uint32Array;
}): number {
  // count PosY-facing triangles / 2
  let tris = 0;
  for (let t = 0; t < m.indices.length; t += 3) {
    const v = m.indices[t];
    if (m.normals[v * 3 + 1] === 1) tris++;
  }
  return tris / 2;
}
