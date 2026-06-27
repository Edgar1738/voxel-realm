import type { WorldMeta } from './SaveTypes';

/**
 * What to do with a stored save at boot:
 * - `load`: meta matches the current world; load its deltas.
 * - `reset`: discard stored deltas and (re)write meta. `reason` distinguishes a brand-new save
 *   (`no-meta`, possibly orphaned deltas) from one built by an incompatible seed/version.
 */
export type SaveAction = { kind: 'load' } | { kind: 'reset'; reason: 'no-meta' | 'incompatible' };

/** Pure decision: given the stored meta (if any) and the current world, decide what boot does. */
export function resolveSaveAction(
  meta: WorldMeta | undefined,
  seed: number,
  version: number,
  preset: string,
): SaveAction {
  if (!meta) return { kind: 'reset', reason: 'no-meta' };
  if (meta.seed !== seed || meta.version !== version || (meta.preset ?? 'default') !== preset) {
    return { kind: 'reset', reason: 'incompatible' };
  }
  return { kind: 'load' };
}
