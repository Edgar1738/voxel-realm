import type { CrownCircuitState } from './NpcTypes';

export const CROWN_CIRCUIT_LANDMARKS = ['East Waterfall', 'Sky Bridge', 'Crown Balcony'] as const;

export interface NpcProgress {
  crownCircuit: CrownCircuitState;
  piperBestSeconds?: number;
}

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

export function npcProgressKey(worldName: string): string {
  return `vr.npcProgress.${worldName}`;
}

export function loadNpcProgress(storage: StorageLike, worldName: string): NpcProgress {
  try {
    const raw = storage.getItem(npcProgressKey(worldName));
    if (!raw) return { crownCircuit: 'inactive' };
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const crownCircuit =
      parsed.crownCircuit === 'active' || parsed.crownCircuit === 'complete'
        ? parsed.crownCircuit
        : 'inactive';
    const best = parsed.piperBestSeconds;
    return {
      crownCircuit,
      ...(typeof best === 'number' && Number.isFinite(best) && best > 0
        ? { piperBestSeconds: best }
        : {}),
    };
  } catch {
    return { crownCircuit: 'inactive' };
  }
}

export function saveNpcProgress(
  storage: StorageLike,
  worldName: string,
  progress: NpcProgress,
): void {
  try {
    storage.setItem(npcProgressKey(worldName), JSON.stringify(progress));
  } catch {
    /* Progress remains available for this session when storage is unavailable. */
  }
}

export function clearNpcProgress(storage: StorageLike, worldName: string): void {
  try {
    storage.removeItem?.(npcProgressKey(worldName));
  } catch {
    /* Ignore unavailable storage during reset. */
  }
}
