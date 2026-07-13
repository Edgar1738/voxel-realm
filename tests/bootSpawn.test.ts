import { describe, it, expect } from 'vitest';
import {
  clampSpawnY,
  groundSpawnY,
  parseSpawnOverrides,
  resolveSpawn,
  type SpawnState,
} from '../src/app/bootSpawn';

const FALLBACK: SpawnState = {
  spawn: { x: 8, y: 100, z: 8 },
  look: { yaw: 0, pitch: 0 },
};

describe('resolveSpawn – boot spawn/look precedence', () => {
  it('falls back to the default when no meta, override, or resume', () => {
    expect(resolveSpawn(undefined, {}, undefined, FALLBACK)).toEqual({
      ...FALLBACK,
      positionSource: 'default',
      lookSource: 'default',
      flying: undefined,
    });
  });

  it('prefers saved meta spawn/look over the default', () => {
    const meta = { spawn: { x: 1, y: 2, z: 3 }, look: { yaw: 1.5, pitch: -0.2 } };
    expect(resolveSpawn(meta, {}, undefined, FALLBACK)).toEqual({
      ...meta,
      positionSource: 'meta',
      lookSource: 'meta',
      flying: undefined,
    });
  });

  it('lets a query override beat meta per-field (spawn overridden, look from meta)', () => {
    const meta = { spawn: { x: 1, y: 2, z: 3 }, look: { yaw: 1.5, pitch: -0.2 } };
    const overrides = { spawn: { x: 99, y: 99, z: 99 } };
    expect(resolveSpawn(meta, overrides, undefined, FALLBACK)).toEqual({
      spawn: { x: 99, y: 99, z: 99 },
      look: { yaw: 1.5, pitch: -0.2 },
      positionSource: 'url',
      lookSource: 'meta',
      flying: undefined,
    });
  });

  it('resume beats meta but loses to a URL override, per field', () => {
    const meta = { spawn: { x: 1, y: 2, z: 3 }, look: { yaw: 1.5, pitch: -0.2 } };
    const resume = { spawn: { x: 40, y: 41, z: 42 }, look: { yaw: 0.7, pitch: 0.1 }, flying: false };
    // No override: resume wins both fields, and flying rides along.
    expect(resolveSpawn(meta, {}, resume, FALLBACK)).toEqual({
      spawn: { x: 40, y: 41, z: 42 },
      look: { yaw: 0.7, pitch: 0.1 },
      positionSource: 'resume',
      lookSource: 'resume',
      flying: false,
    });
    // ?spawn= overrides the resumed position; the resumed look still survives.
    const overrides = { spawn: { x: 99, y: 99, z: 99 } };
    const r = resolveSpawn(meta, overrides, resume, FALLBACK);
    expect(r.spawn).toEqual({ x: 99, y: 99, z: 99 });
    expect(r.positionSource).toBe('url');
    expect(r.look).toEqual({ yaw: 0.7, pitch: 0.1 });
    expect(r.lookSource).toBe('resume');
    // flying is only carried when the resumed *position* won, so the override case boots flying.
    expect(r.flying).toBeUndefined();
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

describe('groundSpawnY – settle the default spawn onto terrain', () => {
  const HALF = 0.9;

  it('rests the body center on the highest solid block of the column', () => {
    const isSolid = (_x: number, y: number, _z: number) => y <= 63;
    expect(groundSpawnY(isSolid, 8, 8, 192, HALF)).toBe(64 + HALF);
  });

  it('ignores solids in other columns', () => {
    const isSolid = (x: number, y: number, z: number) => x === 0 && z === 0 && y <= 10;
    expect(groundSpawnY(isSolid, 0, 0, 192, HALF)).toBe(11 + HALF);
    expect(groundSpawnY(isSolid, 5, 5, 192, HALF)).toBeUndefined();
  });

  it('returns undefined for an all-air column', () => {
    expect(groundSpawnY(() => false, 8, 8, 192, HALF)).toBeUndefined();
  });
});
