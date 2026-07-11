// src/app/bootStats.ts

/** One timed boot phase (or a 'vr:'-prefixed performance.measure entry). */
export interface BootPhaseReport {
  name: string;
  ms: number;
}

/** A point-in-time boot milestone, in ms since boot start. */
export interface BootEventReport {
  name: string;
  atMs: number;
}

export interface BootReport {
  /** Boot start → the latest recorded phase end or event. */
  totalMs: number;
  phases: BootPhaseReport[];
  events: BootEventReport[];
  /** All 'vr:'-prefixed performance.measure entries (e.g. the shipped-world fetch/parse split). */
  measures: BootPhaseReport[];
}

/**
 * Boot-phase timing recorder. Game.boot wraps each startup step in begin()/end() (or span()
 * for awaited steps) and signals milestones with event(); report() returns everything for
 * `window.__vrBootStats()`. Phases also emit performance.measure entries named
 * `vr:boot:<phase>` so the same spans show up in a DevTools performance trace.
 */
export class BootStats {
  private readonly t0: number;
  private readonly phases: BootPhaseReport[] = [];
  private readonly events = new Map<string, number>();
  private readonly open = new Map<string, number>();
  private lastMs = 0;

  constructor(private readonly now: () => number = () => performance.now()) {
    this.t0 = this.now();
  }

  begin(name: string): void {
    this.open.set(name, this.now());
  }

  end(name: string): void {
    const start = this.open.get(name);
    if (start === undefined) return;
    this.open.delete(name);
    const endAt = this.now();
    this.phases.push({ name, ms: endAt - start });
    this.lastMs = Math.max(this.lastMs, endAt - this.t0);
    recordMeasure(`vr:boot:${name}`, start, endAt);
  }

  /** Times an awaited step; the phase ends when the promise settles (also on rejection). */
  async span<T>(name: string, fn: () => Promise<T>): Promise<T> {
    this.begin(name);
    try {
      return await fn();
    } finally {
      this.end(name);
    }
  }

  /** Records a milestone at "now". First occurrence wins (e.g. only the first frame counts). */
  event(name: string): void {
    if (this.events.has(name)) return;
    const atMs = this.now() - this.t0;
    this.events.set(name, atMs);
    this.lastMs = Math.max(this.lastMs, atMs);
  }

  has(name: string): boolean {
    return this.events.has(name);
  }

  report(): BootReport {
    return {
      totalMs: this.lastMs,
      phases: [...this.phases],
      events: [...this.events.entries()].map(([name, atMs]) => ({ name, atMs })),
      measures: vrMeasures(),
    };
  }
}

/**
 * Emits a performance.measure over an explicit [start, end] window (ms in the
 * performance.now() timebase). No-ops where the Performance API is unavailable (tests).
 */
export function recordMeasure(name: string, startMs: number, endMs: number): void {
  try {
    performance.measure(name, { start: startMs, end: endMs });
  } catch {
    /* Performance API unavailable or measure() lacks options support — timing is best-effort */
  }
}

/** All 'vr:'-prefixed performance.measure entries currently in the buffer. */
function vrMeasures(): BootPhaseReport[] {
  try {
    return performance
      .getEntriesByType('measure')
      .filter((e) => e.name.startsWith('vr:'))
      .map((e) => ({ name: e.name, ms: e.duration }));
  } catch {
    return [];
  }
}
