// src/app/landmarkDiscovery.ts
//
// Landmark discovery medals: walking near a curated world's landmark marks it found, with
// progress persisted per save. Pure logic — Game owns the tick cadence, toasts, and sound;
// the world map and info dialog read `isFound` to hide undiscovered names behind "???".
import type { MetaPoint } from '../persistence/SaveTypes';

export type Landmark = { name: string } & MetaPoint;

/**
 * Horizontal discovery radius in blocks. Wider than the tour's arrival radius (4) — brushing
 * past a lighthouse should count without demanding the player touch its wall — and horizontal
 * only, because landmark anchors often sit on towers or bridge decks above the walking path.
 */
export const DISCOVERY_RADIUS = 12;

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function loadFound(storage: StorageLike | undefined, key: string): Set<string> {
  try {
    const raw = storage?.getItem(key);
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((n): n is string => typeof n === 'string'));
  } catch {
    return new Set();
  }
}

export class LandmarkDiscovery {
  private readonly found: Set<string>;

  constructor(
    private readonly landmarks: readonly Landmark[],
    private readonly storageKey: string,
    private readonly storage: StorageLike | undefined = typeof localStorage === 'undefined'
      ? undefined
      : localStorage,
  ) {
    const stored = loadFound(this.storage, storageKey);
    // Keep only names that still exist in the world meta (stale saves self-heal).
    this.found = new Set(landmarks.filter((l) => stored.has(l.name)).map((l) => l.name));
  }

  get total(): number {
    return this.landmarks.length;
  }

  get foundCount(): number {
    return this.found.size;
  }

  get complete(): boolean {
    return this.total > 0 && this.found.size === this.total;
  }

  isFound(name: string): boolean {
    return this.found.has(name);
  }

  /** Marks landmarks within the discovery radius of (px,pz); returns the newly found ones. */
  tick(px: number, pz: number): Landmark[] {
    const discovered: Landmark[] = [];
    for (const l of this.landmarks) {
      if (this.found.has(l.name)) continue;
      if (Math.hypot(l.x - px, l.z - pz) > DISCOVERY_RADIUS) continue;
      this.found.add(l.name);
      discovered.push(l);
    }
    if (discovered.length > 0) this.persist();
    return discovered;
  }

  private persist(): void {
    try {
      this.storage?.setItem(this.storageKey, JSON.stringify([...this.found]));
    } catch {
      /* storage unavailable — progress lives for this session only */
    }
  }
}
