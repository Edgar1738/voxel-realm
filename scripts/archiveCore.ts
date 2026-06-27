// scripts/archiveCore.ts
//
// Pure helpers + filesystem orchestration for the Obsidian-first world archive workflow.
// Every function that touches disk takes its directories as explicit arguments so the
// behaviour can be unit-tested against temp dirs without ever writing to the real vault.

import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  copyFileSync,
  existsSync,
  readdirSync,
} from 'node:fs';
import { resolve } from 'node:path';

export const DEFAULT_ROAM_PORT = 5175;

export interface SnapshotMeta {
  seed: number;
  version: number;
  preset?: string;
}

export interface GitInfo {
  branch?: string;
  commit?: string;
}

export interface ArchiveManifest {
  archiveId: string;
  title: string;
  sourceSave: string;
  archivedAt: string;
  source: {
    repoPath: string;
    branch?: string;
    commit?: string;
  };
  snapshot: {
    chunkCount: number;
    meta?: SnapshotMeta;
  };
  captures: string[];
}

/** Lowercase, hyphen-separated, punctuation stripped — safe for folder names and slugs. */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** `<YYYY-MM-DD>-<title-slug>` — the stable archive id used everywhere. */
export function archiveFolderName(date: string, title: string): string {
  return `${date}-${slugify(title)}`;
}

/** Local calendar date as `YYYY-MM-DD` (kept in sync with the archive folder name). */
export function formatDate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function roamUrl(saveName: string, port: number = DEFAULT_ROAM_PORT): string {
  return `http://127.0.0.1:${port}/?save=${saveName}`;
}

/**
 * Decide which capture files belong to a save. An explicit list wins (filtered to files
 * that actually exist); otherwise auto-match `<save>.jpg` and the `<save>-*.jpg` convention.
 */
export function matchCaptures(
  available: string[],
  saveName: string,
  explicit?: string[],
): string[] {
  if (explicit && explicit.length > 0) {
    return explicit.filter((file) => available.includes(file));
  }
  const exact = `${saveName}.jpg`;
  const prefix = `${saveName}-`;
  return available
    .filter((file) => file === exact || (file.startsWith(prefix) && file.endsWith('.jpg')))
    .sort();
}

export interface BuildManifestInput {
  archiveId: string;
  title: string;
  sourceSave: string;
  archivedAt: string;
  repoPath: string;
  chunkCount: number;
  captures: string[];
  git?: GitInfo;
  meta?: SnapshotMeta;
}

export function buildManifest(input: BuildManifestInput): ArchiveManifest {
  const source: ArchiveManifest['source'] = { repoPath: input.repoPath };
  if (input.git?.branch) source.branch = input.git.branch;
  if (input.git?.commit) source.commit = input.git.commit;

  const snapshot: ArchiveManifest['snapshot'] = { chunkCount: input.chunkCount };
  if (input.meta) snapshot.meta = input.meta;

  return {
    archiveId: input.archiveId,
    title: input.title,
    sourceSave: input.sourceSave,
    archivedAt: input.archivedAt,
    source,
    snapshot,
    captures: input.captures,
  };
}

const CATALOG_HEADER = [
  '# Voxel Realm — World Archive',
  '',
  'Durable, curated worlds copied out of `.saves/`. Restore one with its command, then roam at the printed URL.',
  '',
  '| Title | Archive | Source Save | Date | Restore |',
  '| --- | --- | --- | --- | --- |',
].join('\n');

function restoreCommand(manifest: ArchiveManifest): string {
  return `npm run world:restore -- --archive ${manifest.archiveId} --save ${manifest.sourceSave}-restored`;
}

/** One markdown table row for the catalog. */
export function catalogRow(manifest: ArchiveManifest): string {
  const date = manifest.archiveId.slice(0, 10);
  return `| ${manifest.title} | [${manifest.archiveId}](Artifacts/${manifest.archiveId}/) | ${manifest.sourceSave} | ${date} | \`${restoreCommand(manifest)}\` |`;
}

/**
 * Add or replace this archive's row in `World Archive.md`. Idempotent: re-archiving the same
 * id replaces its row instead of appending a duplicate. Keyed on the `Artifacts/<id>/` link.
 */
export function upsertCatalog(existing: string | null, manifest: ArchiveManifest): string {
  const row = catalogRow(manifest);
  if (!existing || !existing.includes('| Title |')) {
    return `${CATALOG_HEADER}\n${row}\n`;
  }
  const key = `Artifacts/${manifest.archiveId}/`;
  const lines = existing.replace(/\s+$/, '').split('\n');
  const index = lines.findIndex((line) => line.includes(key));
  if (index >= 0) {
    lines[index] = row;
    return `${lines.join('\n')}\n`;
  }
  return `${lines.join('\n')}\n${row}\n`;
}

