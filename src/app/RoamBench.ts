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

export interface RoutePoint {
  x: number;
  z: number;
}

/** Total planar (x/z) length of a polyline, ignoring zero-length legs. */
export function routeDistance(points: RoutePoint[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += Math.hypot(points[i].x - points[i - 1].x, points[i].z - points[i - 1].z);
  }
  return total;
}

/** The x/z position at cumulative distance `d` along the polyline (clamped to the ends). */
export function positionAlongRoute(points: RoutePoint[], d: number): RoutePoint {
  if (points.length === 0) throw new Error('route needs at least one point');
  const first = points[0];
  if (points.length === 1 || d <= 0) return { x: first.x, z: first.z };
  let remaining = d;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const legLen = Math.hypot(b.x - a.x, b.z - a.z);
    if (legLen === 0) continue;
    if (remaining <= legLen) {
      const t = remaining / legLen;
      return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
    }
    remaining -= legLen;
  }
  const last = points[points.length - 1];
  return { x: last.x, z: last.z };
}

export interface RouteOptions {
  points: RoutePoint[];
  speed: number;
}

interface AxisTarget {
  kind: 'axis';
  axis: 'x' | 'z';
  speed: number;
  remaining: number;
  resolve: () => void;
}

interface RouteTarget {
  kind: 'route';
  points: RoutePoint[];
  speed: number;
  total: number;
  travelled: number;
  resolve: () => void;
}

type RoamTarget = AxisTarget | RouteTarget;

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
      this.target = {
        kind: 'axis',
        axis: opts.axis,
        speed: opts.speed,
        remaining: opts.distance,
        resolve,
      };
    });
  }

  /** Begins a route roam through x/z waypoints; resolves when the last waypoint is reached. */
  startRoute(opts: RouteOptions): Promise<void> {
    return new Promise<void>((resolve) => {
      this.target = {
        kind: 'route',
        points: opts.points,
        speed: opts.speed,
        total: routeDistance(opts.points),
        travelled: 0,
        resolve,
      };
    });
  }

  /** Advances the player one frame; no-op when no roam is active. */
  step(dt: number): void {
    const t = this.target;
    if (!t) return;
    if (t.kind === 'axis') {
      const { advance, remaining, done } = roamStep(t.remaining, t.speed, dt);
      this.player.position[t.axis] += advance;
      t.remaining = remaining;
      if (done) {
        this.target = undefined;
        t.resolve();
      }
      return;
    }
    t.travelled = Math.min(t.travelled + t.speed * dt, t.total);
    const pos = positionAlongRoute(t.points, t.travelled);
    this.player.position.x = pos.x;
    this.player.position.z = pos.z;
    if (t.travelled >= t.total) {
      this.target = undefined;
      t.resolve();
    }
  }
}
