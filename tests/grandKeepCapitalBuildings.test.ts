import { describe, expect, it } from 'vitest';
import { AIR, BRICK, GLASS, LANTERN, PLANKS, STONE } from '../src/blocks/blocks';
import { ChunkData } from '../src/world/ChunkData';
import { CitadelStamp } from '../src/worldgen/CitadelStamp';
import {
  garden,
  lampPost,
  pavedPlaza,
  pitchedRoof,
  timberFacade,
} from '../src/worldgen/grandKeepCapitalPrimitives';
import {
  cathedral,
  coachingInn,
  countingHouse,
  farmstead,
  guildhall,
  merchantHouse,
  roadsideChapel,
  suburbCottage,
  townhouse,
  villa,
  warehouse,
  workshop,
} from '../src/worldgen/grandKeepCapitalBuildings';

function stamp(cx = 0, cz = 0): { chunk: ChunkData; s: CitadelStamp } {
  const chunk = new ChunkData(cx, cz);
  return { chunk, s: new CitadelStamp(chunk, cx, cz) };
}

describe('capital primitives', () => {
  it('creates civic paving, lamps, gardens, pitched roofs, and timber facades', () => {
    const { chunk, s } = stamp();
    pavedPlaza(s, 1, 1, 6, 6, 20);
    lampPost(s, 2, 21, 2);
    garden(s, 8, 8, 14, 14, 20);
    pitchedRoof(s, 1, 8, 6, 13, 30, 'x');
    timberFacade(s, 1, 21, 1, 6, 27, 'south');

    expect(chunk.get(3, 20, 3)).toBe(STONE);
    expect(chunk.get(2, 24, 2)).toBe(LANTERN);
    expect(chunk.get(11, 21, 11)).not.toBe(AIR);
    expect(chunk.get(3, 32, 10)).toBe(BRICK);
    expect(chunk.get(3, 23, 1)).toBe(GLASS);
  });

  it('clips seamlessly at chunk borders', () => {
    const left = stamp(0, 0);
    const right = stamp(1, 0);
    pitchedRoof(left.s, 13, 2, 18, 8, 30, 'x');
    pitchedRoof(right.s, 13, 2, 18, 8, 30, 'x');
    expect(left.chunk.get(15, 31, 5)).toBe(BRICK);
    expect(right.chunk.get(0, 31, 5)).toBe(BRICK);
  });
});

describe('capital buildings', () => {
  it('preserves the upper-storey floor after hollowing the house interior', () => {
    const { chunk, s } = stamp();
    merchantHouse(s, 2, 21, 2);

    expect(chunk.get(5, 24, 5)).toBe(PLANKS);
    expect(chunk.get(5, 23, 5)).toBe(AIR);
  });

  it('exports deterministic high-medieval district builders', () => {
    const first = stamp();
    const second = stamp();
    const builders = [
      merchantHouse,
      townhouse,
      coachingInn,
      guildhall,
      countingHouse,
      cathedral,
      workshop,
      warehouse,
      villa,
      suburbCottage,
      roadsideChapel,
      farmstead,
    ];
    builders.forEach((build, i) => {
      const x = (i % 3) * 5;
      const z = Math.floor(i / 3) * 4;
      build(first.s, x, 21, z);
      build(second.s, x, 21, z);
    });
    expect(Array.from(first.chunk.data)).toEqual(Array.from(second.chunk.data));
    expect(Array.from(first.chunk.data).filter((id) => id !== AIR).length).toBeGreaterThan(300);
    expect(Array.from(first.chunk.data)).toContain(PLANKS);
    expect(Array.from(first.chunk.data)).toContain(GLASS);
  });
});
