import { describe, it, expect } from 'vitest';
import { mergeMeta, appendLandmark, auditWorldMeta } from '../src/app/worldMeta';
import type { WorldMeta } from '../src/persistence/SaveTypes';

const base: WorldMeta = { seed: 7, version: 1, preset: 'default' };

describe('mergeMeta', () => {
  it('applies a partial patch while keeping untouched base fields', () => {
    const merged = mergeMeta(base, { spawn: { x: 1, y: 2, z: 3 } });
    expect(merged).toEqual({
      seed: 7,
      version: 1,
      preset: 'default',
      spawn: { x: 1, y: 2, z: 3 },
    });
  });

  it('never mutates the base object', () => {
    mergeMeta(base, { title: 'X' });
    expect(base).toEqual({ seed: 7, version: 1, preset: 'default' });
  });

  it('ignores undefined patch values so they cannot clobber base fields', () => {
    // exactOptionalPropertyTypes forbids typing explicit-undefined fields, but a runtime
    // caller could still pass them, so the guard is exercised through a cast.
    const patch = { title: undefined, spawn: undefined } as unknown as Partial<WorldMeta>;
    const merged = mergeMeta({ ...base, title: 'Keep' }, patch);
    expect(merged.title).toBe('Keep');
    expect(merged.spawn).toBeUndefined();
  });

  it('replaces array fields wholesale rather than concatenating', () => {
    const withTour = mergeMeta(base, { tour: [{ x: 0, y: 0, z: 0 }] });
    const replaced = mergeMeta(withTour, { tour: [{ x: 9, y: 9, z: 9 }] });
    expect(replaced.tour).toEqual([{ x: 9, y: 9, z: 9 }]);
  });
});

describe('appendLandmark', () => {
  it('creates the landmarks array when absent', () => {
    const out = appendLandmark(base, { name: 'Gate', x: 1, y: 2, z: 3 });
    expect(out.landmarks).toEqual([{ name: 'Gate', x: 1, y: 2, z: 3 }]);
  });

  it('appends to an existing landmarks array without mutating the base', () => {
    const one = appendLandmark(base, { name: 'A', x: 0, y: 0, z: 0 });
    const two = appendLandmark(one, { name: 'B', x: 1, y: 1, z: 1 });
    expect(two.landmarks).toEqual([
      { name: 'A', x: 0, y: 0, z: 0 },
      { name: 'B', x: 1, y: 1, z: 1 },
    ]);
    expect(one.landmarks).toHaveLength(1);
  });
});

describe('auditWorldMeta', () => {
  it('reports a missing metadata document as not ready', () => {
    expect(auditWorldMeta(undefined)).toEqual({
      ready: false,
      missing: ['meta'],
      warnings: ['No world metadata is saved yet.'],
      suggestions: ['Make an edit or call world.setMeta() before curating this world.'],
    });
  });

  it('flags missing player-facing curation fields', () => {
    const audit = auditWorldMeta(base);
    expect(audit.ready).toBe(false);
    expect(audit.missing).toEqual(['title', 'description', 'spawn', 'look', 'landmarks', 'tour']);
    expect(audit.suggestions).toContain(
      'Move to a good first-player view and call world.setSpawn("Arrival").',
    );
  });

  it('passes a curated world with enough landmarks and tour waypoints', () => {
    const audit = auditWorldMeta({
      ...base,
      title: 'Moonspire Realm',
      description: 'A castle approach with a spire route.',
      spawn: { x: 8, y: 72, z: 126 },
      look: { yaw: 0, pitch: -0.1 },
      landmarks: [
        { name: 'Arrival Road', x: 8, y: 72, z: 126 },
        { name: 'Gatehouse', x: 8, y: 64, z: 47 },
        { name: 'Moonspire', x: 68, y: 118, z: 72 },
      ],
      tour: [
        { name: 'Arrival Road', x: 8, y: 72, z: 126 },
        { name: 'Gatehouse', x: 8, y: 64, z: 47 },
      ],
    });
    expect(audit).toEqual({ ready: true, missing: [], warnings: [], suggestions: [] });
  });
});
