import { describe, expect, it } from 'vitest';
import {
  AIR,
  BOOKSHELF,
  BRICK,
  COBBLESTONE,
  FURNACE,
  GLASS,
  GRAVEL,
  PLANKS,
  STONE,
  WOOD,
} from '../src/blocks/blocks';
import { CHUNK_SIZE_X, CHUNK_SIZE_Z } from '../src/core/constants';
import { ChunkData } from '../src/world/ChunkData';
import { CitadelStamp } from '../src/worldgen/CitadelStamp';
import { G } from '../src/worldgen/grandKeepFrame';
import { buildCapitalDistricts } from '../src/worldgen/grandKeepCapitalDistricts';
import { buildCapitalExpansion } from '../src/worldgen/grandKeepCapital';
import { buildCapitalSuburbs } from '../src/worldgen/grandKeepSuburbs';

type Builder = (s: CitadelStamp) => void;

function sampler(builder: Builder): (x: number, y: number, z: number) => number {
  const chunks = new Map<string, ChunkData>();
  return (x, y, z) => {
    const cx = Math.floor(x / CHUNK_SIZE_X);
    const cz = Math.floor(z / CHUNK_SIZE_Z);
    const key = `${cx},${cz}`;
    let chunk = chunks.get(key);
    if (!chunk) {
      chunk = new ChunkData(cx, cz);
      builder(new CitadelStamp(chunk, cx, cz));
      chunks.set(key, chunk);
    }
    return chunk.get(x - cx * CHUNK_SIZE_X, y, z - cz * CHUNK_SIZE_Z);
  };
}

const isPaving = (id: number): boolean => [STONE, COBBLESTONE, GRAVEL].includes(id);

describe('Grand Keep capital districts', () => {
  const at = sampler(buildCapitalDistricts);

  it('keeps the nine-wide Grand Avenue clear from the royal south gate to the old town', () => {
    for (const z of [-215, -190, -160, -130, -105]) {
      expect(isPaving(at(4, G, z))).toBe(true);
      expect(isPaving(at(12, G, z))).toBe(true);
      expect(at(8, G + 2, z)).toBe(AIR);
    }
  });

  it('creates Crown Market south of the historic wall with civic anchors', () => {
    expect(isPaving(at(45, G, -120))).toBe(true);
    expect(at(45, G + 1, -120)).not.toBe(AIR); // market cross / fountain
    expect([BRICK, STONE, COBBLESTONE]).toContain(at(64, G + 2, -128)); // guildhall
    expect([BRICK, STONE, COBBLESTONE]).toContain(at(64, G + 2, -104)); // counting house
  });

  it('distinguishes the coaching, artisan, merchant, and warehouse quarters', () => {
    expect([WOOD, PLANKS, BRICK, STONE]).toContain(at(-65, G + 2, -180));
    expect(at(-165, G + 2, -60)).toBe(FURNACE);
    expect([BRICK, GLASS, BOOKSHELF, WOOD]).toContain(at(145, G + 2, -45));
    expect([BRICK, STONE, PLANKS]).toContain(at(180, G + 2, 45));
  });

  it('provides cathedral, northern residential, and southwest villa landmarks', () => {
    expect([BRICK, STONE, GLASS]).toContain(at(132, G + 5, 126));
    expect([BRICK, PLANKS, WOOD, GLASS]).toContain(at(-55, G + 2, 185));
    expect([BRICK, PLANKS, WOOD, GLASS]).toContain(at(-185, G + 2, 105));
  });

  it('preserves cardinal sky-tower and bridge support corridors', () => {
    for (const [x, z] of [
      [8, -125],
      [8, 165],
      [-137, 20],
      [153, 20],
    ]) {
      expect(at(x, G + 2, z)).toBe(AIR);
    }
  });

  it('connects the east and west gates continuously to the civic axis', () => {
    for (const x of [-232, -210, -180, -150, 150, 180, 210, 248]) {
      expect(isPaving(at(x, G, 20)), `paving at x=${x}`).toBe(true);
      expect(at(x, G + 2, 20), `headroom at x=${x}`).toBe(AIR);
    }
  });
});

describe('Grand Keep extramural growth', () => {
  const at = sampler(buildCapitalSuburbs);

  it('builds an unprotected south ribbon along the continuation of Grand Avenue', () => {
    expect(isPaving(at(8, G, -270))).toBe(true);
    expect([BRICK, PLANKS, WOOD, STONE]).toContain(at(-18, G + 2, -260));
    expect([BRICK, PLANKS, WOOD, STONE]).toContain(at(28, G + 2, -285));
  });

  it('adds smaller east and west gate-road ribbons', () => {
    expect(isPaving(at(-270, G, 20))).toBe(true);
    expect(isPaving(at(285, G, 20))).toBe(true);
    expect(at(-270, G + 2, 8)).not.toBe(AIR);
    expect(at(285, G + 2, 32)).not.toBe(AIR);
  });

  it('anchors the rural transition with chapel, farm, orchard, and mill silhouettes', () => {
    expect(at(65, G + 2, -300)).not.toBe(AIR); // chapel
    expect(at(-105, G + 2, -315)).not.toBe(AIR); // farmstead
    expect(at(125, G + 1, -315)).not.toBe(AIR); // orchard
    expect(at(-170, G + 8, -285)).not.toBe(AIR); // mill
  });
});

describe('capital expansion orchestrator', () => {
  it('stamps both the walled districts and extramural suburbs', () => {
    const at = sampler(buildCapitalExpansion);
    expect(isPaving(at(8, G, -160))).toBe(true);
    expect(isPaving(at(8, G, -270))).toBe(true);
  });
});
