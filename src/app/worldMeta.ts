/**
 * Pure helpers for editing a world's {@link WorldMeta} from the dev API. Kept separate from
 * the fetch I/O so the merge semantics can be unit-tested. The server's `writeMeta` is a full
 * replace, so callers always read the current meta, merge here, then write the complete result.
 */
import type { MetaPoint, WorldMeta } from '../persistence/SaveTypes';

export interface WorldMetaAudit {
  ready: boolean;
  missing: string[];
  warnings: string[];
  suggestions: string[];
}

/** Merge a partial patch onto a complete base meta; defined patch fields win, arrays replace. */
export function mergeMeta(base: WorldMeta, patch: Partial<WorldMeta>): WorldMeta {
  const out = { ...base } as unknown as Record<string, unknown>;
  for (const [key, value] of Object.entries(patch)) {
    if (value !== undefined) out[key] = value;
  }
  return out as unknown as WorldMeta;
}

/** Append a landmark, returning a new meta (never mutates `base`). */
export function appendLandmark(base: WorldMeta, landmark: { name: string } & MetaPoint): WorldMeta {
  return { ...base, landmarks: [...(base.landmarks ?? []), landmark] };
}

/**
 * Report whether a saved world has enough curation metadata to feel intentional on first load.
 * This is the CURATION contract; the STRUCTURAL packaging contract (finite, in-bounds points)
 * is `validatePackage` in scripts/packageCore.ts — `world:package` enforces that one and
 * surfaces this audit as warnings.
 */
export function auditWorldMeta(meta: WorldMeta | undefined): WorldMetaAudit {
  const missing: string[] = [];
  const warnings: string[] = [];
  const suggestions: string[] = [];

  if (!meta) {
    return {
      ready: false,
      missing: ['meta'],
      warnings: ['No world metadata is saved yet.'],
      suggestions: ['Make an edit or call world.setMeta() before curating this world.'],
    };
  }

  if (!meta.title?.trim()) missing.push('title');
  if (!meta.description?.trim()) missing.push('description');
  if (!meta.spawn) missing.push('spawn');
  if (!meta.look) missing.push('look');

  const landmarks = meta.landmarks ?? [];
  const tour = meta.tour ?? [];
  if (landmarks.length === 0) missing.push('landmarks');
  if (tour.length < 2) missing.push('tour');

  if (landmarks.length > 0 && landmarks.length < 3) {
    warnings.push('World has fewer than 3 landmarks, so exploration may feel under-labeled.');
  }
  if (tour.length === 1)
    warnings.push('World tour has only one point; benchTour needs at least 2.');

  if (missing.includes('spawn') || missing.includes('look')) {
    suggestions.push('Move to a good first-player view and call world.setSpawn("Arrival").');
  }
  if (missing.includes('title') || missing.includes('description')) {
    suggestions.push('Call world.setMeta({ title, description }) with player-facing context.');
  }
  if (missing.includes('landmarks')) {
    suggestions.push('Call world.addLandmark(name, x, y, z) for the obvious destinations.');
  }
  if (missing.includes('tour')) {
    suggestions.push(
      'Call world.setTour([...]) with at least two route waypoints for roaming checks.',
    );
  }

  return { ready: missing.length === 0 && warnings.length === 0, missing, warnings, suggestions };
}
