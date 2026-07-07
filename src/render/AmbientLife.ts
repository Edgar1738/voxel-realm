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
import { AIR, FLOWER, GRASS, LEAVES, TALL_GRASS, WATER } from '../blocks/blocks';

export type LifeKindName = 'butterfly' | 'firefly' | 'leaf';

export type GetBlock = (x: number, y: number, z: number) => number;

const MAX_AGENTS = 72;
/** Anchors and agents live inside this radius around the camera. */
const RANGE = 20;
const DESPAWN_RANGE = 28;
const SCAN_INTERVAL = 1.2;
const SAMPLES_PER_SCAN = 110;
const MAX_ANCHORS = 24;

interface KindDef {
  count: number;
  palette: number[];
  scale: [number, number, number];
}

const KINDS: Record<LifeKindName, KindDef> = {
  butterfly: {
    count: 10,
    palette: [0xfff4f4, 0xffa54f, 0xc9a0ff, 0xffe06e],
    scale: [0.14, 0.05, 0.1],
  },
  firefly: { count: 26, palette: [0xd8ff6e], scale: [0.07, 0.07, 0.07] },
  leaf: { count: 14, palette: [0x4d8f3a, 0x6aa84f, 0x8fbc5a], scale: [0.11, 0.02, 0.11] },
};

/** Whether a kind is out and about at this daylight level (butterflies nap at night; fireflies own it). */
export function kindActive(kind: LifeKindName, daylight: number): boolean {
  if (kind === 'butterfly') return daylight > 0.55;
  if (kind === 'firefly') return daylight < 0.35;
  return true; // leaves fall day and night
}

/**
 * Whether the block cell can host a kind: butterflies home on flowers/tall grass,
 * fireflies hover over grass or water with air above, leaves detach from leaf blocks
 * with air below.
 */
export function isAnchor(
  kind: LifeKindName,
  getBlock: GetBlock,
  x: number,
  y: number,
  z: number,
): boolean {
  const id = getBlock(x, y, z);
  if (kind === 'butterfly') return id === FLOWER || id === TALL_GRASS;
  if (kind === 'firefly') {
    return (id === GRASS || id === WATER) && getBlock(x, y + 1, z) === AIR;
  }
  return id === LEAVES && getBlock(x, y - 1, z) === AIR;
}

interface Agent {
  kind: LifeKindName;
  home: Vector3;
  pos: Vector3;
  phase: number;
  age: number;
  color: Color;
}

/**
 * Small ambient creatures with no AI: butterflies orbit flowers by day, fireflies
 * blink over grass and water at night, leaves flutter down from tree canopies.
 * One InstancedMesh for everything; anchors are found by randomly sampling blocks
 * around the camera every couple of seconds, so life shows up wherever the world
 * happens to provide habitat — nothing is scripted per world.
 */
export class AmbientLife {
  private readonly mesh: InstancedMesh;
  private readonly agents: Agent[] = [];
  private readonly anchors: Record<LifeKindName, Vector3[]> = {
    butterfly: [],
    firefly: [],
    leaf: [],
  };
  private scanTimer = 0;
  private readonly scratchMatrix = new Matrix4();
  private readonly scratchQuat = new Quaternion();
  private readonly scratchScale = new Vector3();

  constructor(private readonly rng: () => number = Math.random) {
    this.mesh = new InstancedMesh(
      new BoxGeometry(1, 1, 1),
      new MeshBasicMaterial({ transparent: true, opacity: 0.95 }),
      MAX_AGENTS,
    );
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 996;
  }

  attach(add: (o: Object3D) => void): void {
    add(this.mesh);
  }

  /** Agents currently alive per kind (for dev inspection and tests). */
  census(): Record<LifeKindName, number> {
    const out: Record<LifeKindName, number> = { butterfly: 0, firefly: 0, leaf: 0 };
    for (const a of this.agents) out[a.kind]++;
    return out;
  }

