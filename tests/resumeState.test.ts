import { describe, it, expect } from 'vitest';
import {
  parseResume,
  serializeResume,
  loadResume,
  saveResume,
  clearResume,
  resumeKey,
  resumeToSpawn,
  RESUME_VERSION,
  type ResumeState,
  type ResumeStore,
} from '../src/app/resumeState';

const STATE: ResumeState = { x: 10, y: 64.5, z: -20, yaw: 1.2, pitch: -0.3, flying: false };

function fakeStore(
  init: Record<string, string> = {},
): ResumeStore & { data: Record<string, string> } {
  const data = { ...init };
  return {
    data,
    getItem: (k) => data[k] ?? null,
    setItem: (k, v) => {
      data[k] = v;
    },
    removeItem: (k) => {
      delete data[k];
    },
  };
}

describe('resume parse/serialize', () => {
  it('round-trips a valid record', () => {
    expect(parseResume(serializeResume(STATE))).toEqual(STATE);
  });

  it('returns undefined for null, non-JSON, and non-objects', () => {
    expect(parseResume(null)).toBeUndefined();
    expect(parseResume('not json')).toBeUndefined();
    expect(parseResume('42')).toBeUndefined();
  });

  it('rejects a record from another version', () => {
    const raw = JSON.stringify({ v: RESUME_VERSION + 1, ...STATE });
    expect(parseResume(raw)).toBeUndefined();
  });

  it('rejects records with non-finite numbers or a non-boolean flying', () => {
    expect(parseResume(JSON.stringify({ v: RESUME_VERSION, ...STATE, y: 'NaN' }))).toBeUndefined();
    expect(parseResume(JSON.stringify({ v: RESUME_VERSION, ...STATE, x: null }))).toBeUndefined();
    expect(parseResume(JSON.stringify({ v: RESUME_VERSION, ...STATE, flying: 1 }))).toBeUndefined();
  });

  it('clamps pitch to +/- 90 degrees', () => {
    const raw = JSON.stringify({ v: RESUME_VERSION, ...STATE, pitch: 5 });
    expect(parseResume(raw)?.pitch).toBeCloseTo(Math.PI / 2);
    const raw2 = JSON.stringify({ v: RESUME_VERSION, ...STATE, pitch: -5 });
    expect(parseResume(raw2)?.pitch).toBeCloseTo(-Math.PI / 2);
  });
});

describe('resume load/save/clear', () => {
  it('keys per world and round-trips through a store', () => {
    const store = fakeStore();
    saveResume(store, 'giza', STATE);
    expect(store.data[resumeKey('giza')]).toBeDefined();
    expect(loadResume(store, 'giza')).toEqual(STATE);
    // A different world is independent.
    expect(loadResume(store, 'tidewreck-cove')).toBeUndefined();
  });

  it('clear removes only that world', () => {
    const store = fakeStore();
    saveResume(store, 'giza', STATE);
    saveResume(store, 'town', { ...STATE, x: 1 });
    clearResume(store, 'giza');
    expect(loadResume(store, 'giza')).toBeUndefined();
    expect(loadResume(store, 'town')).toEqual({ ...STATE, x: 1 });
  });

  it('fails open when the store throws', () => {
    const throwing: ResumeStore = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
    };
    expect(loadResume(throwing, 'giza')).toBeUndefined();
    expect(() => saveResume(throwing, 'giza', STATE)).not.toThrow();
    expect(() => clearResume(throwing, 'giza')).not.toThrow();
  });
});

describe('resumeToSpawn', () => {
  it('maps a record into per-field spawn/look/flying inputs', () => {
    expect(resumeToSpawn(STATE)).toEqual({
      spawn: { x: 10, y: 64.5, z: -20 },
      look: { yaw: 1.2, pitch: -0.3 },
      flying: false,
    });
  });

  it('passes undefined through', () => {
    expect(resumeToSpawn(undefined)).toBeUndefined();
  });
});
