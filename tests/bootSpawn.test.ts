import { describe, it, expect } from 'vitest';
import {
  clampSpawnY,
  parseSpawnOverrides,
  resolveSpawn,
  type SpawnState,
} from '../src/app/bootSpawn';

const FALLBACK: SpawnState = {
  spawn: { x: 8, y: 100, z: 8 },
  look: { yaw: 0, pitch: 0 },
};

describe('resolveSpawn – boot spawn/look precedence', () => {
  it('falls back to the default when no meta and no overrides', () => {
    expect(resolveSpawn(undefined, {}, FALLBACK)).toEqual(FALLBACK);
  });

  it('prefers saved meta spawn/look over the default', () => {
    const meta = { spawn: { x: 1, y: 2, z: 3 }, look: { yaw: 1.5, pitch: -0.2 } };
    expect(resolveSpawn(meta, {}, FALLBACK)).toEqual(meta);
  });

  it('lets a query override beat meta per-field (spawn overridden, look from meta)', () => {
    const meta = { spawn: { x: 1, y: 2, z: 3 }, look: { yaw: 1.5, pitch: -0.2 } };
    const overrides = { spawn: { x: 99, y: 99, z: 99 } };
    expect(resolveSpawn(meta, overrides, FALLBACK)).toEqual({
      spawn: { x: 99, y: 99, z: 99 },
      look: { yaw: 1.5, pitch: -0.2 },
    });
  });
});

describe('parseSpawnOverrides – URL query parsing', () => {
  it('parses valid spawn and look params', () => {
    expect(parseSpawnOverrides('?spawn=1,2,3&look=1.5,-0.2')).toEqual({
      spawn: { x: 1, y: 2, z: 3 },
      look: { yaw: 1.5, pitch: -0.2 },
    });
  });

  it('drops malformed params (wrong arity / non-finite)', () => {
    expect(parseSpawnOverrides('?spawn=1,2&look=nan,0')).toEqual({});
  });

  it('returns an empty object when params are absent', () => {
    expect(parseSpawnOverrides('')).toEqual({});
  });
});

describe('clampSpawnY – keep spawn inside world bounds', () => {
  const WORLD_HEIGHT = 192;

  it('leaves an in-bounds spawn untouched', () => {
    const state: SpawnState = { spawn: { x: 5, y: 100, z: -5 }, look: { yaw: 1, pitch: 0.5 } };
    expect(clampSpawnY(state, WORLD_HEIGHT)).toEqual(state);
  });

  it('clamps a below-floor y up to 0 without touching x/z/look', () => {
    const state: SpawnState = { spawn: { x: 5, y: -9999, z: -5 }, look: { yaw: 1, pitch: 0.5 } };
    expect(clampSpawnY(state, WORLD_HEIGHT)).toEqual({
      spawn: { x: 5, y: 0, z: -5 },
      look: { yaw: 1, pitch: 0.5 },
    });
  });

  it('clamps an above-ceiling y down to WORLD_HEIGHT', () => {
    const state: SpawnState = { spawn: { x: 5, y: 99999, z: -5 }, look: { yaw: 0, pitch: 0 } };
    expect(clampSpawnY(state, WORLD_HEIGHT).spawn.y).toBe(WORLD_HEIGHT);
  });
});
