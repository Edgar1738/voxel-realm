import { describe, expect, it } from 'vitest';
import { createGenerator, isWorldPreset, WORLD_PRESETS } from '../src/worldgen/Presets';
import { ASHEN_REACH, ashenReachSurfaceAt } from '../src/worldgen/AshenReachGenerator';
import { applyOverlays } from '../src/worldgen/Generator';
import { ChunkData } from '../src/world/ChunkData';
import { CHUNK_SIZE_X, CHUNK_SIZE_Z } from '../src/core/constants';
import { AIR, COBBLESTONE, GLOWSTONE, LAVA, PLANKS } from '../src/blocks/blocks';

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

  it('carves walkable headroom above the overlook descent steps', () => {
    // The upper half of the stepped path tunnels through the solid overlook plateau; every
    // step needs the path block topped by clear air, or the route from spawn is entombed.
    for (let z = 42; z <= 90; z++) {
      const y = 80 + Math.floor((z - 42) / 2);
      expect(at(0, y, z)).not.toBe(AIR);
      expect(at(0, y + 1, z)).toBe(AIR);
      expect(at(0, y + 2, z)).toBe(AIR);
    }
  });

  it('keeps the spiral stair shaft open through the keep floors and roof', () => {
    const G = ASHEN_REACH.keepY;
    // The 3x3 shaft around (10, -78) must not be sealed by the plank floors or the roof deck;
    // each ring cell is either open air or a stair step, never floor/roof material.
    for (const y of [G + 10, G + 19, G + 28]) {
      for (let dx = -1; dx <= 1; dx++) {
        for (let dz = -1; dz <= 1; dz++) {
          if (dx === 0 && dz === 0) continue; // the solid newel post
          expect([PLANKS, COBBLESTONE]).not.toContain(at(10 + dx, y, -78 + dz));
        }
      }
    }
    expect(at(0, G + 1, -41)).not.toBe(AIR); // gate threshold stays solid at bridge level
  });
});
