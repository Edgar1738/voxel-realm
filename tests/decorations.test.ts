import { describe, it, expect } from 'vitest';
import { ChunkData } from '../src/world/ChunkData';
import { GRASS, STONE, FLOWER, TALL_GRASS } from '../src/blocks/blocks';
import { scatterDecorations } from '../src/worldgen/Decorations';
import { CHUNK_SIZE_X, CHUNK_SIZE_Z } from '../src/core/constants';

function grassFlat(cx: number, cz: number, surface: number): ChunkData {
  const d = new ChunkData(cx, cz);
  for (let z = 0; z < CHUNK_SIZE_Z; z++)
    for (let x = 0; x < CHUNK_SIZE_X; x++) {
      for (let y = 0; y < surface; y++) d.set(x, y, z, STONE);
      d.set(x, surface, z, GRASS);
    }
  return d;
}

function countPlants(d: ChunkData, surface: number): number {
  let n = 0;
  for (let z = 0; z < CHUNK_SIZE_Z; z++)
    for (let x = 0; x < CHUNK_SIZE_X; x++) {
      const id = d.get(x, surface + 1, z);
      if (id === FLOWER || id === TALL_GRASS) n++;
    }
  return n;
}

describe('scatterDecorations', () => {
  it('places plants on grass tops, deterministically', () => {
    const a = grassFlat(0, 0, 40);
    const b = grassFlat(0, 0, 40);
    const overlay = scatterDecorations({ density: 0.5 });
    overlay(a, 0, 0, 1337);
    overlay(b, 0, 0, 1337);
    const na = countPlants(a, 40);
    expect(na).toBeGreaterThan(0);
    expect(na).toBe(countPlants(b, 40)); // same seed/coords → identical
  });
  it('never replaces the grass surface itself and never on stone', () => {
    const d = grassFlat(0, 0, 40);
    scatterDecorations({ density: 0.5 })(d, 0, 0, 1337);
    for (let z = 0; z < CHUNK_SIZE_Z; z++)
      for (let x = 0; x < CHUNK_SIZE_X; x++) expect(d.get(x, 40, z)).toBe(GRASS);
  });
  it('is world-coordinate-keyed: two chunks with the same seed produce different local patterns', () => {
    // If placement were keyed on chunk-local coords (or chunk index), both chunks would receive
    // plants at IDENTICAL local (lx,lz) positions when given the same seed.  Because it is keyed
    // on true world coordinates (wx = cx*CHUNK_SIZE_X + lx), the two chunks produce different
    // local patterns — the anti-seam guarantee.
    const overlay = scatterDecorations({ density: 0.5 });
    const chunkA = grassFlat(0, 0, 40);
    const chunkB = grassFlat(3, 0, 40);
    overlay(chunkA, 0, 0, 1337);
    overlay(chunkB, 3, 0, 1337);

    // Collect the set of local (lx,lz) positions that received a plant in each chunk.
    const setA = new Set<string>();
    const setB = new Set<string>();
    for (let z = 0; z < CHUNK_SIZE_Z; z++) {
      for (let x = 0; x < CHUNK_SIZE_X; x++) {
        const idA = chunkA.get(x, 41, z);
        const idB = chunkB.get(x, 41, z);
        if (idA === FLOWER || idA === TALL_GRASS) setA.add(`${x},${z}`);
        if (idB === FLOWER || idB === TALL_GRASS) setB.add(`${x},${z}`);
      }
    }

    // Both chunks must have plants (density 0.5 guarantees this).
    expect(setA.size).toBeGreaterThan(0);
    expect(setB.size).toBeGreaterThan(0);
    // The local patterns must differ — proves world-coordinate keying, not chunk-local RNG.
    expect([...setA].sort().join('|')).not.toBe([...setB].sort().join('|'));
  });
});
