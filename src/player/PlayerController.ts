import { resolveCollision, type SoliditySampler } from './Collision';
import type { Vec3 } from '../core/types';

/** Per-frame input intents (booleans; `toggleFly` is a one-frame edge). */
export interface InputState {
  forward: boolean;
  back: boolean;
  left: boolean;
  right: boolean;
  up: boolean; // Space: fly up / jump / swim up
  down: boolean; // Shift: fly down / sink
  /** Double-tap-W sprint intent; only applies while walking forward on land. */
  sprint: boolean;
  toggleFly: boolean;
}

/** The world the player queries: solidity (for collision) plus water (for swimming). */
export interface PlayerWorld extends SoliditySampler {
  isWater(x: number, y: number, z: number): boolean;
  /** Whether the cell hosts a climbable block (ladder). Optional for older samplers/tests. */
  isClimbable?(x: number, y: number, z: number): boolean;
}

/** Player collision half-extents around the body center (exported for placement guards). */
export const PLAYER_HALF: Vec3 = { x: 0.3, y: 0.9, z: 0.3 };
const HALF = PLAYER_HALF;
const EYE_OFFSET = 0.7; // eye height above body center (~1.6 above feet)

const WALK_SPEED = 5.5;
const SPRINT_SPEED = 7.7; // Minecraft's ~1.4x walk
const FLY_SPEED = 30;
const GRAVITY = -28;
const JUMP_VELOCITY = 9;

const SWIM_SPEED = 3.3; // ~0.6x walk
const SWIM_VERTICAL = 4; // Space up / Shift down speed in water
const SWIM_SINK = 1.2; // gentle buoyant sink with no input

const CLIMB_SPEED = 4; // ladder up (forward/Space) and down (Shift)
const CLIMB_SLIDE = 1.5; // gentle slide when idle on a ladder (Minecraft-style)
const CLIMB_HORIZONTAL = 2.5; // slow sideways shuffle while hanging on

/** Owns the player's position/velocity and integrates input + physics each frame. */
export class PlayerController {
  readonly position: Vec3;
  flying: boolean;
  grounded = false;
  /** True while sprint speed is actually applied this frame (drives the camera FOV kick). */
  sprinting = false;
  private vy = 0;

  constructor(spawn: Vec3, flying: boolean) {
    this.position = { ...spawn };
    this.flying = flying;
  }

  /** Eye position for the camera (above the body center). */
  eye(): Vec3 {
    return { x: this.position.x, y: this.position.y + EYE_OFFSET, z: this.position.z };
  }

  update(dt: number, input: InputState, yaw: number, world: PlayerWorld): void {
    if (input.toggleFly) {
      this.flying = !this.flying;
      this.vy = 0;
    }

    const feetY = this.position.y - HALF.y;
    const headY = this.position.y + HALF.y;
    const submerged =
      !this.flying &&
      (world.isWater(Math.floor(this.position.x), Math.floor(feetY), Math.floor(this.position.z)) ||
        world.isWater(Math.floor(this.position.x), Math.floor(headY), Math.floor(this.position.z)));
    // On a ladder when the body column overlaps a climbable cell (ladders have no collision
    // box, so the check is the whole cell — grabbing feels generous, like Minecraft).
    const climbable = (y: number): boolean =>
      world.isClimbable?.(
        Math.floor(this.position.x),
        Math.floor(y),
        Math.floor(this.position.z),
      ) ?? false;
    const onLadder = !this.flying && !submerged && (climbable(feetY) || climbable(this.position.y));

    // Horizontal direction from yaw (forward = -Z at yaw 0, right = +X at yaw 0).
    const fwd: Vec3 = { x: -Math.sin(yaw), y: 0, z: -Math.cos(yaw) };
    const right: Vec3 = { x: Math.cos(yaw), y: 0, z: -Math.sin(yaw) };
    const iz = (input.forward ? 1 : 0) - (input.back ? 1 : 0);
    const ix = (input.right ? 1 : 0) - (input.left ? 1 : 0);

    let mx = fwd.x * iz + right.x * ix;
    let mz = fwd.z * iz + right.z * ix;
    const len = Math.hypot(mx, mz);
    if (len > 1) {
      mx /= len;
      mz /= len;
    }

    this.sprinting =
      !this.flying && !submerged && !onLadder && input.sprint && input.forward && !input.back;
    const speed = this.flying
      ? FLY_SPEED
      : submerged
        ? SWIM_SPEED
        : onLadder
          ? CLIMB_HORIZONTAL
          : this.sprinting
            ? SPRINT_SPEED
            : WALK_SPEED;
    const delta: Vec3 = { x: mx * speed * dt, y: 0, z: mz * speed * dt };

    if (this.flying) {
      const vs = (input.up ? 1 : 0) - (input.down ? 1 : 0);
      delta.y = vs * FLY_SPEED * dt;
      this.vy = 0;
    } else if (onLadder) {
      // Forward or Space climbs, Shift descends, idle slides down slowly. Gravity is
      // suspended while hanging on, so letting go of the keys never means a plummet.
      if (input.forward || input.up) this.vy = CLIMB_SPEED;
      else if (input.down) this.vy = -CLIMB_SPEED;
      else this.vy = -CLIMB_SLIDE;
      delta.y = this.vy * dt;
    } else if (submerged) {
      if (input.up) this.vy = SWIM_VERTICAL;
      else if (input.down) this.vy = -SWIM_VERTICAL;
      else this.vy = -SWIM_SINK; // gentle buoyant sink
      delta.y = this.vy * dt;
    } else {
      if (input.up && this.grounded) this.vy = JUMP_VELOCITY;
      this.vy += GRAVITY * dt;
      delta.y = this.vy * dt;
    }

    const res = resolveCollision(world, this.position, HALF, delta, this.grounded);
    this.position.x = res.center.x;
    this.position.y = res.center.y;
    this.position.z = res.center.z;
    this.grounded = this.flying || submerged ? false : res.grounded;
    if (res.grounded && this.vy < 0) this.vy = 0;
  }
}
