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

export interface DiskSnapshot {
  meta?: { seed: number; version: number; preset?: string };
  chunks: Record<string, Array<[number, number]>>;
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

/**
 * Write a snapshot atomically: write to a temp file in the same directory,
 * then rename onto the target (rename is atomic on a single filesystem).
 * Before replacing an existing non-empty world with an empty snapshot,
 * copy the current file into .backups/<name>-<timestamp>.json and prune
 * backups beyond MAX_BACKUPS.
 */
function writeWorld(root: string, name: string, snap: DiskSnapshot): void {
  const target = fileFor(root, name);
  const safeName = safeWorldName(name);

  // Backup before destructive overwrite: non-empty → empty
  const incomingEmpty = Object.keys(snap.chunks).length === 0;
  if (incomingEmpty && existsSync(target)) {
    try {
      const existing = JSON.parse(readFileSync(target, 'utf8')) as Partial<DiskSnapshot>;
      const existingHasChunks =
        existing.chunks != null && Object.keys(existing.chunks).length > 0;
      if (existingHasChunks) {
        const backupsDir = join(root, '.backups');
        mkdirSync(backupsDir, { recursive: true });
        const timestamp = Date.now();
        const backupFile = join(backupsDir, `${safeName}-${timestamp}.json`);
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
  entries: Array<[number, number]>,
): void {
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
