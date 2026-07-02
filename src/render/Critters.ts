import {
  BoxGeometry,
  Color,
  DynamicDrawUsage,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  Quaternion,
  Vector3,
  type Object3D,
} from 'three';
import { AIR, GRASS, LEAVES, WATER } from '../blocks/blocks';

export type CritterKind = 'bird' | 'fish' | 'rabbit';

export type GetBlock = (x: number, y: number, z: number) => number;

export interface CritterEnv {
  getBlock: GetBlock;
  /** Player body position — critters flee it. */
  player: { x: number; y: number; z: number };
}

const RANGE = 22;
const DESPAWN_RANGE = 30;
const SCAN_INTERVAL = 1.6;
const SAMPLES_PER_SCAN = 90;
const MAX_ANCHORS = 16;
/** Distance at which a critter startles and flees. */
export const FLEE_RADIUS = 4.5;

interface KindDef {
  count: number;
  palette: number[];
  /** Body box size. */
  body: [number, number, number];
  /** Second part (head/tail) size and forward offset (negative = behind). */
  part: [number, number, number];
  partOffset: number;
}

const KINDS: Record<CritterKind, KindDef> = {
  bird: {
    count: 4,
    palette: [0x8a4b2f, 0x475e78, 0xb0453a],
    body: [0.22, 0.18, 0.3],
    part: [0.12, 0.12, 0.12],
    partOffset: 0.19,
  },
  fish: {
    count: 5,
    palette: [0xc9803a, 0x7f96ad, 0xa8623c],
    body: [0.14, 0.14, 0.3],
    part: [0.03, 0.14, 0.12],
    partOffset: -0.19,
  },
  rabbit: {
    count: 3,
    palette: [0xbfa88f, 0x8d7761, 0xe8e2d8],
    body: [0.25, 0.24, 0.34],
    part: [0.16, 0.16, 0.16],
    partOffset: 0.22,
  },
};

/** Whether the cell can host a kind: birds/rabbits need standable tops, fish need open water. */
export function critterAnchor(
  kind: CritterKind,
  getBlock: GetBlock,
  x: number,
  y: number,
  z: number,
): boolean {
  const id = getBlock(x, y, z);
  if (kind === 'fish') return id === WATER && getBlock(x, y + 1, z) === WATER;
  const standable = kind === 'bird' ? id === GRASS || id === LEAVES : id === GRASS;
  return standable && getBlock(x, y + 1, z) === AIR && getBlock(x, y + 2, z) === AIR;
}

/** Unit XZ direction pointing away from the player (safe fallback when on top of them). */
export function fleeDirection(cx: number, cz: number, px: number, pz: number): [number, number] {
  const dx = cx - px;
  const dz = cz - pz;
  const len = Math.hypot(dx, dz);
  if (len < 0.001) return [1, 0];
  return [dx / len, dz / len];
}

type Mode = 'idle' | 'moving' | 'fleeing';

interface Critter {
  kind: CritterKind;
  pos: Vector3;
  from: Vector3;
  to: Vector3;
  /** Progress through the current move in [0,1]; unused while idle. */
  t: number;
  dur: number;
  mode: Mode;
  idleLeft: number;
  yaw: number;
  phase: number;
  color: Color;
}

/**
 * First-class ambient critters: birds perch and make short flights (and burst
 * upward when approached), fish cruise inside water volumes, rabbits hop between
 * grass cells and bolt from the player. No pathfinding — each move is a validated
 * short arc to a nearby cell, so they can never leave their habitat.
 */
export class Critters {
  private readonly mesh: InstancedMesh;
  private readonly critters: Critter[] = [];
  private readonly anchors: Record<CritterKind, Vector3[]> = { bird: [], fish: [], rabbit: [] };
  private scanTimer = 0;
  private chirpTimer = 2;
  private readonly scratchMatrix = new Matrix4();
  private readonly scratchQuat = new Quaternion();
  private readonly scratchScale = new Vector3();
  private readonly scratchAxis = new Vector3(0, 1, 0);

