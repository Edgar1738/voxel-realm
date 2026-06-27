import { describe, it, expect } from 'vitest';
import { ChunkDeltas } from '../src/persistence/ChunkDeltas';
import { ChunkData } from '../src/world/ChunkData';
import { voxelIndex } from '../src/core/coords';
import { STONE, GRASS, AIR } from '../src/blocks/blocks';

describe('ChunkDeltas', () => {
  it('applies recorded edits to a matching chunk only', () => {
    const deltas = new ChunkDeltas();
    deltas.record(0, 0, voxelIndex(1, 2, 3), STONE);
    const chunk = new ChunkData(0, 0);
    deltas.applyTo(chunk);
    expect(chunk.get(1, 2, 3)).toBe(STONE);

    const other = new ChunkData(1, 0);
    deltas.applyTo(other);
    expect(other.get(1, 2, 3)).toBe(AIR); // different chunk untouched
  });

  it('keeps the latest value per voxel', () => {
    const deltas = new ChunkDeltas();
    const idx = voxelIndex(0, 0, 0);
    deltas.record(0, 0, idx, STONE);
    deltas.record(0, 0, idx, GRASS);
    const chunk = new ChunkData(0, 0);
    deltas.applyTo(chunk);
    expect(chunk.get(0, 0, 0)).toBe(GRASS);
  });

  it('round-trips through serialize/load', () => {
    const a = new ChunkDeltas();
    a.record(0, 0, voxelIndex(2, 3, 4), STONE);
    a.record(-1, 5, voxelIndex(0, 1, 0), GRASS);
    const b = new ChunkDeltas();
    b.load(a.serialize());

    const c1 = new ChunkData(0, 0);
    b.applyTo(c1);
    expect(c1.get(2, 3, 4)).toBe(STONE);
    const c2 = new ChunkData(-1, 5);
    b.applyTo(c2);
    expect(c2.get(0, 1, 0)).toBe(GRASS);
  });
});
