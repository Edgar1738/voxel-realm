// Exercises the pure atlas assembler against both fabricated bases (unit-level invariants) and the
// real bundled snapshots in public/worlds/ (integration: regions translate cleanly and stay
// disjoint, the hub is stamped, and the synthesized meta is navigable).
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  buildAtlasWorld,
  translateRegionDeltas,
  type AtlasRegionSource,
} from '../src/worldgen/atlas/atlasWorld';
import { WORLD_ATLAS_REGIONS, regionChunkOffset } from '../src/worldgen/atlas/atlasRegions';
import { parseWorldSnapshot, snapshotToDeltas } from '../src/persistence/WorldSnapshot';
import { packVoxel, SAVE_VERSION, type WorldDeltas } from '../src/persistence/SaveTypes';
import { voxelIndex, chunkKey } from '../src/core/coords';
import { GLOWSTONE, STONE } from '../src/blocks/blocks';
import { BlockRegistry } from '../src/blocks/BlockRegistry';

const root = resolve(__dirname, '..');
const registry = new BlockRegistry();

function loadRegionSources(): AtlasRegionSource[] {
  return WORLD_ATLAS_REGIONS.map((region) => {
    const raw: unknown = JSON.parse(
      readFileSync(resolve(root, 'public', 'worlds', `${region.sourceSave}.json`), 'utf8'),
    );
    const { snapshot } = parseWorldSnapshot(raw, { isValidBlockId: (id) => registry.has(id) });
    return { region, base: { meta: snapshot.meta!, deltas: snapshotToDeltas(snapshot) } };
  });
}

function deltas(entries: Array<[string, Array<[number, number]>]>): WorldDeltas {
  const out: WorldDeltas = new Map();
  for (const [key, es] of entries) out.set(key, new Map(es.map(([i, v]) => [i, packVoxel(v, 0)])));
  return out;
}

describe('translateRegionDeltas', () => {
  it('shifts the chunk key by whole chunks while preserving in-chunk indices (dy=0)', () => {
    const index = voxelIndex(3, 62, 5);
    const src = deltas([
      ['0,0', [[index, STONE]]],
      ['-1,2', [[index, STONE]]],
    ]);
    const out = translateRegionDeltas(src, 40, 0, 0);
    expect([...out.keys()].sort()).toEqual(['39,2', '40,0']);
    expect(out.get('40,0')!.get(index)).toBe(packVoxel(STONE, 0));
  });

  it('re-indexes vertically and drops blocks pushed out of the world', () => {
    const src = deltas([['0,0', [[voxelIndex(1, 10, 1), STONE]]]]);
    const up = translateRegionDeltas(src, 0, 0, 5);
    expect(up.get('0,0')!.has(voxelIndex(1, 15, 1))).toBe(true);
    const gone = translateRegionDeltas(src, 0, 0, -20); // y = 10 - 20 < 0
    expect(gone.get('0,0')!.size).toBe(0);
  });
});

describe('buildAtlasWorld (fabricated)', () => {
  it('throws when two region footprints share a chunk', () => {
    const a: AtlasRegionSource = {
      region: {
        ...WORLD_ATLAS_REGIONS[0],
        id: 'a',
        sourceSave: 'a',
        position: { x: 640, y: 0, z: 0 },
      },
      base: { meta: { seed: 1337, version: 1 }, deltas: deltas([['0,0', [[0, STONE]]]]) },
    };
    const b: AtlasRegionSource = {
      region: {
        ...WORLD_ATLAS_REGIONS[0],
        id: 'b',
        sourceSave: 'b',
        position: { x: 656, y: 0, z: 0 },
      },
      base: { meta: { seed: 1337, version: 1 }, deltas: deltas([['-1,0', [[0, STONE]]]]) },
    };
    // a -> chunk 40,0 ; b -> chunk (41-1)=40,0. Collision.
    expect(() => buildAtlasWorld([a, b])).toThrow(/overlap/);
  });

  it('assembles an empty atlas (hub only) with valid meta', () => {
    const atlas = buildAtlasWorld([]);
    expect(atlas.meta.preset).toBe('atlas');
    expect(atlas.deltas.size).toBeGreaterThan(0); // the hub alone produces deltas
  });
});

describe('buildAtlasWorld (real bundled snapshots)', () => {
  const sources = loadRegionSources();
  const atlas = buildAtlasWorld(sources);

  it('produces a curated, navigable meta', () => {
    expect(atlas.meta.seed).toBe(1337);
    expect(atlas.meta.version).toBe(SAVE_VERSION);
    expect(atlas.meta.preset).toBe('atlas');
    expect(atlas.meta.spawn).toBeDefined();
    expect(atlas.meta.look).toBeDefined();
    // one landmark per region plus the hub; tour adds a hub start + a return leg.
    expect(atlas.meta.landmarks).toHaveLength(sources.length + 1);
    expect(atlas.meta.tour).toHaveLength(sources.length + 2);
    for (const region of WORLD_ATLAS_REGIONS) {
      expect(atlas.meta.landmarks!.some((l) => l.name === region.name)).toBe(true);
    }
  });

  it('stamps a lit beacon at the spawn hub origin', () => {
    expect(atlas.deltas.get('0,0')!.get(voxelIndex(0, 63, 0))).toBe(packVoxel(GLOWSTONE, 0));
  });

  it('keeps every region footprint disjoint (no coordinate overlap)', () => {
    const chunkSets = sources.map(({ region, base }) => {
      const { dcx, dcz } = regionChunkOffset(region);
      return new Set(translateRegionDeltas(base.deltas, dcx, dcz, region.position.y).keys());
    });
    for (let i = 0; i < chunkSets.length; i++) {
      for (let j = i + 1; j < chunkSets.length; j++) {
        for (const key of chunkSets[i]) {
          expect(chunkSets[j].has(key), `regions ${i}/${j} overlap at ${key}`).toBe(false);
        }
      }
    }
  });

  it('preserves every region block at its translated position (relative layout intact)', () => {
    for (const { region, base } of sources) {
      const { dcx, dcz } = regionChunkOffset(region);
      let checked = 0;
      for (const [key, map] of base.deltas) {
        const { cx, cz } = parseKey(key);
        const dstKey = chunkKey(cx + dcx, cz + dcz);
        const dst = atlas.deltas.get(dstKey);
        expect(dst, `${region.id}: missing translated chunk ${dstKey}`).toBeDefined();
        for (const [index, value] of map) {
          expect(dst!.get(index)).toBe(value);
          checked++;
        }
      }
      expect(checked).toBeGreaterThan(0);
    }
  });
});

function parseKey(key: string): { cx: number; cz: number } {
  const comma = key.indexOf(',');
  return { cx: Number(key.slice(0, comma)), cz: Number(key.slice(comma + 1)) };
}
