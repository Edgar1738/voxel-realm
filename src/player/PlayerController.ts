import { resolveCollision, type SoliditySampler } from './Collision';
import type { Vec3 } from '../core/types';

/** Per-frame input intents (booleans; `toggleFly` is a one-frame edge). */
export interface InputState {
  forward: boolean;
  back: boolean;
  left: boolean;
  right: boolean;
  up: boolean; // Space: fly up / jump
  down: boolean; // Shift: fly down
  toggleFly: boolean;
}

const HALF: Vec3 = { x: 0.3, y: 0.9, z: 0.3 };
const EYE_OFFSET = 0.7; // eye height above body center (~1.6 above feet)

const WALK_SPEED = 5.5;
const FLY_SPEED = 30;
const GRAVITY = -28;
const JUMP_VELOCITY = 9;

/** Owns the player's position/velocity and integrates input + physics each frame. */
export class PlayerController {
  readonly position: Vec3;
  flying: boolean;
  grounded = false;
  private vy = 0;

  constructor(spawn: Vec3, flying: boolean) {
    this.position = { ...spawn };
    this.flying = flying;
  }

  /** Eye position for the camera (above the body center). */
  eye(): Vec3 {
    return { x: this.position.x, y: this.position.y + EYE_OFFSET, z: this.position.z };
  }

  update(dt: number, input: InputState, yaw: number, sampler: SoliditySampler): void {
    if (input.toggleFly) {
      this.flying = !this.flying;
      this.vy = 0;
    }

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

    const speed = this.flying ? FLY_SPEED : WALK_SPEED;
    const delta: Vec3 = { x: mx * speed * dt, y: 0, z: mz * speed * dt };

    if (this.flying) {
      const vs = (input.up ? 1 : 0) - (input.down ? 1 : 0);
      delta.y = vs * FLY_SPEED * dt;
      this.vy = 0;
    } else {
      if (input.up && this.grounded) this.vy = JUMP_VELOCITY;
      this.vy += GRAVITY * dt;
      delta.y = this.vy * dt;
    }

    const res = resolveCollision(sampler, this.position, HALF, delta);
    this.position.x = res.center.x;
    this.position.y = res.center.y;
    this.position.z = res.center.z;
    this.grounded = this.flying ? false : res.grounded;
    if (res.grounded && this.vy < 0) this.vy = 0;
  }
}
