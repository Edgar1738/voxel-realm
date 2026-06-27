// tests/worldDiskStore.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  readWorld,
  writeChunk,
  writeMeta,
  clearWorld,
  listWorlds,
  copyWorld,
  deleteWorld,
  safeWorldName,
} from '../server/worldDiskStore';

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'vr-saves-'));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('worldDiskStore', () => {
  it('returns an empty snapshot for an unknown world', () => {
    expect(readWorld(root, 'nope')).toEqual({ chunks: {} });
  });

  it('writes and reads meta and chunks; empty entries delete a chunk', () => {
    writeMeta(root, 'w', { seed: 1, version: 1, preset: 'default' });
    writeChunk(root, 'w', '0,0', [[5, 13]]);
    let snap = readWorld(root, 'w');
    expect(snap.meta).toEqual({ seed: 1, version: 1, preset: 'default' });
    expect(snap.chunks['0,0']).toEqual([[5, 13]]);

    writeChunk(root, 'w', '0,0', []);
    snap = readWorld(root, 'w');
    expect(snap.chunks['0,0']).toBeUndefined();
    expect(snap.meta).toEqual({ seed: 1, version: 1, preset: 'default' });
  });

  it('clear keeps meta but drops chunks', () => {
    writeMeta(root, 'w', { seed: 1, version: 1 });
    writeChunk(root, 'w', '1,1', [[0, 3]]);
    clearWorld(root, 'w');
    expect(readWorld(root, 'w')).toEqual({ meta: { seed: 1, version: 1 }, chunks: {} });
  });

  it('lists, copies and deletes worlds', () => {
    writeChunk(root, 'alpha', '0,0', [[1, 1]]);
    writeChunk(root, 'beta', '0,0', [[2, 2]]);
    expect(listWorlds(root)).toEqual(['alpha', 'beta']);

    copyWorld(root, 'alpha', 'gamma');
    expect(readWorld(root, 'gamma').chunks['0,0']).toEqual([[1, 1]]);

    deleteWorld(root, 'alpha');
    expect(listWorlds(root)).toEqual(['beta', 'gamma']);
  });

  it('sanitizes names and falls back to "default"', () => {
    expect(safeWorldName('a/b c.json')).toBe('a_b_c_json');
    expect(safeWorldName('')).toBe('default');
    expect(safeWorldName(undefined)).toBe('default');
    expect(safeWorldName('../../etc/passwd')).toBe('______etc_passwd');
  });
});
