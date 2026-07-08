import type { MetaPoint, WorldMeta } from './SaveTypes';

/** Schema version for the shipped-world manifest; bump on breaking shape changes. */
export const MANIFEST_VERSION = 1;

export interface WorldLook {
  yaw: number;
  pitch: number;
}

/** One shipped world in the curated collection. */
export interface WorldManifestEntry {
  /** URL/file-safe id, unique within a manifest. */
  slug: string;
  title: string;
  description: string;
  preset: string;
  seed: number;
  version: number;
  spawn: MetaPoint;
  look: WorldLook;
  landmarks: Array<{ name: string } & MetaPoint>;
  tour: Array<{ name?: string } & MetaPoint>;
  tags: string[];
  /** Optional relative path/URL to a preview image. */
  preview?: string;
  /** Optional chunk count (payload-size hint from the package summary). */
  chunkCount?: number;
  /** Manifest schema version this entry was built against. */
  packageVersion: number;
}

/** The shipped collection: a versioned list of curated worlds. */
export interface WorldManifest {
  version: number;
  worlds: WorldManifestEntry[];
}

/** A URL/file-safe slug from an arbitrary world name. Never empty. */
export function slugify(name: string): string {
  const s = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
    .replace(/-+$/g, '');
  return s || 'world';
}

export interface BuildManifestOptions {
  tags?: readonly string[];
  preview?: string;
  chunkCount?: number;
  /** Override the slug source (defaults to the world name). */
  slug?: string;
}

/**
 * Build a manifest entry from a saved world's {@link WorldMeta}. A shipped world must know where to
 * drop the player, so spawn + look are required (throws otherwise). Title falls back to the slug,
 * description to an empty string; landmarks/tour/tags default to empty. Use {@link manifestEntryProblems}
 * to gate publishability — this only assembles the entry.
 */
export function buildManifestEntry(
  name: string,
  meta: WorldMeta,
  opts: BuildManifestOptions = {},
): WorldManifestEntry {
  if (!meta.spawn || !meta.look) {
    throw new Error('worldManifest: meta needs spawn + look before it can be shipped');
  }
  const slug = slugify(opts.slug ?? name);
  const entry: WorldManifestEntry = {
    slug,
    title: meta.title?.trim() || slug,
    description: meta.description?.trim() ?? '',
    preset: meta.preset ?? 'default',
    seed: meta.seed,
    version: meta.version,
    spawn: { ...meta.spawn },
    look: { ...meta.look },
    landmarks: (meta.landmarks ?? []).map((l) => ({ ...l })),
    tour: (meta.tour ?? []).map((t) => ({ ...t })),
    tags: [...(opts.tags ?? [])],
    packageVersion: MANIFEST_VERSION,
  };
  if (opts.preview !== undefined) entry.preview = opts.preview;
  if (opts.chunkCount !== undefined) entry.chunkCount = opts.chunkCount;
  return entry;
}

function pointFinite(p: MetaPoint): boolean {
  return Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z);
}

/**
 * Problems that make an entry unfit for the shipped collection (empty = ready): slug shape,
 * required text, integer seed/version, and finite spawn/look/landmark/tour points.
 */
export function manifestEntryProblems(entry: WorldManifestEntry): string[] {
  const p: string[] = [];
  if (!entry.slug || slugify(entry.slug) !== entry.slug) p.push('slug missing or not slug-safe');
  if (!entry.title.trim()) p.push('title is empty');
  if (!entry.description.trim()) p.push('description is empty');
  if (!entry.preset) p.push('preset is empty');
  if (!Number.isInteger(entry.seed)) p.push('seed is not an integer');
  if (!Number.isInteger(entry.version)) p.push('version is not an integer');
  if (!pointFinite(entry.spawn)) p.push('spawn is not finite');
  if (!Number.isFinite(entry.look.yaw) || !Number.isFinite(entry.look.pitch))
    p.push('look is not finite');
  entry.landmarks.forEach((l, i) => {
    if (!l.name?.trim()) p.push(`landmark[${i}] has no name`);
    if (!pointFinite(l)) p.push(`landmark[${i}] "${l.name}" is not finite`);
  });
  entry.tour.forEach((t, i) => {
    if (!pointFinite(t)) p.push(`tour[${i}] is not finite`);
  });
  return p;
}

/** An empty manifest at the current schema version. */
export function emptyManifest(): WorldManifest {
  return { version: MANIFEST_VERSION, worlds: [] };
}

/** Add — or replace by slug — an entry, returning a new manifest (existing order kept, new appended). */
export function upsertManifestEntry(
  manifest: WorldManifest,
  entry: WorldManifestEntry,
): WorldManifest {
  const worlds = manifest.worlds.filter((w) => w.slug !== entry.slug);
  worlds.push(entry);
  return { version: manifest.version, worlds };
}

/** The shipped world with this slug, or undefined when the name isn't in the collection. */
export function findManifestEntry(
  manifest: WorldManifest,
  slug: string,
): WorldManifestEntry | undefined {
  return manifest.worlds.find((w) => w.slug === slug);
}

/**
 * Problems where a bundled snapshot's meta doesn't match its manifest entry (empty = match).
 * Guards the static pipeline: a stale bundle must not ship under a manifest that promises a
 * different generator (seed/version/preset) or a spawn the snapshot can't honour.
 */
export function entryMetaProblems(
  entry: WorldManifestEntry,
  meta: WorldMeta | undefined,
): string[] {
  if (!meta) return ['snapshot has no meta'];
  const p: string[] = [];
  if (meta.seed !== entry.seed) p.push(`snapshot seed ${meta.seed} != manifest ${entry.seed}`);
  if (meta.version !== entry.version)
    p.push(`snapshot version ${meta.version} != manifest ${entry.version}`);
  if ((meta.preset ?? 'default') !== entry.preset)
    p.push(`snapshot preset ${meta.preset ?? 'default'} != manifest ${entry.preset}`);
  if (!meta.spawn || !meta.look) p.push('snapshot meta is missing spawn/look');
  return p;
}

/** Whole-manifest validation: schema version, unique slugs, and every entry valid. */
export function validateManifest(manifest: WorldManifest): string[] {
  const problems: string[] = [];
  if (manifest.version !== MANIFEST_VERSION)
    problems.push(`manifest version ${manifest.version} != ${MANIFEST_VERSION}`);
  const seen = new Set<string>();
  for (const entry of manifest.worlds) {
    if (seen.has(entry.slug)) problems.push(`duplicate slug "${entry.slug}"`);
    seen.add(entry.slug);
    for (const problem of manifestEntryProblems(entry))
      problems.push(`"${entry.slug}": ${problem}`);
  }
  return problems;
}
