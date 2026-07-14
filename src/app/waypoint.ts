// A single per-world map waypoint plus the geometry for the compass chip. Stored in localStorage
// keyed by world (never in the world's own save), like resumeState. Pure storage + math here; the
// map click wiring, pointer-lock lifecycle, and HUD chip live in WorldMapUi/Game/CreativeUi.

/** A dropped waypoint. Horizontal only — an arbitrary map click has no meaningful Y. */
export interface Waypoint {
  x: number;
  z: number;
}

export const WAYPOINT_VERSION = 1;
/** Within this many blocks (horizontal) the waypoint is considered reached and auto-clears. */
export const WAYPOINT_ARRIVE_DIST = 5;

export interface WaypointStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function waypointKey(worldName: string): string {
  return `vr.waypoint.${worldName}`;
}

function isNum(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

export function parseWaypoint(raw: string | null): Waypoint | undefined {
  if (raw === null) return undefined;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (typeof data !== 'object' || data === null) return undefined;
  const r = data as Record<string, unknown>;
  if (r.v !== WAYPOINT_VERSION) return undefined;
  if (!isNum(r.x) || !isNum(r.z)) return undefined;
  return { x: r.x, z: r.z };
}

export function serializeWaypoint(wp: Waypoint): string {
  return JSON.stringify({ v: WAYPOINT_VERSION, x: wp.x, z: wp.z });
}

export function loadWaypoint(store: WaypointStore, worldName: string): Waypoint | undefined {
  try {
    return parseWaypoint(store.getItem(waypointKey(worldName)));
  } catch {
    return undefined;
  }
}

export function saveWaypoint(store: WaypointStore, worldName: string, wp: Waypoint): void {
  try {
    store.setItem(waypointKey(worldName), serializeWaypoint(wp));
  } catch {
    /* ignore — waypoint is best-effort */
  }
}

export function clearWaypoint(store: WaypointStore, worldName: string): void {
  try {
    store.removeItem(waypointKey(worldName));
  } catch {
    /* ignore */
  }
}

export interface Bearing {
  /** Horizontal distance in blocks. */
  distance: number;
  /** Compass-arrow angle in radians relative to the look direction: 0 = dead ahead, + = clockwise. */
  angle: number;
  /** True once within WAYPOINT_ARRIVE_DIST blocks. */
  arrived: boolean;
}

/**
 * Bearing from the player to a waypoint for the compass chip. This world's yaw convention has the
 * player facing forward = (-sin yaw, -cos yaw) — i.e. yaw 0 faces -Z (north/map-up) and increasing
 * yaw turns the view. The arrow angle is the waypoint's world heading (clockwise from -Z) brought
 * into the player's frame, so it reads "turn this much from where you're looking".
 */
export function waypointBearing(
  px: number,
  pz: number,
  yaw: number,
  wp: Waypoint,
): Bearing {
  const dx = wp.x - px;
  const dz = wp.z - pz;
  const distance = Math.hypot(dx, dz);
  // atan2(dx, -dz): 0 when due north (-Z), +pi/2 due east (+X) — clockwise from map-up.
  const worldHeading = Math.atan2(dx, -dz);
  let angle = worldHeading + yaw;
  // Normalize to (-pi, pi] so the arrow takes the short way round.
  angle = Math.atan2(Math.sin(angle), Math.cos(angle));
  return { distance, angle, arrived: distance <= WAYPOINT_ARRIVE_DIST };
}

export interface MapClick {
  /** Whole-block world coordinates of the click. */
  x: number;
  z: number;
  /** Canvas-pixel coordinates of the click (for landmark hit-testing). */
  px: number;
  pz: number;
}

/**
 * Invert the map's world->pixel mapping (see WorldMapUi.toPx) for a click. `rect` is the canvas'
 * on-screen box (the canvas is CSS-scaled, so client coords must be normalized through it first),
 * `canvasSize` is the backing pixel size (2·radius+1). Returns the block clicked plus the canvas
 * pixel, so a caller can hit-test landmarks in pixel space before falling back to placement.
 */
export function mapClickToWorld(
  clientX: number,
  clientY: number,
  rect: { left: number; top: number; width: number; height: number },
  canvasSize: number,
  center: { x: number; z: number },
  radius: number,
): MapClick {
  const px = Math.floor(((clientX - rect.left) / rect.width) * canvasSize);
  const pz = Math.floor(((clientY - rect.top) / rect.height) * canvasSize);
  return { x: px - radius + center.x, z: pz - radius + center.z, px, pz };
}

/** Canvas-pixel center of a landmark/world point, matching WorldMapUi's drawing (`toPx`). */
export function worldToMapPixel(
  wx: number,
  wz: number,
  center: { x: number; z: number },
  radius: number,
): { px: number; pz: number } {
  return { px: wx - center.x + radius + 0.5, pz: wz - center.z + radius + 0.5 };
}

/**
 * Index of the nearest point to a click within `hitRadius` canvas pixels, or -1. Points are given
 * in canvas-pixel space; the caller filters to discovered landmarks before calling so hidden
 * locations can't be revealed by a lucky click.
 */
export function nearestWithin(
  clickPx: number,
  clickPz: number,
  points: ReadonlyArray<{ px: number; pz: number }>,
  hitRadius: number,
): number {
  let best = -1;
  let bestD2 = hitRadius * hitRadius;
  points.forEach((p, i) => {
    const d2 = (p.px - clickPx) ** 2 + (p.pz - clickPz) ** 2;
    if (d2 <= bestD2) {
      bestD2 = d2;
      best = i;
    }
  });
  return best;
}