  update(
    dt: number,
    cam: { x: number; y: number; z: number },
    daylight: number,
    getBlock: GetBlock,
  ): void {
    this.scanTimer -= dt;
    if (this.scanTimer <= 0) {
      this.scanTimer = SCAN_INTERVAL;
      this.scan(cam, getBlock);
      this.repopulate(daylight);
    }

    let write = 0;
    for (const agent of this.agents) {
      agent.age += dt;
      const dx = agent.pos.x - cam.x;
      const dz = agent.pos.z - cam.z;
      if (dx * dx + dz * dz > DESPAWN_RANGE * DESPAWN_RANGE || !kindActive(agent.kind, daylight)) {
        continue; // dropped from the pool
      }
      this.move(agent, dt);
      const def = KINDS[agent.kind];
      const blink =
        agent.kind === 'firefly'
          ? Math.sin(agent.age * 2.4 + agent.phase) > -0.35
            ? 1
            : 0.001
          : 1;
      this.scratchScale.set(def.scale[0] * blink, def.scale[1] * blink, def.scale[2] * blink);
      this.scratchMatrix.compose(agent.pos, this.scratchQuat, this.scratchScale);
      this.mesh.setMatrixAt(write, this.scratchMatrix);
      this.mesh.setColorAt(write, agent.color);
      this.agents[write] = agent;
      write++;
    }
    this.agents.length = write;
    this.mesh.count = write;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  /** Frees the shared instanced-mesh GPU resources. */
  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as MeshBasicMaterial).dispose();
  }

  private move(agent: Agent, dt: number): void {
    const t = agent.age;
    if (agent.kind === 'butterfly') {
      // Loop around the home flower with a wing-beat bob.
      const r = 0.9 + 0.5 * Math.sin(t * 0.7 + agent.phase);
      agent.pos.x = agent.home.x + Math.cos(t * 1.1 + agent.phase) * r;
      agent.pos.z = agent.home.z + Math.sin(t * 0.9 + agent.phase * 1.7) * r;
      agent.pos.y = agent.home.y + 0.9 + Math.sin(t * 5 + agent.phase) * 0.18;
    } else if (agent.kind === 'firefly') {
      // Slow smooth 3D wander around home.
      agent.pos.x = agent.home.x + Math.sin(t * 0.5 + agent.phase) * 1.6;
      agent.pos.z = agent.home.z + Math.cos(t * 0.4 + agent.phase * 2.1) * 1.6;
      agent.pos.y = agent.home.y + 1.4 + Math.sin(t * 0.6 + agent.phase * 0.7) * 0.8;
    } else {
      // Leaf: flutter downward; respawn at the canopy when it lands.
      agent.pos.y -= 0.55 * dt;
      agent.pos.x += Math.sin(t * 2.1 + agent.phase) * 0.5 * dt;
      agent.pos.z += Math.cos(t * 1.7 + agent.phase) * 0.5 * dt;
      if (agent.pos.y < agent.home.y - 14) {
        agent.pos.copy(agent.home);
        agent.pos.y -= 0.3;
        agent.age = 0;
      }
    }
  }

  private scan(cam: { x: number; y: number; z: number }, getBlock: GetBlock): void {
    for (let i = 0; i < SAMPLES_PER_SCAN; i++) {
      const x = Math.floor(cam.x + (this.rng() * 2 - 1) * RANGE);
      const y = Math.floor(cam.y + (this.rng() * 2 - 1) * 12);
      const z = Math.floor(cam.z + (this.rng() * 2 - 1) * RANGE);
      for (const kind of Object.keys(KINDS) as LifeKindName[]) {
        if (!isAnchor(kind, getBlock, x, y, z)) continue;
        const list = this.anchors[kind];
        if (list.length >= MAX_ANCHORS) list[Math.floor(this.rng() * list.length)].set(x, y, z);
        else list.push(new Vector3(x, y, z));
      }
    }
    // Drop anchors that fell out of range (world streamed on, or the player moved).
    for (const kind of Object.keys(KINDS) as LifeKindName[]) {
      this.anchors[kind] = this.anchors[kind].filter(
        (a) => Math.abs(a.x - cam.x) <= RANGE + 6 && Math.abs(a.z - cam.z) <= RANGE + 6,
      );
    }
  }

  private repopulate(daylight: number): void {
    for (const kind of Object.keys(KINDS) as LifeKindName[]) {
      if (!kindActive(kind, daylight)) continue;
      const anchors = this.anchors[kind];
      if (anchors.length === 0) continue;
      const def = KINDS[kind];
      let alive = 0;
      for (const a of this.agents) if (a.kind === kind) alive++;
      while (alive < def.count && this.agents.length < MAX_AGENTS) {
        const home = anchors[Math.floor(this.rng() * anchors.length)];
        const color = new Color(def.palette[Math.floor(this.rng() * def.palette.length)]);
        const pos = home.clone();
        pos.y += kind === 'leaf' ? -0.3 : 1;
        this.agents.push({
          kind,
          home: home.clone(),
          pos,
          phase: this.rng() * Math.PI * 2,
          age: this.rng() * 10,
          color,
        });
        alive++;
      }
    }
  }
}
