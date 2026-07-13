import { describe, it, expect } from 'vitest';
import { createGenerator, isWorldPreset, WORLD_PRESETS } from '../src/worldgen/Presets';
import { CLOUDSPIRE, cloudspireSurfaceAt } from '../src/worldgen/CloudspireGenerator';
import { applyOverlays } from '../src/worldgen/Generator';
import { ChunkData } from '../src/world/ChunkData';
import { CHUNK_SIZE_X, CHUNK_SIZE_Z, WORLD_HEIGHT } from '../src/core/constants';
import {
  AIR,
  LIMESTONE,
  CARVED_LIMESTONE,
  SLATE,
  CYAN_GLASS,
  GOLD_TRIM,
  WATER,
  STAIRS_SLATE,
  SLATE_SLAB,
  BLOCK_DEFS,
} from '../src/blocks/blocks';
import { BlockRegistry } from '../src/blocks/BlockRegistry';
import {
  G,
  CATH,
  KEEP,
  KCX,
  KCZ,
  FLOOR,
  PALACE_STACK,
  STAIR_X0,
  STAIR_Z0,
  SPAWN,
  spireAccessibleY,
  spirePeakY,
  X0,
  X1,
  Z0,
  Z1,
  CX,
} from '../src/worldgen/cloudspireFrame';
import { curatedPresetMeta } from '../src/app/curatedPreset';
import { parseWorldSnapshot } from '../src/persistence/WorldSnapshot';

const SEED = 1337;

function makeSampler(seed = SEED) {
  const { generator, overlays } = createGenerator('cloudspire-citadel');
  const cache = new Map<string, ChunkData>();
  const chunkOf = (cx: number, cz: number): ChunkData => {
    const key = `${cx},${cz}`;
    let c = cache.get(key);
    if (!c) {
      c = generator.generateBaseChunk(seed, cx, cz);
      applyOverlays(c, cx, cz, seed, overlays);
      cache.set(key, c);
    }
    return c;
  };
  const at = (wx: number, wy: number, wz: number): number => {
    const cx = Math.floor(wx / CHUNK_SIZE_X);
    const cz = Math.floor(wz / CHUNK_SIZE_Z);
    return chunkOf(cx, cz).get(wx - cx * CHUNK_SIZE_X, wy, wz - cz * CHUNK_SIZE_Z);
  };
  return { at };
}

function isSolid(id: number): boolean {
  if (id === AIR) return false;
  const def = BLOCK_DEFS.find((d) => d.id === id);
  return !!def && !def.transparent;
}

describe('cloudspire-citadel preset registration', () => {
  it('registers the preset', () => {
    expect(isWorldPreset('cloudspire-citadel')).toBe(true);
    expect(WORLD_PRESETS).toContain('cloudspire-citadel');
  });

  it('creates generator + overlays', () => {
    const { generator, overlays } = createGenerator('cloudspire-citadel');
    expect(generator).toBeTruthy();
    expect(overlays.length).toBeGreaterThanOrEqual(1);
  });
});

describe('cloudspire materials', () => {
  it('appends Cloudspire blocks after lava without reordering', () => {
    expect(LIMESTONE).toBe(42);
    expect(CARVED_LIMESTONE).toBe(43);
    expect(SLATE).toBe(44);
    expect(SLATE_SLAB).toBe(45);
    expect(STAIRS_SLATE).toBe(46);
    expect(CYAN_GLASS).toBe(47);
    expect(GOLD_TRIM).toBe(48);
  });

  it('registers new blocks in BlockRegistry with textures', () => {
    const reg = new BlockRegistry();
    expect(reg.has(LIMESTONE)).toBe(true);
    expect(reg.has(SLATE)).toBe(true);
    expect(reg.has(CYAN_GLASS)).toBe(true);
    expect(reg.isOpaque(LIMESTONE)).toBe(true);
    expect(reg.emission(GOLD_TRIM)).toBe(10);
  });
});

describe('cloudspire terrain', () => {
  it('is deterministic', () => {
    const a = cloudspireSurfaceAt(SEED, 10, -20);
    const b = cloudspireSurfaceAt(SEED, 10, -20);
    expect(a).toBe(b);
  });

  it('flattens palace terrace near center', () => {
    expect(cloudspireSurfaceAt(SEED, 0, 0)).toBe(CLOUDSPIRE.palaceY);
  });

  it('stays in world bounds', () => {
    for (const [x, z] of [
      [0, 0],
      [200, 0],
      [0, -200],
      [-150, 150],
    ] as const) {
      const h = cloudspireSurfaceAt(SEED, x, z);
      expect(h).toBeGreaterThan(0);
      expect(h).toBeLessThan(WORLD_HEIGHT);
    }
  });
});

