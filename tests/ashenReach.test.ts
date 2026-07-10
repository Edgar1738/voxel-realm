import { describe, expect, it } from 'vitest';
import { createGenerator, isWorldPreset, WORLD_PRESETS } from '../src/worldgen/Presets';
import { ASHEN_REACH, ashenReachSurfaceAt } from '../src/worldgen/AshenReachGenerator';
import { applyOverlays } from '../src/worldgen/Generator';
import { ChunkData } from '../src/world/ChunkData';
import { CHUNK_SIZE_X, CHUNK_SIZE_Z } from '../src/core/constants';
import { AIR, GLOWSTONE, LAVA, PLANKS } from '../src/blocks/blocks';

describe('Ashen Reach preset registration', () => {
  it('registers as a selectable world with a generator and site overlay', () => {
    expect(isWorldPreset('ashen-reach')).toBe(true);
    expect(WORLD_PRESETS).toContain('ashen-reach');

    const { generator, overlays } = createGenerator('ashen-reach');
    expect(typeof generator.generateBaseChunk).toBe('function');
    expect(overlays.length).toBeGreaterThan(0);
  });
});

describe('Ashen Reach terrain', () => {
  it('places the overlook and Cinderkeep above a lava-cut valley', () => {
    expect(ashenReachSurfaceAt(1337, ASHEN_REACH.spawnX, ASHEN_REACH.spawnZ)).toBe(
      ASHEN_REACH.overlookY,
    );
    expect(ashenReachSurfaceAt(1337, ASHEN_REACH.keepX, ASHEN_REACH.keepZ)).toBe(ASHEN_REACH.keepY);
    expect(ashenReachSurfaceAt(1337, 0, 20)).toBeLessThan(ASHEN_REACH.overlookY - 24);
  });
});

describe('Ashen Reach landmarks', () => {
  function at(wx: number, wy: number, wz: number): number {
    const { generator, overlays } = createGenerator('ashen-reach');
    const cx = Math.floor(wx / CHUNK_SIZE_X);
    const cz = Math.floor(wz / CHUNK_SIZE_Z);
    const chunk = generator.generateBaseChunk(1337, cx, cz) as ChunkData;
    applyOverlays(chunk, cx, cz, 1337, overlays);
    return chunk.get(wx - cx * CHUNK_SIZE_X, wy, wz - cz * CHUNK_SIZE_Z);
  }

  it('cuts a glowing lava channel beneath the approach bridge', () => {
    expect(at(0, 61, ASHEN_REACH.valleyZ)).toBe(LAVA);
    expect(at(0, 79, 0)).toBe(PLANKS);
  });

  it('builds a walkable Cinderkeep with a gate, interior, and rooftop beacon', () => {
    expect(at(0, ASHEN_REACH.keepY + 2, -42)).toBe(AIR);
    expect(at(0, ASHEN_REACH.keepY + 11, -78)).toBe(AIR);
    expect(at(0, ASHEN_REACH.keepY + 30, -78)).toBe(GLOWSTONE);
  });
});
