/**
 * Dev-only deterministic roam driver for `__vr.bench` (P0 profiling spike).
 * Advances the player along one horizontal axis by `speed * dt` each frame so the
 * spatial path is frame-rate independent (the same chunks stream regardless of fps).
 * Pure {@link roamStep} is unit-tested; {@link RoamDriver} wires it to the player and
 * resolves a promise once the target distance is covered.
 */

export interface RoamStepResult {
  /** Distance to advance this frame (capped to the remaining distance). */
  advance: number;
  /** Distance still to travel after this step. */
  remaining: number;
  /** Whether the roam is complete after this step. */
  done: boolean;
}

/** Computes one frame's advance toward the target, never overshooting. */
export function roamStep(remaining: number, speed: number, dt: number): RoamStepResult {
  const want = speed * dt;
  const advance = Math.min(want, remaining);
  const rest = remaining - advance;
  return { advance, remaining: rest, done: rest <= 0 };
}

export interface RoamOptions {
  axis: 'x' | 'z';
  distance: number;
  speed: number;
}

interface RoamTarget {
  axis: 'x' | 'z';
  speed: number;
  remaining: number;
  resolve: () => void;
}

interface MovablePlayer {
  position: { x: number; y: number; z: number };
}

export class RoamDriver {
  private target: RoamTarget | undefined;

  constructor(private readonly player: MovablePlayer) {}

  get active(): boolean {
    return this.target !== undefined;
  }

  /** Begins a roam; resolves when the full distance has been travelled. */
  start(opts: RoamOptions): Promise<void> {
    return new Promise<void>((resolve) => {
      this.target = { axis: opts.axis, speed: opts.speed, remaining: opts.distance, resolve };
    });
  }

  /** Advances the player one frame; no-op when no roam is active. */
  step(dt: number): void {
    const t = this.target;
    if (!t) return;
    const { advance, remaining, done } = roamStep(t.remaining, t.speed, dt);
    this.player.position[t.axis] += advance;
    t.remaining = remaining;
    if (done) {
      this.target = undefined;
      t.resolve();
    }
  }
}
