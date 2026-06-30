import { describe, it, expect } from 'vitest';
import { ChunkData } from '../src/world/ChunkData';
import { VoxelView } from '../src/world/VoxelView';
import { BlockRegistry } from '../src/blocks/BlockRegistry';
import { emitShaped, mergeMeshData } from '../src/mesh/emitShaped';
import { TALL_GRASS, STONE_SLAB } from '../src/blocks/blocks';
import { Biome } from '../src/worldgen/BiomeMap';

const reg = new BlockRegistry();
const view = (d: ChunkData) => new VoxelView(d, () => undefined);

describe('emitShaped tint', () => {
  it('tint length matches vertex count for both meshes', () => {
    const d = new ChunkData(0, 0);
    d.set(4, 1, 4, STONE_SLAB);
    d.set(5, 1, 5, TALL_GRASS);
    const { slabs, cross } = emitShaped(view(d), reg);
    expect(slabs.tint.length).toBe(slabs.positions.length);
    expect(cross.tint.length).toBe(cross.positions.length);
  });
  it('a slab box is white; a tall-grass cross tints by biome', () => {
    const d = new ChunkData(0, 0);
    d.set(4, 1, 4, STONE_SLAB);
    d.set(5, 1, 5, TALL_GRASS);
    d.setBiome(5, 5, Biome.Swamp);
    const { slabs, cross } = emitShaped(view(d), reg);
    expect([...slabs.tint].every((v) => v === 1)).toBe(true);
    expect([...cross.tint].some((v) => v !== 1)).toBe(true);
  });
  it('mergeMeshData preserves tint length', () => {
    const d = new ChunkData(0, 0);
    d.set(4, 1, 4, STONE_SLAB);
    const { slabs, cross } = emitShaped(view(d), reg);
    const merged = mergeMeshData(slabs, cross);
    expect(merged.tint.length).toBe(merged.positions.length);
  });
});
