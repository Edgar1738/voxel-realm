// Per-world "resume where you left off" state. Stored in localStorage, keyed by world name, and
// kept out of the world's own save/meta so exports and shipped bundles never carry a player's last
// position. Pure parsing/validation here; Game wires the load/save/clear lifecycle.
import type { ResumeSpawn } from './bootSpawn';

/** A player's last position + look + locomotion mode in a world. */
export interface ResumeState {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  /** Whether the player was flying — restored so a walker resumes walking, not hovering. */
  flying: boolean;
}

/** Bumped only if the record shape changes; older/newer records are ignored on load. */
export const RESUME_VERSION = 1;

const HALF_PI = Math.PI / 2;

/** Minimal Storage surface (localStorage in the app, a fake in tests). */
export interface ResumeStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function resumeKey(worldName: string): string {
  return `vr.resume.${worldName}`;
}

function isNum(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

/**
 * Parse a stored resume record, or `undefined` for anything missing, malformed, or from a
 * different version. Pitch is clamped to +/- 90 degrees so a corrupt value can't invert the camera.
 */
export function parseResume(raw: string | null): ResumeState | undefined {
  if (raw === null) return undefined;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (typeof data !== 'object' || data === null) return undefined;
  const r = data as Record<string, unknown>;
  if (r.v !== RESUME_VERSION) return undefined;
  if (!isNum(r.x) || !isNum(r.y) || !isNum(r.z) || !isNum(r.yaw) || !isNum(r.pitch)) return undefined;
  if (typeof r.flying !== 'boolean') return undefined;
  const pitch = Math.max(-HALF_PI, Math.min(HALF_PI, r.pitch));
  return { x: r.x, y: r.y, z: r.z, yaw: r.yaw, pitch, flying: r.flying };
}

export function serializeResume(state: ResumeState): string {
  return JSON.stringify({ v: RESUME_VERSION, ...state });
}

/** Load the resume record for a world, failing open to `undefined` if storage is unavailable. */
export function loadResume(store: ResumeStore, worldName: string): ResumeState | undefined {
  try {
    return parseResume(store.getItem(resumeKey(worldName)));
  } catch {
    return undefined;
  }
}

export function saveResume(store: ResumeStore, worldName: string, state: ResumeState): void {
  try {
    store.setItem(resumeKey(worldName), serializeResume(state));
  } catch {
    /* ignore persistence failure — resume is best-effort */
  }
}

export function clearResume(store: ResumeStore, worldName: string): void {
  try {
    store.removeItem(resumeKey(worldName));
  } catch {
    /* ignore */
  }
}

/** Adapt a resume record into the per-field spawn/look inputs `resolveSpawn` consumes. */
export function resumeToSpawn(state: ResumeState | undefined): ResumeSpawn | undefined {
  if (!state) return undefined;
  return {
    spawn: { x: state.x, y: state.y, z: state.z },
    look: { yaw: state.yaw, pitch: state.pitch },
    flying: state.flying,
  };
}
