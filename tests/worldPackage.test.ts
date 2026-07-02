import { describe, it, expect } from 'vitest';
import { validatePackage, summarizePackage } from '../scripts/packageCore';
import { auditWorldMeta } from '../src/app/worldMeta';
import type { WorldMeta } from '../src/persistence/SaveTypes';
import { REGULAR_USER_MOONSPIRE_META } from './fixtures/curatedMeta';

const WORLD_HEIGHT = 192;

const roamReady: WorldMeta = {
  seed: 7,
  version: 1,
  preset: 'default',
  spawn: { x: 10, y: 65, z: -4 },
  landmarks: [{ name: 'Gate', x: 0, y: 64, z: 0 }],
  tour: [{ x: 0, y: 64, z: 0 }],
};

describe('validatePackage', () => {
  it('accepts a roam-ready meta with no problems', () => {
    expect(validatePackage(roamReady, WORLD_HEIGHT)).toEqual([]);
  });

  it('reports a single clear problem when meta is absent', () => {
    expect(validatePackage(undefined, WORLD_HEIGHT)).toEqual(['save has no meta']);
  });

  it('flags a missing spawn (world is not roam-ready)', () => {
    const noSpawn: WorldMeta = { seed: 7, version: 1, preset: 'default' };
    expect(validatePackage(noSpawn, WORLD_HEIGHT).join(' ')).toMatch(/spawn/i);
  });

  it('flags missing seed/version/preset', () => {
    const problems = validatePackage(
      { spawn: { x: 0, y: 1, z: 0 } } as unknown as WorldMeta,
      WORLD_HEIGHT,
    );
    expect(problems.join(' ')).toMatch(/seed/i);
    expect(problems.join(' ')).toMatch(/version/i);
    expect(problems.join(' ')).toMatch(/preset/i);
  });

  it('flags out-of-bounds spawn / landmark / tour y', () => {
    const bad: WorldMeta = {
      ...roamReady,
      spawn: { x: 0, y: 99999, z: 0 },
      landmarks: [{ name: 'Void', x: 0, y: -5, z: 0 }],
      tour: [{ x: 0, y: 500, z: 0 }],
    };
    const problems = validatePackage(bad, WORLD_HEIGHT).join(' ');
    expect(problems).toMatch(/spawn/i);
    expect(problems).toMatch(/landmark/i);
    expect(problems).toMatch(/tour/i);
  });
});

describe('readiness contract alignment (structural + curation)', () => {
  it('regular-user-moonspire meta passes both classifiers cleanly', () => {
    expect(validatePackage(REGULAR_USER_MOONSPIRE_META, WORLD_HEIGHT)).toEqual([]);
    expect(auditWorldMeta(REGULAR_USER_MOONSPIRE_META)).toEqual({
      ready: true,
      missing: [],
      warnings: [],
      suggestions: [],
    });
  });

  it('the classifiers disagree on purpose for a bare-but-sound save: packageable, not player-ready', () => {
    // Structurally fine (finite spawn, sane points) but uncurated — world:package archives it
    // with curation warnings rather than refusing.
    expect(validatePackage(roamReady, WORLD_HEIGHT)).toEqual([]);
    const audit = auditWorldMeta(roamReady);
    expect(audit.ready).toBe(false);
    expect(audit.missing).toContain('title');
  });
});

describe('summarizePackage', () => {
  it('counts chunks, entries, non-air entries, and a block histogram', () => {
    const snapshot: { chunks: Record<string, Array<[number, number] | [number, number, number]>> } =
      {
        chunks: {
          '0,0': [
            [1, 5],
            [2, 0], // air (removed block)
            [3, 5, 2], // stateful, still id 5
          ],
          '1,0': [[4, 8]],
        },
      };
    expect(summarizePackage(snapshot)).toEqual({
      chunkCount: 2,
      totalEntries: 4,
      nonAirEntries: 3,
      blockCounts: { 0: 1, 5: 2, 8: 1 },
    });
  });

  it('handles an empty snapshot', () => {
    expect(summarizePackage({})).toEqual({
      chunkCount: 0,
      totalEntries: 0,
      nonAirEntries: 0,
      blockCounts: {},
    });
  });
});
