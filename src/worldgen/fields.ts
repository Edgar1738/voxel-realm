/**
 * Scalar-field combinators for authored terrain. Every authored preset so far (citadel, harbor)
 * hand-rolled its own smoothstep/clamp/ramp math; this module collects the shared vocabulary so
 * a composed landscape — basins, plateaus, ridges, path corridors — can be written declaratively
 * and deterministically. All functions are pure.
 */

/** Hermite smoothstep of t clamped to [0,1]. */
export function smoothstep01(t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return t * t * (3 - 2 * t);
}

/** Linear interpolation. */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Round + clamp to an integer range (heightfield → voxel column). */
export function clampInt(value: number, lo: number, hi: number): number {
  const r = Math.round(value);
  return r < lo ? lo : r > hi ? hi : r;
}

/**
 * Polynomial smooth minimum (Inigo Quilez): blends two surfaces with a fillet of radius ~k
 * instead of a hard crease. k = 0 degenerates to Math.min.
 */
export function smin(a: number, b: number, k: number): number {
  if (k <= 0) return Math.min(a, b);
  const h = Math.max(0, Math.min(1, 0.5 + (0.5 * (b - a)) / k));
  return lerp(b, a, h) - k * h * (1 - h);
}

/** Polynomial smooth maximum — smin mirrored; blends a plateau up out of a base surface. */
export function smax(a: number, b: number, k: number): number {
  return -smin(-a, -b, k);
}

/**
 * Normalized superellipse radius: 0 at the center, 1 on the rim, >1 outside. Exponent `pow`
 * shapes the footprint — 2 is an ellipse, higher drifts toward a rounded rectangle, which reads
 * far more organic than a perfect ellipse once noise wobbles the rim.
 */
export function superellipseT(dx: number, dz: number, rx: number, rz: number, pow: number): number {
  const nx = Math.abs(dx) / rx;
  const nz = Math.abs(dz) / rz;
  return (nx ** pow + nz ** pow) ** (1 / pow);
}

/**
 * A smooth directional lobe around heading `theta0`, in [0,1]: 1 when pointing at the lobe,
 * falling to 0 on the opposite bearing. `sharpness` >= 1 narrows the lobe. Continuous across
 * the ±π wrap (built on cos), so radial fields modulated by it never seam.
 */
export function directionalLobe(theta: number, theta0: number, sharpness: number): number {
  const c = (Math.cos(theta - theta0) + 1) * 0.5;
  return c ** sharpness;
}

/** Distance from point (px,pz) to segment (ax,az)-(bx,bz). */
export function segmentDistance(
  px: number,
  pz: number,
  ax: number,
  az: number,
  bx: number,
  bz: number,
): number {
  const dx = bx - ax;
  const dz = bz - az;
  const lenSq = dx * dx + dz * dz;
  let t = 0;
  if (lenSq > 0) t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / lenSq));
  const cx = ax + dx * t;
  const cz = az + dz * t;
  return Math.hypot(px - cx, pz - cz);
}

export interface PolylinePoint {
  x: number;
  z: number;
}

/** Result of projecting a point onto a polyline: distance to it and arc-length at the foot. */
export interface PolylineHit {
  /** Distance from the query point to the nearest point on the polyline. */
  dist: number;
  /** Arc length from the polyline start to that nearest point. */
  along: number;
}

/**
 * Nearest-point query against a polyline, returning both the distance and how far along the
 * path the foot lies. `along` lets callers interpolate a profile down the path — e.g. a road's
 * elevation, a stream's bed — so one polyline drives both the corridor mask and its grade.
 */
export function polylineProject(
  px: number,
  pz: number,
  pts: readonly PolylinePoint[],
): PolylineHit {
  let best = Infinity;
  let bestAlong = 0;
  let walked = 0;
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const segLen = Math.hypot(b.x - a.x, b.z - a.z);
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const lenSq = dx * dx + dz * dz;
    let t = 0;
    if (lenSq > 0) t = Math.max(0, Math.min(1, ((px - a.x) * dx + (pz - a.z) * dz) / lenSq));
    const cx = a.x + dx * t;
    const cz = a.z + dz * t;
    const d = Math.hypot(px - cx, pz - cz);
    if (d < best) {
      best = d;
      bestAlong = walked + segLen * t;
    }
    walked += segLen;
  }
  return { dist: best, along: bestAlong };
}

/** Total arc length of a polyline. */
export function polylineLength(pts: readonly PolylinePoint[]): number {
  let len = 0;
  for (let i = 0; i + 1 < pts.length; i++) {
    len += Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].z - pts[i].z);
  }
  return len;
}

/** A polyline waypoint with an authored elevation. */
export interface RoutePoint extends PolylinePoint {
  y: number;
}

/**
 * A route with an elevation profile: one polyline drives both the corridor mask (project) and
 * the grade (yAt). Terrain lerps toward `yAt(along)` inside the corridor, so a road becomes a
 * walkable cut-and-fill ledge through whatever it crosses; a site overlay then paves the same
 * line. Waypoint elevations interpolate linearly by arc length.
 */
export class RouteSpline {
  private readonly cum: number[];
  readonly length: number;

  constructor(readonly pts: readonly RoutePoint[]) {
    this.cum = [0];
    for (let i = 0; i + 1 < pts.length; i++) {
      this.cum.push(this.cum[i] + Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].z - pts[i].z));
    }
    this.length = this.cum[this.cum.length - 1];
  }

  /** Nearest-point query: distance to the route and arc-length of the foot. */
  project(px: number, pz: number): PolylineHit {
    return polylineProject(px, pz, this.pts);
  }

  /** The authored elevation at an arc-length position. */
  yAt(along: number): number {
    const a = Math.max(0, Math.min(this.length, along));
    let i = 0;
    while (i + 1 < this.cum.length - 1 && this.cum[i + 1] < a) i++;
    const span = this.cum[i + 1] - this.cum[i];
    const t = span > 0 ? (a - this.cum[i]) / span : 0;
    return lerp(this.pts[i].y, this.pts[i + 1].y, t);
  }

  /** The (x, z) point at an arc-length position — for walking the route in tests/tours. */
  pointAt(along: number): { x: number; z: number } {
    const a = Math.max(0, Math.min(this.length, along));
    let i = 0;
    while (i + 1 < this.cum.length - 1 && this.cum[i + 1] < a) i++;
    const span = this.cum[i + 1] - this.cum[i];
    const t = span > 0 ? (a - this.cum[i]) / span : 0;
    return {
      x: lerp(this.pts[i].x, this.pts[i + 1].x, t),
      z: lerp(this.pts[i].z, this.pts[i + 1].z, t),
    };
  }
}
