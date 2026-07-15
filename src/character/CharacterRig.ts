import { Group, type Object3D } from 'three';

export type CharacterTransform = readonly [number, number, number];

export interface CharacterJointDefinition {
  id: string;
  parent?: string;
  pos?: CharacterTransform;
  rotation?: CharacterTransform;
  /** Optional compatibility/debug name; defaults to `joint:<id>`. */
  objectName?: string;
}

export interface CharacterJointTransform {
  pos?: CharacterTransform;
  rotation?: CharacterTransform;
}

export interface CharacterJointSnapshot {
  pos: [number, number, number];
  rotation: [number, number, number];
}

export interface CharacterJointState extends CharacterJointSnapshot {
  id: string;
  parent?: string;
}

export type CharacterPose = Readonly<Record<string, CharacterJointTransform>>;
export type CharacterPoseSnapshot = Map<string, CharacterJointSnapshot>;

export type CharacterEasing =
  | 'linear'
  | 'ease-in'
  | 'ease-out'
  | 'ease-in-out'
  | 'smoothstep'
  | 'step';

export interface CharacterKeyframe extends CharacterJointTransform {
  time: number;
  /** Easing used while travelling from this keyframe to the next. */
  easing?: CharacterEasing;
}

export interface CharacterAnimationTrack {
  joint: string;
  keyframes: readonly CharacterKeyframe[];
  /** Add sampled values to the rest transform instead of treating them as absolute targets. */
  mode?: 'absolute' | 'additive';
}

export interface CharacterAnimationClip {
  id: string;
  label: string;
  duration: number;
  loop?: boolean;
  /** Optional joint mask. Tracks outside it are ignored, enabling upper/lower-body layers. */
  mask?: readonly string[];
  tracks: readonly CharacterAnimationTrack[];
}

export interface CharacterAnimationPlayback {
  transitionSeconds?: number;
}

