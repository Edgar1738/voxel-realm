// Global (not per-world) player preferences: look sensitivity, field of view, invert-Y, and the
// view-distance quality cap. Pure clamp + load/save against a localStorage-shaped store, so Game
// stays thin and the ranges are unit-tested. Hotbar persistence is separate (per-world).
import { MAX_VIEW_DISTANCE } from '../core/constants';

export interface PrefStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const SENSITIVITY_KEY = 'vr.mouseSensitivity';
export const FOV_KEY = 'vr.fov';
export const INVERT_Y_KEY = 'vr.invertY';
export const VIEW_QUALITY_KEY = 'vr.viewQuality';

export const DEFAULT_SENSITIVITY = 1;
export const SENSITIVITY_MIN = 0.3;
export const SENSITIVITY_MAX = 2.5;

export const DEFAULT_FOV = 70;
export const FOV_MIN = 50;
export const FOV_MAX = 100;

export type ViewQuality = 'short' | 'medium' | 'far';
export const DEFAULT_VIEW_QUALITY: ViewQuality = 'far';

/** The adaptive view-distance ceiling for each quality. "far" tracks the engine's real maximum. */
export function qualityMaxVd(q: ViewQuality): number {
  switch (q) {
    case 'short':
      return 6;
    case 'medium':
      return 10;
    case 'far':
      return MAX_VIEW_DISTANCE;
  }
}

export function clampSensitivity(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_SENSITIVITY;
  return Math.min(SENSITIVITY_MAX, Math.max(SENSITIVITY_MIN, n));
}

export function clampFov(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_FOV;
  return Math.round(Math.min(FOV_MAX, Math.max(FOV_MIN, n)));
}

function readNumber(store: PrefStore, key: string): number | undefined {
  try {
    const raw = store.getItem(key);
    if (raw === null) return undefined;
    const n = Number(raw);
    return Number.isFinite(n) ? n : undefined;
  } catch {
    return undefined;
  }
}

function write(store: PrefStore, key: string, value: string): void {
  try {
    store.setItem(key, value);
  } catch {
    /* ignore — preferences are best-effort */
  }
}

export function loadSensitivity(store: PrefStore): number {
  const n = readNumber(store, SENSITIVITY_KEY);
  return n === undefined ? DEFAULT_SENSITIVITY : clampSensitivity(n);
}

export function saveSensitivity(store: PrefStore, value: number): void {
  write(store, SENSITIVITY_KEY, String(clampSensitivity(value)));
}

export function loadFov(store: PrefStore): number {
  const n = readNumber(store, FOV_KEY);
  return n === undefined ? DEFAULT_FOV : clampFov(n);
}

export function saveFov(store: PrefStore, value: number): void {
  write(store, FOV_KEY, String(clampFov(value)));
}

export function loadInvertY(store: PrefStore): boolean {
  try {
    return store.getItem(INVERT_Y_KEY) === 'on';
  } catch {
    return false;
  }
}

export function saveInvertY(store: PrefStore, on: boolean): void {
  write(store, INVERT_Y_KEY, on ? 'on' : 'off');
}

function isViewQuality(v: string | null): v is ViewQuality {
  return v === 'short' || v === 'medium' || v === 'far';
}

export function loadViewQuality(store: PrefStore): ViewQuality {
  try {
    const raw = store.getItem(VIEW_QUALITY_KEY);
    return isViewQuality(raw) ? raw : DEFAULT_VIEW_QUALITY;
  } catch {
    return DEFAULT_VIEW_QUALITY;
  }
}

export function saveViewQuality(store: PrefStore, q: ViewQuality): void {
  write(store, VIEW_QUALITY_KEY, q);
}
