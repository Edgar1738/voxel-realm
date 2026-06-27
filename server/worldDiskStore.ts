// server/worldDiskStore.ts
import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

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
  } catch {
    return { chunks: {} };
  }
}

function writeWorld(root: string, name: string, snap: DiskSnapshot): void {
  writeFileSync(fileFor(root, name), JSON.stringify(snap));
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
