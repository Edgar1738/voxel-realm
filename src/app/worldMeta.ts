/**
 * Pure helpers for editing a world's {@link WorldMeta} from the dev API. Kept separate from
 * the fetch I/O so the merge semantics can be unit-tested. The server's `writeMeta` is a full
 * replace, so callers always read the current meta, merge here, then write the complete result.
 */
import type { MetaPoint, WorldMeta } from '../persistence/SaveTypes';

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
