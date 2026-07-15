import type { MetaPoint } from '../persistence/SaveTypes';

export interface ChallengeWaypoint extends MetaPoint {
  name: string;
}

export const THREE_FLAG_WAYPOINTS: readonly ChallengeWaypoint[] = [
  { name: 'Rose Flag', x: -24, y: 63, z: 2 },
  { name: 'Sand Bend', x: 24, y: 63, z: -22 },
  { name: 'Sun Crown', x: 0, y: 63, z: -52 },
];

export const THREE_FLAG_ARRIVAL_RADIUS = 3.5;

export interface ThreeFlagRun {
  index: number;
  elapsed: number;
}

export interface ThreeFlagTick {
  run?: ThreeFlagRun;
  reached?: ChallengeWaypoint;
  completed: boolean;
  elapsed: number;
}

export function startThreeFlagChallenge(): ThreeFlagRun {
  return { index: 0, elapsed: 0 };
}

export function challengeDistance(run: ThreeFlagRun, px: number, pz: number): number {
  const target =
    THREE_FLAG_WAYPOINTS[Math.max(0, Math.min(THREE_FLAG_WAYPOINTS.length - 1, run.index))];
  return Math.hypot(target.x + 0.5 - px, target.z + 0.5 - pz);
}

export function tickThreeFlagChallenge(
  run: ThreeFlagRun,
  px: number,
  pz: number,
  dt: number,
): ThreeFlagTick {
  const nextRun = { index: run.index, elapsed: run.elapsed + Math.max(0, dt) };
  const target = THREE_FLAG_WAYPOINTS[nextRun.index];
  if (!target || challengeDistance(nextRun, px, pz) > THREE_FLAG_ARRIVAL_RADIUS) {
    return { run: nextRun, completed: false, elapsed: nextRun.elapsed };
  }
  if (nextRun.index >= THREE_FLAG_WAYPOINTS.length - 1) {
    return { reached: target, completed: true, elapsed: nextRun.elapsed };
  }
  return {
    run: { index: nextRun.index + 1, elapsed: nextRun.elapsed },
    reached: target,
    completed: false,
    elapsed: nextRun.elapsed,
  };
}

export function formatChallengeTime(seconds: number): string {
  const safe = Math.max(0, seconds);
  const minutes = Math.floor(safe / 60);
  const remainder = safe - minutes * 60;
  return `${minutes}:${remainder.toFixed(1).padStart(4, '0')}`;
}