export function renderReadme(manifest: ArchiveManifest, port: number = DEFAULT_ROAM_PORT): string {
  const lines: string[] = [
    `# ${manifest.title}`,
    '',
    `Archived snapshot of the \`${manifest.sourceSave}\` Voxel Realm world.`,
    '',
    '## Restore',
    '',
    '```',
    restoreCommand(manifest),
    '```',
    '',
    `Then roam at: ${roamUrl(`${manifest.sourceSave}-restored`, port)}`,
    '',
    '## Details',
    '',
    `- Source save: \`${manifest.sourceSave}\``,
    `- Archived: ${manifest.archivedAt}`,
    `- Chunks: ${manifest.snapshot.chunkCount}`,
  ];
  if (manifest.snapshot.meta) {
    const { seed, version, preset } = manifest.snapshot.meta;
    lines.push(`- Seed: ${seed} · version ${version}${preset ? ` · preset ${preset}` : ''}`);
  }
  if (manifest.source.branch || manifest.source.commit) {
    lines.push(
      `- Source: ${manifest.source.branch ?? 'unknown branch'} @ ${manifest.source.commit ?? 'unknown commit'}`,
    );
  }
  lines.push('');
  if (manifest.captures.length > 0) {
    lines.push('## Screenshots', '');
    for (const capture of manifest.captures) {
      lines.push(`![${capture}](captures/${capture})`);
    }
    lines.push('');
  }
  lines.push(
    '## Notes for future agents',
    '',
    'This world lives in Obsidian, not git. Restore it into `.saves/` before roaming or editing;',
    'archive again (with a fresh title) once new work is worth keeping.',
    '',
  );
  return lines.join('\n');
}

interface ReadSnapshot {
  meta?: SnapshotMeta;
  chunks?: Record<string, unknown>;
}

export interface ArchiveWorldOptions {
  saveName: string;
  title: string;
  savesDir: string;
  capturesDir: string;
  artifactsDir: string;
  catalogPath: string;
  repoPath: string;
  git?: GitInfo;
  now?: Date;
  captures?: string[];
  roamPort?: number;
}

export interface ArchiveWorldResult {
  archiveId: string;
  archiveDir: string;
  manifest: ArchiveManifest;
  copiedCaptures: string[];
  roamUrl: string;
}

export function archiveWorld(opts: ArchiveWorldOptions): ArchiveWorldResult {
  const port = opts.roamPort ?? DEFAULT_ROAM_PORT;
  const saveFile = resolve(opts.savesDir, `${opts.saveName}.json`);
  if (!existsSync(saveFile)) {
    throw new Error(`save not found: ${saveFile}`);
  }

  const raw = readFileSync(saveFile, 'utf8');
  const snapshot = JSON.parse(raw) as ReadSnapshot;
  const chunkCount = snapshot.chunks ? Object.keys(snapshot.chunks).length : 0;

  const now = opts.now ?? new Date();
  const archiveId = archiveFolderName(formatDate(now), opts.title);
  const archiveDir = resolve(opts.artifactsDir, archiveId);
  mkdirSync(archiveDir, { recursive: true });
  writeFileSync(resolve(archiveDir, 'world.json'), raw);

  const available = existsSync(opts.capturesDir)
    ? readdirSync(opts.capturesDir).filter((file) => file.endsWith('.jpg'))
    : [];
  const copiedCaptures = matchCaptures(available, opts.saveName, opts.captures);
  if (copiedCaptures.length > 0) {
    const captureDir = resolve(archiveDir, 'captures');
    mkdirSync(captureDir, { recursive: true });
    for (const file of copiedCaptures) {
      copyFileSync(resolve(opts.capturesDir, file), resolve(captureDir, file));
    }
  }

  const manifest = buildManifest({
    archiveId,
    title: opts.title,
    sourceSave: opts.saveName,
    archivedAt: now.toISOString(),
    repoPath: opts.repoPath,
    chunkCount,
    captures: copiedCaptures,
    ...(opts.git ? { git: opts.git } : {}),
    ...(snapshot.meta ? { meta: snapshot.meta } : {}),
  });

  writeFileSync(resolve(archiveDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  writeFileSync(resolve(archiveDir, 'README.md'), renderReadme(manifest, port));

  const existingCatalog = existsSync(opts.catalogPath)
    ? readFileSync(opts.catalogPath, 'utf8')
    : null;
  mkdirSync(resolve(opts.catalogPath, '..'), { recursive: true });
  writeFileSync(opts.catalogPath, upsertCatalog(existingCatalog, manifest));

  return {
    archiveId,
    archiveDir,
    manifest,
    copiedCaptures,
    roamUrl: roamUrl(opts.saveName, port),
  };
}

export interface RestoreWorldOptions {
  archiveId: string;
  saveName: string;
  artifactsDir: string;
  savesDir: string;
  force?: boolean;
  roamPort?: number;
}

export interface RestoreWorldResult {
  savePath: string;
  roamUrl: string;
}

export function restoreWorld(opts: RestoreWorldOptions): RestoreWorldResult {
  const worldFile = resolve(opts.artifactsDir, opts.archiveId, 'world.json');
  if (!existsSync(worldFile)) {
    throw new Error(`archive world.json not found: ${worldFile}`);
  }
  const target = resolve(opts.savesDir, `${opts.saveName}.json`);
  if (existsSync(target) && !opts.force) {
    throw new Error(`save already exists: ${target} (pass --force to overwrite)`);
  }
  mkdirSync(opts.savesDir, { recursive: true });
  copyFileSync(worldFile, target);
  return {
    savePath: target,
    roamUrl: roamUrl(opts.saveName, opts.roamPort ?? DEFAULT_ROAM_PORT),
  };
}
