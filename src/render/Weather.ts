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
  type RawShaderMaterial,
  type Scene,
} from 'three';
import type { WeatherKind } from '../app/weatherSchedule';

const MAX_DROPS = 600;
/** Precipitation spawns inside this radius around the camera. */
const SPAWN_RADIUS = 18;
const SPAWN_ABOVE_MIN = 8;
const SPAWN_ABOVE_MAX = 20;
const KILL_BELOW = 14;

/** How fast a lightning flash fades (per second, exponential). */
const FLASH_DECAY = 9;
/** Average strikes per second during a storm. */
const STRIKE_RATE = 0.12;

interface KindParams {
  count: number;
  fallSpeed: number;
  /** Horizontal wind drift (blocks/s), shared by all drops. */
  wind: number;
  /** Per-flake sideways wander amplitude (snow flutter). */
  flutter: number;
  scale: [number, number, number];
  color: number;
  opacity: number;
}

const PARAMS: Record<Exclude<WeatherKind, 'clear'>, KindParams> = {
  rain: {
    count: 420,
    fallSpeed: 26,
    wind: 2,
    flutter: 0,
    scale: [0.03, 0.5, 0.03],
    color: 0x9db8d9,
    opacity: 0.45,
  },
  storm: {
    count: 600,
    fallSpeed: 30,
    wind: 5,
    flutter: 0,
    scale: [0.03, 0.6, 0.03],
    color: 0x8fa8c9,
    opacity: 0.55,
  },
  snow: {
    count: 260,
    fallSpeed: 1.9,
    wind: 0.6,
    flutter: 0.9,
    scale: [0.09, 0.09, 0.09],
    color: 0xf4f8ff,
    opacity: 0.9,
  },
};

interface Drop {
  pos: Vector3;
  phase: number;
}

/**
 * Precipitation and lightning. One pooled InstancedMesh of unit cubes is rescaled per
 * weather kind (thin streaks for rain, flakes for snow) and recycled in a column around
 * the camera; drops die on solid cells, so roofs and overhangs shelter naturally.
 * Storms add lightning: a screen flash (blend into the light/fog uniforms) plus a
 * delayed thunder callback.
 */
export class Weather {
  private readonly mesh: InstancedMesh;
  private readonly material: MeshBasicMaterial;
  private readonly drops: Drop[] = [];
  private kindState: WeatherKind = 'clear';
  private flash = 0;
  private readonly scratchMatrix = new Matrix4();
  private readonly scratchQuat = new Quaternion();
  private readonly scratchScale = new Vector3(1, 1, 1);
  private readonly backgroundBoost = new Color();

  constructor(
    private readonly onThunder: (intensity: number) => void = () => {},
    private readonly rng: () => number = Math.random,
  ) {
    this.material = new MeshBasicMaterial({ transparent: true, opacity: 0.5, depthWrite: false });
    this.mesh = new InstancedMesh(new BoxGeometry(1, 1, 1), this.material, MAX_DROPS);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 997;
  }

  attach(add: (o: Object3D) => void): void {
    add(this.mesh);
  }

  get kind(): WeatherKind {
    return this.kindState;
  }

  /** Current lightning flash level in [0,1]; drives the frame's light/sky boost. */
  get flashLevel(): number {
    return this.flash;
  }

  setKind(kind: WeatherKind): void {
    if (kind === this.kindState) return;
    this.kindState = kind;
    this.drops.length = 0; // old precipitation vanishes; the new kind refills next frame
    if (kind !== 'clear') {
      const p = PARAMS[kind];
      this.material.color.setHex(p.color);
      this.material.opacity = p.opacity;
    }
  }

  /**
   * Advances drops and lightning. `isSolid` is sampled per drop cell so rain stops at
   * roofs; `cam` is the world-space eye the precipitation column follows.
   */
  update(
    dt: number,
    cam: { x: number; y: number; z: number },
    isSolid: (x: number, y: number, z: number) => boolean,
  ): void {
    this.flash = Math.max(0, this.flash - this.flash * FLASH_DECAY * dt);

    if (this.kindState === 'clear') {
      this.mesh.count = 0;
      this.mesh.instanceMatrix.needsUpdate = true;
      return;
    }
    const p = PARAMS[this.kindState];

    if (this.kindState === 'storm' && this.rng() < STRIKE_RATE * dt) {
      this.flash = 1;
      this.onThunder(0.6 + this.rng() * 0.4);
    }

    while (this.drops.length < p.count) {
      this.drops.push({
        pos: this.spawnPos(cam, true, new Vector3()),
        phase: this.rng() * Math.PI * 2,
      });
    }
    if (this.drops.length > p.count) this.drops.length = p.count;

    const time = performance.now() / 1000;
    this.scratchScale.set(p.scale[0], p.scale[1], p.scale[2]);
    for (let i = 0; i < this.drops.length; i++) {
      const d = this.drops[i];
      d.pos.y -= p.fallSpeed * dt;
      d.pos.x += p.wind * dt + Math.sin(time * 1.8 + d.phase) * p.flutter * dt;
      d.pos.z += Math.cos(time * 1.5 + d.phase) * p.flutter * dt;
      const dead =
        d.pos.y < cam.y - KILL_BELOW ||
        isSolid(Math.floor(d.pos.x), Math.floor(d.pos.y), Math.floor(d.pos.z));
      if (dead) {
        // Recycle in place — write straight into the drop's vector, no per-frame allocation.
        this.spawnPos(cam, false, d.pos);
      }
      this.scratchMatrix.compose(d.pos, this.scratchQuat, this.scratchScale);
      this.mesh.setMatrixAt(i, this.scratchMatrix);
    }
    this.mesh.count = this.drops.length;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  /**
   * Blends the lightning flash into the frame: daylight and fog jump toward white for a
   * beat. Call after DayNight/underwater have written their uniforms.
   */
  applyFlash(materials: readonly RawShaderMaterial[], scene: Scene): void {
    if (this.flash <= 0.01) return;
    const boost = this.flash * 0.85;
    for (const m of materials) {
      m.uniforms.uDayLight.value = Math.min(1.25, (m.uniforms.uDayLight.value as number) + boost);
      const fog = m.uniforms.uFogColor.value as Vector3;
      fog.lerp(FLASH_WHITE, boost);
    }
    if (scene.background instanceof Color) {
      this.backgroundBoost.setRGB(1, 1, 1);
      scene.background.lerp(this.backgroundBoost, boost);
    }
  }

  /** Frees the pooled precipitation mesh's GPU resources. */
  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }

  /** Samples a spawn point into `out` (returned) so callers can recycle without allocating. */
  private spawnPos(
    cam: { x: number; y: number; z: number },
    anyHeight: boolean,
    out: Vector3,
  ): Vector3 {
    const angle = this.rng() * Math.PI * 2;
    const radius = Math.sqrt(this.rng()) * SPAWN_RADIUS;
    const yLo = anyHeight ? -KILL_BELOW : SPAWN_ABOVE_MIN;
    const y = cam.y + yLo + this.rng() * (SPAWN_ABOVE_MAX - yLo);
    return out.set(cam.x + Math.cos(angle) * radius, y, cam.z + Math.sin(angle) * radius);
  }
}

const FLASH_WHITE = new Vector3(1, 1, 1);