function wrapAngle(angle: number): number {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

function mixAngle(from: number, to: number, amount: number): number {
  return from + wrapAngle(to - from) * amount;
}

function tuple(source: CharacterTransform | undefined): [number, number, number] {
  return source ? [source[0], source[1], source[2]] : [0, 0, 0];
}

export function characterEase(kind: CharacterEasing, amount: number): number {
  const t = Math.max(0, Math.min(1, amount));
  if (kind === 'ease-in') return t * t;
  if (kind === 'ease-out') return 1 - (1 - t) * (1 - t);
  if (kind === 'ease-in-out') return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
  if (kind === 'smoothstep') return t * t * (3 - 2 * t);
  if (kind === 'step') return t < 1 ? 0 : 1;
  return t;
}

/** Shared rigid-joint hierarchy used by player skins and authored NPCs. */
export class CharacterRig {
  readonly joints = new Map<string, Group>();
  private readonly rest = new Map<string, CharacterJointSnapshot>();
  private readonly parents = new Map<string, string | undefined>();

  constructor(host: Object3D, definitions: readonly CharacterJointDefinition[]) {
    for (const definition of definitions) {
      if (this.joints.has(definition.id)) {
        throw new Error(`duplicate character joint: ${definition.id}`);
      }
      const parent = definition.parent ? this.joints.get(definition.parent) : host;
      if (!parent) {
        throw new Error(
          `character joint ${definition.id} references missing parent ${definition.parent}`,
        );
      }
      const joint = new Group();
      joint.name = definition.objectName ?? `joint:${definition.id}`;
      const pos = tuple(definition.pos);
      const rotation = tuple(definition.rotation);
      joint.position.set(...pos);
      joint.rotation.set(...rotation);
      parent.add(joint);
      this.joints.set(definition.id, joint);
      this.parents.set(definition.id, definition.parent);
      this.rest.set(definition.id, { pos, rotation });
    }
  }

  joint(id: string): Group | undefined {
    return this.joints.get(id);
  }

  ids(): string[] {
    return [...this.joints.keys()];
  }

  capture(): CharacterPoseSnapshot {
    const result: CharacterPoseSnapshot = new Map();
    for (const [id, joint] of this.joints) {
      result.set(id, {
        pos: [joint.position.x, joint.position.y, joint.position.z],
        rotation: [joint.rotation.x, joint.rotation.y, joint.rotation.z],
      });
    }
    return result;
  }

  restPose(): CharacterPoseSnapshot {
    const result: CharacterPoseSnapshot = new Map();
    for (const [id, value] of this.rest) {
      result.set(id, { pos: [...value.pos], rotation: [...value.rotation] });
    }
    return result;
  }

  target(overrides: CharacterPose): CharacterPoseSnapshot {
    const result = this.restPose();
    for (const [id, transform] of Object.entries(overrides)) {
      const target = result.get(id);
      if (!target) continue;
      if (transform.pos) target.pos = tuple(transform.pos);
      if (transform.rotation) target.rotation = tuple(transform.rotation);
    }
    return result;
  }

  apply(target: CharacterPoseSnapshot, amount = 1, from?: CharacterPoseSnapshot): void {
    for (const [id, to] of target) {
      const joint = this.joints.get(id);
      if (!joint) continue;
      const source = from?.get(id) ?? to;
      joint.position.set(
        source.pos[0] + (to.pos[0] - source.pos[0]) * amount,
        source.pos[1] + (to.pos[1] - source.pos[1]) * amount,
        source.pos[2] + (to.pos[2] - source.pos[2]) * amount,
      );
      joint.rotation.set(
        mixAngle(source.rotation[0], to.rotation[0], amount),
        mixAngle(source.rotation[1], to.rotation[1], amount),
        mixAngle(source.rotation[2], to.rotation[2], amount),
      );
    }
  }

  reset(): void {
    this.apply(this.restPose());
  }

  set(id: string, transform: CharacterJointTransform): boolean {
    const joint = this.joints.get(id);
    if (!joint) return false;
    if (transform.pos) joint.position.set(...transform.pos);
    if (transform.rotation) joint.rotation.set(...transform.rotation);
    return true;
  }

  state(): CharacterJointState[] {
    return [...this.joints].map(([id, joint]) => {
      const parent = this.parents.get(id);
      return {
        id,
        ...(parent ? { parent } : {}),
        pos: [joint.position.x, joint.position.y, joint.position.z],
        rotation: [joint.rotation.x, joint.rotation.y, joint.rotation.z],
      };
    });
  }

  exportPose(precision = 3): Record<string, CharacterJointTransform> {
    const round = (value: number): number => Number(value.toFixed(precision));
    return Object.fromEntries(
      this.state().map(({ id, pos, rotation }) => [
        id,
        {
          pos: pos.map(round) as [number, number, number],
          rotation: rotation.map(round) as [number, number, number],
        },
      ]),
    );
  }

  restTransform(id: string): CharacterJointSnapshot | undefined {
    const value = this.rest.get(id);
    return value ? { pos: [...value.pos], rotation: [...value.rotation] } : undefined;
  }
}

function mixTuple(
  from: CharacterTransform,
  to: CharacterTransform,
  amount: number,
  angles: boolean,
): [number, number, number] {
  return [0, 1, 2].map((index) =>
    angles
      ? mixAngle(from[index], to[index], amount)
      : from[index] + (to[index] - from[index]) * amount,
  ) as [number, number, number];
}

function sampleTrack(
  track: CharacterAnimationTrack,
  time: number,
): CharacterJointTransform | undefined {
  const frames = track.keyframes;
  if (frames.length === 0) return undefined;
  if (time <= frames[0].time) return frames[0];
  if (time >= frames[frames.length - 1].time) return frames[frames.length - 1];
  for (let index = 0; index < frames.length - 1; index++) {
    const from = frames[index];
    const to = frames[index + 1];
    if (time > to.time) continue;
    const span = Math.max(0.000001, to.time - from.time);
    const amount = characterEase(from.easing ?? 'linear', (time - from.time) / span);
    return {
      ...(from.pos || to.pos
        ? { pos: mixTuple(from.pos ?? to.pos!, to.pos ?? from.pos!, amount, false) }
        : {}),
      ...(from.rotation || to.rotation
        ? {
            rotation: mixTuple(
              from.rotation ?? to.rotation!,
              to.rotation ?? from.rotation!,
              amount,
              true,
            ),
          }
        : {}),
    };
  }
  return frames[frames.length - 1];
}

/** Data-driven keyframe player with easing, looping, crossfades, masks, and additive tracks. */
export class CharacterAnimator {
  private readonly clips = new Map<string, CharacterAnimationClip>();
  private active: CharacterAnimationClip | undefined;
  private elapsed = 0;
  private transitionElapsed = 0;
  private transitionDuration = 0;
  private transitionFrom: CharacterPoseSnapshot | undefined;
  // Per-frame scratch state: the rest pose is immutable, `scratch` is refilled from it each
  // update, and masks are precomputed — the hot loop allocates nothing while idle.
  private readonly restCache: CharacterPoseSnapshot;
  private readonly scratch: CharacterPoseSnapshot;
  private readonly masks = new Map<string, ReadonlySet<string>>();
  private atRest = true;

  constructor(
    private readonly rig: CharacterRig,
    clips: readonly CharacterAnimationClip[],
  ) {
    for (const clip of clips) {
      if (clip.duration <= 0) throw new Error(`character clip ${clip.id} must have a duration`);
      this.clips.set(clip.id, clip);
      if (clip.mask) this.masks.set(clip.id, new Set(clip.mask));
    }
    this.restCache = rig.restPose();
    this.scratch = rig.restPose();
  }

  play(id: string, playback: CharacterAnimationPlayback = {}): boolean {
    const clip = this.clips.get(id);
    if (!clip) return false;
    this.transitionFrom = this.rig.capture();
    this.transitionDuration = Math.max(0, playback.transitionSeconds ?? 0.18);
    this.transitionElapsed = 0;
    this.active = clip;
    this.elapsed = 0;
    return true;
  }

  stop(): boolean {
    const stopped = this.active !== undefined;
    this.active = undefined;
    this.elapsed = 0;
    this.transitionFrom = undefined;
    this.rig.reset();
    this.atRest = true;
    return stopped;
  }

  activeId(): string | undefined {
    return this.active?.id;
  }

  definitions(): ReadonlyArray<{ id: string; label: string }> {
    return [...this.clips.values()].map(({ id, label }) => ({ id, label }));
  }

  update(dt: number): void {
    const clip = this.active;
    if (!clip) {
      // Reset once when a clip ends; afterwards the rig stays at rest so callers (walk
      // swing, manual poses) can write joints without being stomped every frame.
      if (!this.atRest) {
        this.rig.reset();
        this.atRest = true;
      }
      return;
    }
    this.atRest = false;
    this.elapsed += Math.max(0, dt);
    const time =
      clip.loop === false ? Math.min(clip.duration, this.elapsed) : this.elapsed % clip.duration;
    const target = this.scratch;
    for (const [id, rest] of this.restCache) {
      const value = target.get(id)!;
      value.pos[0] = rest.pos[0];
      value.pos[1] = rest.pos[1];
      value.pos[2] = rest.pos[2];
      value.rotation[0] = rest.rotation[0];
      value.rotation[1] = rest.rotation[1];
      value.rotation[2] = rest.rotation[2];
    }
    const mask = this.masks.get(clip.id);
    for (const track of clip.tracks) {
      if (mask && !mask.has(track.joint)) continue;
      const sampled = sampleTrack(track, time);
      const rest = this.restCache.get(track.joint);
      const jointTarget = target.get(track.joint);
      if (!sampled || !rest || !jointTarget) continue;
      if (sampled.pos) {
        jointTarget.pos =
          track.mode === 'additive'
            ? [
                rest.pos[0] + sampled.pos[0],
                rest.pos[1] + sampled.pos[1],
                rest.pos[2] + sampled.pos[2],
              ]
            : tuple(sampled.pos);
      }
      if (sampled.rotation) {
        jointTarget.rotation =
          track.mode === 'additive'
            ? [
                rest.rotation[0] + sampled.rotation[0],
                rest.rotation[1] + sampled.rotation[1],
                rest.rotation[2] + sampled.rotation[2],
              ]
            : tuple(sampled.rotation);
      }
    }
    this.transitionElapsed += Math.max(0, dt);
    const transitionAmount =
      this.transitionDuration > 0
        ? characterEase('smoothstep', Math.min(1, this.transitionElapsed / this.transitionDuration))
        : 1;
    this.rig.apply(target, transitionAmount, this.transitionFrom);
    if (transitionAmount >= 1) this.transitionFrom = undefined;
  }
}
