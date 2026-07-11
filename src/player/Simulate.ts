import type { Vec3 } from '../core/types';
import type { InputState, PlayerController, PlayerWorld } from './PlayerController';

/**
 * Headless physics driver for the dev studio. The preview tab pauses requestAnimationFrame, so the
 * game loop (and thus gravity/collision/movement) never advances there. These helpers step the real
 * {@link PlayerController.update} at a fixed timestep on demand, so walking and reachability can be
 * exercised — and asserted in unit tests — without the render loop. Pure: no DOM, no renderer.
 */

const NEUTRAL: InputState = {
  forward: false,
  back: false,
  left: false,
  right: false,
  up: false,
  down: false,
  sprint: false,
  toggleFly: false,
};

/** Builds a full {@link InputState} from a partial one (missing intents default to false). */
export function makeInput(partial: Partial<InputState> = {}): InputState {
  return { ...NEUTRAL, ...partial };
}

/** Yaw whose forward vector (−sin, −cos) points toward the horizontal direction (dx,dz). */
export function yawToward(dx: number, dz: number): number {
  return Math.atan2(-dx, -dz);
}

export interface StepResult {
  frames: number;
  /** Horizontal distance the player moved over the run. */
  moved: number;
  grounded: boolean;
  finalPos: Vec3;
}

/** Advances the player's real physics `frames` times at fixed `dt`; returns the net movement. */
export function simulateSteps(
  player: PlayerController,
  world: PlayerWorld,
  input: InputState,
  yaw: number,
  frames: number,
  dt: number,
): StepResult {
  const start: Vec3 = { ...player.position };
  for (let i = 0; i < frames; i++) player.update(dt, input, yaw, world);
  const dx = player.position.x - start.x;
  const dz = player.position.z - start.z;
  return {
    frames,
    moved: Math.hypot(dx, dz),
    grounded: player.grounded,
    finalPos: { ...player.position },
  };
}

export interface WalkOptions {
  dt?: number;
  maxFrames?: number;
  /** Horizontal distance to the target counted as "arrived". */
  arriveDist?: number;
  /** Consecutive no-progress frames before giving up (blocked / unreachable). */
  stuckFrames?: number;
}

export interface WalkResult {
  arrived: boolean;
  frames: number;
  finalPos: Vec3;
  /** Horizontal distance still to the target when the walk stopped. */
  remaining: number;
  /** True when it stopped because it stopped making progress (not on arrival / frame cap). */
  stuck: boolean;
}

/**
 * Walks the player toward `target` under real physics, re-aiming (a straight beeline) each frame.
 * Stops on arrival (within `arriveDist`), at `maxFrames`, or after `stuckFrames` consecutive
 * no-progress frames. Auto-hops when stalled so 1-block ledges and straight stairs are climbed.
 * A `stuck` result with a non-trivial `remaining` means it couldn't get there on foot — a wall,
 * an unclimbable ledge, or a capped exit. For winding routes (a spiral stair) chain waypoints.
 */
export function walkToward(
  player: PlayerController,
  world: PlayerWorld,
  target: Vec3,
  opts: WalkOptions = {},
): WalkResult {
  const dt = opts.dt ?? 1 / 60;
  const maxFrames = opts.maxFrames ?? 600;
  const arriveDist = opts.arriveDist ?? 0.8;
  const stuckLimit = opts.stuckFrames ?? 24;

  let stuckCount = 0;
  let prevRemaining = Infinity;

  for (let f = 0; f < maxFrames; f++) {
    const dx = target.x - player.position.x;
    const dz = target.z - player.position.z;
    const remaining = Math.hypot(dx, dz);
    if (remaining <= arriveDist)
      return {
        arrived: true,
        frames: f,
        finalPos: { ...player.position },
        remaining,
        stuck: false,
      };

    // No measurable progress since the previous frame → count toward "stuck".
    if (prevRemaining - remaining < 1e-3) stuckCount++;
    else stuckCount = 0;
    prevRemaining = remaining;
    if (stuckCount >= stuckLimit)
      return {
        arrived: false,
        frames: f,
        finalPos: { ...player.position },
        remaining,
        stuck: true,
      };

    const input = makeInput({ forward: true, up: stuckCount > 3 }); // hop when stalled
    player.update(dt, input, yawToward(dx, dz), world);
  }

  const dxEnd = target.x - player.position.x;
  const dzEnd = target.z - player.position.z;
  return {
    arrived: false,
    frames: maxFrames,
    finalPos: { ...player.position },
    remaining: Math.hypot(dxEnd, dzEnd),
    stuck: false,
  };
}
