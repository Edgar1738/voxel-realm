import type { MetaPoint, WorldMeta } from '../persistence/SaveTypes';

/**
 * Pure tour-following logic for the play-mode tour HUD. A tour is the world's ordered
 * `meta.tour` waypoints; the player walks toward the active one and the tour advances when
 * they arrive (horizontal distance only — waypoints may sit on towers or bridges the player
 * approaches from a different height).
 */
export interface TourWaypoint extends MetaPoint {
  name?: string;
}

export interface TourStatus {
  /** Index of the active waypoint (clamped to the route). */
  index: number;
  /** Player-facing label of the active waypoint. */
  name: string;
  /** Horizontal distance from the player to the active waypoint, in blocks. */
  distance: number;
  /** Total number of waypoints in the route. */
  total: number;
  /** True once the final waypoint has been reached. */
  done: boolean;
}

/** Waypoints must be within this horizontal distance to count as "arrived". */
export const TOUR_ARRIVAL_RADIUS = 4;

/** A world's tour route, or undefined when it has fewer than 2 waypoints (nothing to follow). */
export function tourRoute(meta: WorldMeta | undefined): TourWaypoint[] | undefined {
  const tour = meta?.tour;
  return tour && tour.length >= 2 ? tour : undefined;
}

function horizontalDistance(px: number, pz: number, wp: MetaPoint): number {
  return Math.hypot(wp.x - px, wp.z - pz);
}

function waypointName(route: TourWaypoint[], index: number): string {
  return route[index].name?.trim() || `Waypoint ${index + 1}`;
}

/**
 * One tour tick: given the active waypoint index and the player position, report the live
 * status, advancing past every waypoint already within `radius` (a spawn on top of the first
 * waypoint immediately moves on to the second). `done` sticks at the last waypoint.
 */
export function tourTick(
  route: TourWaypoint[],
  index: number,
  px: number,
  pz: number,
  radius: number = TOUR_ARRIVAL_RADIUS,
): TourStatus {
  let i = Math.max(0, Math.min(route.length - 1, index));
  while (i < route.length - 1 && horizontalDistance(px, pz, route[i]) <= radius) i += 1;
  const distance = horizontalDistance(px, pz, route[i]);
  return {
    index: i,
    name: waypointName(route, i),
    distance,
    total: route.length,
    done: i === route.length - 1 && distance <= radius,
  };
}

/** Manual next/previous: step the active index, clamped to the route ends. */
export function tourStep(route: TourWaypoint[], index: number, delta: 1 | -1): number {
  return Math.max(0, Math.min(route.length - 1, index + delta));
}
