// scripts/packageCore.ts
//
// Pure validation + summary helpers for `world:package`. No filesystem access here so the
// roam-readiness rules and summary math can be unit-tested directly.

import type { MetaPoint, WorldMeta } from '../src/persistence/SaveTypes';

/** A finite y within the world's vertical bounds. x/z are unbounded (the world is infinite). */
function inYBounds(y: number, worldHeight: number): boolean {
  return Number.isFinite(y) && y >= 0 && y <= worldHeight;
}

function pointProblems(label: string, point: MetaPoint, worldHeight: number): string[] {
  const out: string[] = [];
  if (!Number.isFinite(point.x) || !Number.isFinite(point.z))
    out.push(`${label} has non-finite x/z`);
  if (!inYBounds(point.y, worldHeight))
    out.push(`${label} y ${point.y} out of bounds [0, ${worldHeight}]`);
  return out;
}

/**
 * Return a list of roam-readiness problems (empty means the save is ready to package).
 * This is the STRUCTURAL contract (finite, in-bounds meta). The player-facing CURATION
 * contract (title/description/landmarks/tour) is `auditWorldMeta` in src/app/worldMeta.ts;
 * `world:package` enforces this one and warns on the other.
 */
export function validatePackage(meta: WorldMeta | undefined, worldHeight: number): string[] {
  if (!meta) return ['save has no meta'];

  const problems: string[] = [];
  if (!Number.isInteger(meta.seed)) problems.push('meta.seed missing or not an integer');
  if (!Number.isInteger(meta.version)) problems.push('meta.version missing or not an integer');
  if (!meta.preset) problems.push('meta.preset missing');

  if (!meta.spawn) {
    problems.push('meta.spawn missing (world is not roam-ready)');
  } else {
    problems.push(...pointProblems('spawn', meta.spawn, worldHeight));
  }

  (meta.landmarks ?? []).forEach((lm, i) => {
    problems.push(...pointProblems(`landmark[${i}] "${lm.name}"`, lm, worldHeight));
  });
  (meta.tour ?? []).forEach((pt, i) => {
    problems.push(...pointProblems(`tour[${i}]`, pt, worldHeight));
  });

  return problems;
}

export interface PackageSummary {
  chunkCount: number;
  totalEntries: number;
  /** Entries whose block id is non-air (id !== 0). */
  nonAirEntries: number;
  /** Histogram of block id -> count across all saved entries. */
  blockCounts: Record<number, number>;
}

type SnapshotEntry = [number, number] | [number, number, number];

/** Cheap summary stats over a raw save snapshot's chunk deltas. */
export function summarizePackage(snapshot: {
  chunks?: Record<string, SnapshotEntry[]>;
}): PackageSummary {
  const chunks = snapshot.chunks ?? {};
  let totalEntries = 0;
  let nonAirEntries = 0;
  const blockCounts: Record<number, number> = {};

  for (const entries of Object.values(chunks)) {
    for (const entry of entries) {
      totalEntries += 1;
      const id = entry[1];
      if (id !== 0) nonAirEntries += 1;
      blockCounts[id] = (blockCounts[id] ?? 0) + 1;
    }
  }

  return { chunkCount: Object.keys(chunks).length, totalEntries, nonAirEntries, blockCounts };
}
