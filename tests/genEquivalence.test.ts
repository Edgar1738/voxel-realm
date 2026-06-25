import { describe, it, expect } from 'vitest';
import { HeightmapGenerator } from '../src/worldgen/HeightmapGenerator';
import { createWorldGenerator } from '../src/worldgen/LayeredGenerator';

describe('worldgen refactor equivalence', () => {
  const original = new HeightmapGenerator();
  const pipeline = createWorldGenerator();

  it('produces byte-identical chunks to the original HeightmapGenerator', () => {
    const samples: Array<[number, number, number]> = [
      [1337, 0, 0],
      [1337, 1, 0],
      [1337, -3, 5],
      [42, 7, -7],
      [9001, -10, -10],
    ];
    for (const [seed, cx, cz] of samples) {
      const a = original.generateBaseChunk(seed, cx, cz);
      const b = pipeline.generateBaseChunk(seed, cx, cz);
      expect(Array.from(b.data)).toEqual(Array.from(a.data));
    }
  });
});