describe('cloudspire massing', () => {
  const { at } = makeSampler();

  it('places limestone on outer walls', () => {
    // Away from the cleared south gate passage.
    expect(at(CX + 40, G + 8, Z0 + 1)).toBe(LIMESTONE);
  });

  it('has cathedral footprint limestone', () => {
    // Lower wall course between window bays (z0+8 is a pointed window).
    expect(at(CATH.x0, CATH.floor + 2, CATH.z0 + 3)).toBe(LIMESTONE);
  });

  it('has hollow cathedral nave air', () => {
    expect(at(0, CATH.floor + 4, CATH.z0 + 20)).toBe(AIR);
  });

  it('has cathedral entrance opening', () => {
    expect(at(0, CATH.floor + 2, CATH.z0)).toBe(AIR);
  });

  it('has palace entrance opening', () => {
    expect(at(KCX, FLOOR.ground + 2, KEEP.z0)).toBe(AIR);
  });

  it('has palace floor continuity', () => {
    expect(at(KCX, FLOOR.ground, KCZ)).not.toBe(AIR);
  });

  it('keeps stair shaft open on ground', () => {
    expect(at(STAIR_X0, FLOOR.ground + 2, STAIR_Z0 + 5)).toBe(AIR);
  });

  it('builds multi-storey palace stack', () => {
    expect(PALACE_STACK.length).toBeGreaterThan(8);
    expect(at(KEEP.x0, FLOOR.roof - 5, KCZ)).toBe(LIMESTONE);
  });

  it('reaches high spire under WORLD_HEIGHT', () => {
    const peak = spirePeakY();
    const crown = spireAccessibleY();
    expect(peak).toBeGreaterThanOrEqual(400);
    expect(peak).toBeLessThan(WORLD_HEIGHT);
    expect(crown).toBeGreaterThanOrEqual(350);
    expect(crown).toBeLessThan(peak);
  });

  it('has solid spire shell mid-height', () => {
    // Base ring of stage 0 (window bays overwrite some mid-height shell with glass).
    expect(at(KCX + 22, FLOOR.roof + 1, KCZ)).toBe(LIMESTONE);
  });

  it('has water at a waterfall column', () => {
    expect(at(70, G + 10, -30)).toBe(WATER);
  });

  it('spawn overlook has solid deck', () => {
    expect(isSolid(at(SPAWN.x, G + 20, SPAWN.z))).toBe(true);
  });

  it('outer city spans intended width', () => {
    expect(X1 - X0).toBeGreaterThanOrEqual(220);
    expect(Z1 - Z0).toBeGreaterThanOrEqual(220);
  });
});

describe('cloudspire curated metadata', () => {
  it('provides title spawn tour atmosphere', () => {
    const meta = curatedPresetMeta('cloudspire-citadel', SEED, 2);
    expect(meta?.title).toBe('Cloudspire Citadel');
    expect(meta?.spawn?.z).toBe(SPAWN.z);
    expect(meta?.tour?.length).toBeGreaterThanOrEqual(8);
    expect(meta?.landmarks?.length).toBeGreaterThanOrEqual(8);
    expect(meta?.atmosphere?.weather).toBe('clear');
    expect(meta?.atmosphere?.timeOfDay).toBeCloseTo(0.42);
  });

  it('leaves default preset uncurated', () => {
    expect(curatedPresetMeta('default', SEED, 2)).toBeUndefined();
  });
});

describe('cloudspire atmosphere parse defaults', () => {
  it('parses optional atmosphere and ignores legacy saves without it', () => {
    const withAtmo = parseWorldSnapshot(
      {
        meta: {
          seed: 1,
          version: 2,
          atmosphere: { weather: 'clear', timeOfDay: 0.3, fogNear: 100, fogFar: 200 },
        },
        chunks: {},
      },
      { isValidBlockId: () => true },
    );
    expect(withAtmo.snapshot.meta?.atmosphere?.weather).toBe('clear');
    expect(withAtmo.snapshot.meta?.atmosphere?.fogFar).toBe(200);

    const legacy = parseWorldSnapshot(
      { meta: { seed: 1, version: 2, title: 'Old' }, chunks: {} },
      { isValidBlockId: () => true },
    );
    expect(legacy.snapshot.meta?.atmosphere).toBeUndefined();
    expect(legacy.snapshot.meta?.title).toBe('Old');
  });
});