  constructor(
    private readonly onChirp: () => void = () => {},
    private readonly rng: () => number = Math.random,
  ) {
    const maxParts =
      2 * (Object.values(KINDS).reduce((sum, def) => sum + def.count, 0) + 4); /* headroom */
    this.mesh = new InstancedMesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial(), maxParts);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
  }

  attach(add: (o: Object3D) => void): void {
    add(this.mesh);
  }

  census(): Record<CritterKind, number> {
    const out: Record<CritterKind, number> = { bird: 0, fish: 0, rabbit: 0 };
    for (const c of this.critters) out[c.kind]++;
    return out;
  }

  update(dt: number, cam: { x: number; y: number; z: number }, env: CritterEnv): void {
    this.scanTimer -= dt;
    if (this.scanTimer <= 0) {
      this.scanTimer = SCAN_INTERVAL;
      this.scan(cam, env.getBlock);
      this.repopulate();
    }

    this.chirpTimer -= dt;
    let write = 0;
    let keep = 0;
    for (const critter of this.critters) {
      const dx = critter.pos.x - cam.x;
      const dz = critter.pos.z - cam.z;
      if (dx * dx + dz * dz > DESPAWN_RANGE * DESPAWN_RANGE) continue; // left behind
      this.advance(critter, dt, env);
      write = this.writeParts(critter, write);
      this.critters[keep++] = critter;
    }
    this.critters.length = keep;

    this.mesh.count = write;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  private advance(c: Critter, dt: number, env: CritterEnv): void {
    c.phase += dt;
    const near =
      Math.hypot(c.pos.x - env.player.x, c.pos.z - env.player.z) < FLEE_RADIUS &&
      Math.abs(c.pos.y - env.player.y) < 3;
    if (near && c.mode !== 'fleeing') this.startFlee(c, env);

    if (c.mode === 'idle') {
      c.idleLeft -= dt;
      if (c.kind === 'bird' && this.chirpTimer <= 0 && this.rng() < 0.3) {
        this.chirpTimer = 3 + this.rng() * 5;
        this.onChirp();
      }
      if (c.idleLeft <= 0) this.startMove(c, env, false);
      return;
    }

    c.t += dt / c.dur;
    if (c.t >= 1) {
      c.pos.copy(c.to);
      c.mode = 'idle';
      c.idleLeft = c.kind === 'fish' ? 0.2 : 1 + this.rng() * 4;
      return;
    }
    const t = c.t;
    c.pos.lerpVectors(c.from, c.to, t);
    // Vertical flavor: birds arc high, rabbits hop a small parabola, fish stay level.
    const lift =
      c.kind === 'bird' ? (c.mode === 'fleeing' ? 3 : 1.6) : c.kind === 'rabbit' ? 0.45 : 0;
    c.pos.y += Math.sin(Math.PI * t) * lift;
    c.yaw = Math.atan2(c.to.x - c.from.x, c.to.z - c.from.z);
  }

  private startMove(c: Critter, env: CritterEnv, fleeing: boolean): void {
    const target = this.pickTarget(c, env, fleeing);
    if (!target) {
      c.idleLeft = 0.5;
      return;
    }
    c.from.copy(c.pos);
    c.to.copy(target);
    c.t = 0;
    c.mode = fleeing ? 'fleeing' : 'moving';
    const dist = c.from.distanceTo(c.to);
    const speed = fleeing ? SPEED[c.kind] * 1.8 : SPEED[c.kind];
    c.dur = Math.max(0.2, dist / speed);
  }

  private startFlee(c: Critter, env: CritterEnv): void {
    this.startMove(c, env, true);
  }

  /** Picks a validated nearby cell in the critter's habitat (biased away from the player when fleeing). */
  private pickTarget(c: Critter, env: CritterEnv, fleeing: boolean): Vector3 | undefined {
    const [fx, fz] = fleeDirection(c.pos.x, c.pos.z, env.player.x, env.player.z);
    for (let attempt = 0; attempt < 6; attempt++) {
      const reach = c.kind === 'bird' ? 4 + this.rng() * 6 : 1.5 + this.rng() * 2.5;
      let dx = (this.rng() * 2 - 1) * reach;
      let dz = (this.rng() * 2 - 1) * reach;
      if (fleeing) {
        dx = fx * reach + (this.rng() - 0.5) * 2;
        dz = fz * reach + (this.rng() - 0.5) * 2;
      }
      const tx = Math.floor(c.pos.x + dx);
      const tz = Math.floor(c.pos.z + dz);
      const target = this.groundAt(c.kind, env.getBlock, tx, Math.floor(c.pos.y), tz);
      if (target) return target;
    }
    return undefined;
  }

  /** Finds the standing/swimming spot in the target column (small vertical tolerance). */
  private groundAt(
    kind: CritterKind,
    getBlock: GetBlock,
    x: number,
    yNear: number,
    z: number,
  ): Vector3 | undefined {
    for (let dy = 2; dy >= -3; dy--) {
      const y = yNear + dy;
      if (kind === 'fish') {
        if (getBlock(x, y, z) === WATER && getBlock(x, y + 1, z) === WATER) {
          return new Vector3(x + 0.5, y + 0.6, z + 0.5);
        }
        continue;
      }
      if (critterAnchor(kind, getBlock, x, y, z)) {
        return new Vector3(x + 0.5, y + 1.2, z + 0.5);
      }
    }
    return undefined;
  }

  private writeParts(c: Critter, write: number): number {
    const def = KINDS[c.kind];
    this.scratchQuat.setFromAxisAngle(this.scratchAxis, c.yaw);
    // Body (fish get a swim wiggle in yaw).
    const wiggle = c.kind === 'fish' ? Math.sin(c.phase * 6) * 0.25 : 0;
    if (wiggle !== 0) this.scratchQuat.setFromAxisAngle(this.scratchAxis, c.yaw + wiggle);
    this.scratchScale.set(def.body[0], def.body[1], def.body[2]);
    this.scratchMatrix.compose(c.pos, this.scratchQuat, this.scratchScale);
    this.mesh.setMatrixAt(write, this.scratchMatrix);
    this.mesh.setColorAt(write, c.color);
    write++;
    // Head (birds/rabbits, forward) or tail (fish, behind).
    const fx = Math.sin(c.yaw) * def.partOffset;
    const fz = Math.cos(c.yaw) * def.partOffset;
    const py = c.pos.y + (c.kind === 'fish' ? 0 : def.body[1] * 0.5);
    this.scratchScale.set(def.part[0], def.part[1], def.part[2]);
    this.scratchMatrix.compose(
      new Vector3(c.pos.x + fx, py, c.pos.z + fz),
      this.scratchQuat,
      this.scratchScale,
    );
    this.mesh.setMatrixAt(write, this.scratchMatrix);
    this.mesh.setColorAt(write, c.color);
    return write + 1;
  }

  private scan(cam: { x: number; y: number; z: number }, getBlock: GetBlock): void {
    for (let i = 0; i < SAMPLES_PER_SCAN; i++) {
      const x = Math.floor(cam.x + (this.rng() * 2 - 1) * RANGE);
      const y = Math.floor(cam.y + (this.rng() * 2 - 1) * 12);
      const z = Math.floor(cam.z + (this.rng() * 2 - 1) * RANGE);
      for (const kind of Object.keys(KINDS) as CritterKind[]) {
        if (!critterAnchor(kind, getBlock, x, y, z)) continue;
        const list = this.anchors[kind];
        if (list.length >= MAX_ANCHORS) list[Math.floor(this.rng() * list.length)].set(x, y, z);
        else list.push(new Vector3(x, y, z));
      }
    }
    for (const kind of Object.keys(KINDS) as CritterKind[]) {
      this.anchors[kind] = this.anchors[kind].filter(
        (a) => Math.abs(a.x - cam.x) <= RANGE + 8 && Math.abs(a.z - cam.z) <= RANGE + 8,
      );
    }
  }

  private repopulate(): void {
    for (const kind of Object.keys(KINDS) as CritterKind[]) {
      const anchors = this.anchors[kind];
      if (anchors.length === 0) continue;
      const def = KINDS[kind];
      let alive = 0;
      for (const c of this.critters) if (c.kind === kind) alive++;
      while (alive < def.count) {
        const home = anchors[Math.floor(this.rng() * anchors.length)];
        const pos = new Vector3(home.x + 0.5, home.y + (kind === 'fish' ? 0.6 : 1.2), home.z + 0.5);
        this.critters.push({
          kind,
          pos,
          from: pos.clone(),
          to: pos.clone(),
          t: 0,
          dur: 1,
          mode: 'idle',
          idleLeft: this.rng() * 2,
          yaw: this.rng() * Math.PI * 2,
          phase: this.rng() * 10,
          color: new Color(def.palette[Math.floor(this.rng() * def.palette.length)]),
        });
        alive++;
      }
    }
  }
}

const SPEED: Record<CritterKind, number> = { bird: 6, fish: 1.6, rabbit: 3.2 };
