// server/worldDiskStore.ts
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  existsSync,
  readdirSync,
  renameSync,
  copyFileSync,
  rmSync,
} from 'node:fs';
import { resolve, join } from 'node:path';
import { CHUNK_VOLUME } from '../src/core/constants';
import type { WorldMeta } from '../src/persistence/SaveTypes';

export type ChunkEntry = [number, number] | [number, number, number];

export interface DiskSnapshot {
  /** Stored opaquely; the client's `parseMeta` is the authoritative filter on read. */
  meta?: WorldMeta;
  chunks: Record<string, Array<ChunkEntry>>;
}

/** Filesystem-safe world name; never empty. */
export function safeWorldName(name: unknown): string {
  const s = String(name ?? '')
    .replace(/[^a-z0-9_-]/gi, '_')
    .slice(0, 64);
  return s.length > 0 ? s : 'default';
}

function fileFor(root: string, name: string): string {
  mkdirSync(root, { recursive: true });
  return resolve(root, `${safeWorldName(name)}.json`);
}

export function readWorld(root: string, name: string): DiskSnapshot {
  const file = fileFor(root, name);
  if (!existsSync(file)) return { chunks: {} };
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as Partial<DiskSnapshot>;
    const snap: DiskSnapshot = { chunks: parsed.chunks ?? {} };
    if (parsed.meta !== undefined) snap.meta = parsed.meta;
    return snap;
  } catch (err) {
    console.error(`[worldDiskStore] Failed to parse ${file}:`, err);
    return { chunks: {} };
  }
}

const MAX_BACKUPS = 10;

// Monotonic counter so backups created within the same millisecond get
// distinct filenames. Zero-padded and used as a secondary sort key after
// the fixed-width Date.now() timestamp, so lexicographic sort stays
// chronological.
let backupSeq = 0;

/**
 * Write a snapshot atomically: write to a temp file in the same directory,
 * then rename onto the target (rename is atomic on a single filesystem).
 * Before replacing an existing non-empty world with an empty snapshot,
 * copy the current file into .backups/<name>-<timestamp>-<seq>.json and
 * prune backups beyond MAX_BACKUPS.
 */
function writeWorld(root: string, name: string, snap: DiskSnapshot): void {
  const target = fileFor(root, name);
  const safeName = safeWorldName(name);

  // Backup before destructive overwrite: non-empty → empty
  const incomingEmpty = Object.keys(snap.chunks).length === 0;
  if (incomingEmpty && existsSync(target)) {
    try {
      const existing = JSON.parse(readFileSync(target, 'utf8')) as Partial<DiskSnapshot>;
      const existingHasChunks = existing.chunks != null && Object.keys(existing.chunks).length > 0;
      if (existingHasChunks) {
        const backupsDir = join(root, '.backups');
        mkdirSync(backupsDir, { recursive: true });
        const stamp = `${Date.now()}-${String(backupSeq++).padStart(6, '0')}`;
        const backupFile = join(backupsDir, `${safeName}-${stamp}.json`);
        copyFileSync(target, backupFile);

        // Prune oldest backups for this world beyond MAX_BACKUPS
        const allBackups = readdirSync(backupsDir)
          .filter((f) => f.startsWith(`${safeName}-`) && f.endsWith('.json'))
          .sort(); // lexicographic = chronological since timestamp is ms
        if (allBackups.length > MAX_BACKUPS) {
          const toDelete = allBackups.slice(0, allBackups.length - MAX_BACKUPS);
          for (const old of toDelete) {
            rmSync(join(backupsDir, old));
          }
        }
      }
    } catch {
      // Non-fatal: if we can't read the existing file to check, skip backup.
    }
  }

  // Atomic write: write to temp file then rename
  const tmpFile = `${target}.tmp`;
  writeFileSync(tmpFile, JSON.stringify(snap));
  renameSync(tmpFile, target);
}

export function writeMeta(root: string, name: string, meta: DiskSnapshot['meta']): void {
  const snap = readWorld(root, name);
  if (meta !== undefined) snap.meta = meta;
  writeWorld(root, name, snap);
}

export function writeChunk(
  root: string,
  name: string,
  key: string,
  entries: Array<ChunkEntry>,
): void {
  if (entries.length > CHUNK_VOLUME)
    throw new Error(`chunk ${key}: too many entries (${entries.length} > ${CHUNK_VOLUME})`);
  for (const e of entries) {
    if (!Array.isArray(e) || (e.length !== 2 && e.length !== 3))
      throw new Error(`chunk ${key}: entry must be [index, id] or [index, id, state]`);
    const [idx, id] = e;
    if (!Number.isInteger(idx) || idx < 0 || idx >= CHUNK_VOLUME)
      throw new Error(`chunk ${key}: index ${idx} out of range`);
    if (!Number.isInteger(id) || id < 0 || id > 255)
      throw new Error(`chunk ${key}: block id ${id} out of 0..255`);
    if (e.length === 3) {
      const state = e[2];
      if (!Number.isInteger(state) || state < 0 || state > 255)
        throw new Error(`chunk ${key}: state ${String(state)} out of 0..255`);
    }
  }
  const snap = readWorld(root, name);
  if (entries.length === 0) delete snap.chunks[key];
  else snap.chunks[key] = entries;
  writeWorld(root, name, snap);
}

export function clearWorld(root: string, name: string): void {
  const snap = readWorld(root, name);
  const cleared: DiskSnapshot = { chunks: {} };
  if (snap.meta !== undefined) cleared.meta = snap.meta;
  writeWorld(root, name, cleared);
}

export function listWorlds(root: string): string[] {
  if (!existsSync(root)) return [];
  return readdirSync(root)
    .filter((f: string) => f.endsWith('.json'))
    .map((f: string) => f.slice(0, -'.json'.length))
    .sort();
}

export function copyWorld(root: string, from: string, to: string): void {
  writeWorld(root, to, readWorld(root, from));
}

export function deleteWorld(root: string, name: string): void {
  const file = fileFor(root, name);
  if (existsSync(file)) rmSync(file);
}
