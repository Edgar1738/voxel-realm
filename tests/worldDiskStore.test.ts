// tests/worldDiskStore.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs';
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
  vi.restoreAllMocks();
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

  // --- NEW: atomic write round-trips ---
  it('atomic write round-trips data correctly', () => {
    writeChunk(root, 'myworld', '3,4', [[10, 7]]);
    writeMeta(root, 'myworld', { seed: 42, version: 1, preset: 'canyon' });
    const snap = readWorld(root, 'myworld');
    expect(snap.meta).toEqual({ seed: 42, version: 1, preset: 'canyon' });
    expect(snap.chunks['3,4']).toEqual([[10, 7]]);
  });

  // --- NEW: readWorld logs error on corrupt file ---
  it('invalid/torn file returns empty chunks AND calls console.error', () => {
    const file = join(root, 'broken.json');
    writeFileSync(file, '{invalid json truncated');
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = readWorld(root, 'broken');
    expect(result).toEqual({ chunks: {} });
    expect(errorSpy).toHaveBeenCalledOnce();
    // The error call should mention the filename
    const firstArg = errorSpy.mock.calls[0][0] as string;
    expect(firstArg).toContain('broken.json');
  });

  // --- NEW: backup before wipe (non-empty → empty) ---
  it('writing an empty snapshot over a non-empty world creates a backup under .backups', () => {
    // Set up a world with chunks
    writeChunk(root, 'castle', '0,0', [[1, 5]]);
    expect(readWorld(root, 'castle').chunks['0,0']).toEqual([[1, 5]]);

    // clearWorld writes an empty snapshot over a non-empty world
    clearWorld(root, 'castle');

    // A backup should exist in .backups/
    const backupsDir = join(root, '.backups');
    expect(existsSync(backupsDir)).toBe(true);
    const backupFiles = readdirSync(backupsDir).filter((f) => f.startsWith('castle-'));
    expect(backupFiles.length).toBe(1);

    // The backup should contain the original non-empty data
    const backupData = JSON.parse(readFileSync(join(backupsDir, backupFiles[0]), 'utf8'));
    expect(backupData.chunks['0,0']).toEqual([[1, 5]]);
  });

  // --- NEW: no backup for normal (non-empty → non-empty) writes ---
  it('writing non-empty over non-empty creates NO backup', () => {
    writeChunk(root, 'world1', '0,0', [[1, 3]]);
    writeChunk(root, 'world1', '0,0', [[2, 7]]);

    const backupsDir = join(root, '.backups');
    // Either backups dir doesn't exist, or it has no entries for world1
    if (existsSync(backupsDir)) {
      const backupFiles = readdirSync(backupsDir).filter((f) => f.startsWith('world1-'));
      expect(backupFiles.length).toBe(0);
    } else {
      expect(existsSync(backupsDir)).toBe(false);
    }
  });

  // --- NEW: backups capped at 10 ---
  it('backups are capped at 10 per world', () => {
    // Write initial non-empty state then repeatedly trigger wipe → restore pattern
    // We need 11 wipe events; each clearWorld (non-empty→empty) creates a backup,
    // then writeMeta restores a non-empty state via meta alone (no chunks so won't trigger backup).
    // Actually to trigger backup we need non-empty chunks→empty.
    // Strategy: repeatedly writeChunk then clearWorld (11 times), checking the cap.
    for (let i = 0; i < 11; i++) {
      writeChunk(root, 'captest', '0,0', [[i, 1]]);
      clearWorld(root, 'captest');
    }

    const backupsDir = join(root, '.backups');
    expect(existsSync(backupsDir)).toBe(true);
    const backupFiles = readdirSync(backupsDir).filter((f) => f.startsWith('captest-'));
    expect(backupFiles.length).toBe(10);
  });

  // --- NEW: listWorlds does not include .backups entries ---
  it('listWorlds does not return backup entries', () => {
    writeChunk(root, 'alpha', '0,0', [[1, 1]]);
    // Trigger a backup
    clearWorld(root, 'alpha');
    // Write another world
    writeChunk(root, 'beta', '0,0', [[2, 2]]);

    const worlds = listWorlds(root);
    // Should not contain anything from .backups subdir
    expect(worlds).not.toContain('.backups');
    expect(worlds.every((w) => !w.includes('backups'))).toBe(true);
    // alpha and beta should still be listed
    expect(worlds).toContain('alpha');
    expect(worlds).toContain('beta');
  });
});
