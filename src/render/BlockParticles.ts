import {
  BoxGeometry,
  Color,
  DynamicDrawUsage,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  Quaternion,
  Vector3,
  type Object3D,
} from 'three';
import type { BlockDef } from '../blocks/blocks';
import type { TextureSpec, RGB } from '../blocks/textures';

const MAX_PARTICLES = 160;
const GRAVITY = -18;
const FALLBACK: RGB = [130, 130, 136];

/** Representative tint for a block's break particles: the first palette color of a side face. */
export function particleColorOf(def: BlockDef): RGB {
  const faces = def.faces;
  if (!faces) return FALLBACK;
  const spec: TextureSpec = Array.isArray(faces)
    ? faces[0]
    : 'pattern' in faces || 'custom' in faces
      ? (faces as TextureSpec)
      : (faces as { side: TextureSpec }).side;
  return 'pattern' in spec && spec.colors.length > 0 ? spec.colors[0] : FALLBACK;
}

interface Particle {
  pos: Vector3;
  vel: Vector3;
  color: Color;
  life: number;
  ttl: number;
  size: number;
}

interface Pop {
  mesh: Mesh;
  age: number;
}

const POP_DURATION = 0.14;
const HIDDEN = new Matrix4().makeScale(0, 0, 0);

/**
 * Minecraft-style block effects: a pooled InstancedMesh of tiny tinted cubes that burst out of
 * broken blocks under gravity, and a short scale-in "pop" ghost on placed blocks. One draw call
 * for all particles; nothing allocates per frame (matrices/colors are written in place).
 */
export class BlockParticles {
  private readonly mesh: InstancedMesh;
  private readonly particles: Particle[] = [];
  private readonly pops: Pop[] = [];
  private readonly popPool: Mesh[] = [];
  private readonly scratchMatrix = new Matrix4();
  private readonly scratchQuat = new Quaternion();
  private readonly scratchScale = new Vector3();

  constructor() {
    this.mesh = new InstancedMesh(
      new BoxGeometry(1, 1, 1),
      new MeshBasicMaterial({ transparent: true, opacity: 0.95 }),
      MAX_PARTICLES,
    );
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 998;

    const popMat = new MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.4,
      depthWrite: false,
    });
    for (let i = 0; i < 4; i++) {
      const pop = new Mesh(new BoxGeometry(1, 1, 1), popMat.clone());
      pop.visible = false;
      pop.renderOrder = 998;
      this.popPool.push(pop);
    }
  }

  /** Adds the particle mesh and pop ghosts to the scene graph. Call once. */
  attach(add: (o: Object3D) => void): void {
    add(this.mesh);
    for (const pop of this.popPool) add(pop);
  }

  /** Bursts tinted debris cubes out of the block cell at (x,y,z). */
  burst(x: number, y: number, z: number, color: RGB, count = 12): void {
    for (let i = 0; i < count; i++) {
      if (this.particles.length >= MAX_PARTICLES) this.particles.shift();
      const angle = Math.random() * Math.PI * 2;
      const speed = 1.5 + Math.random() * 2.5;
      // Slight per-particle shade variation, like Minecraft's texture-sampled debris.
      const shade = 0.85 + Math.random() * 0.3;
      this.particles.push({
        pos: new Vector3(
          x + 0.2 + Math.random() * 0.6,
          y + 0.2 + Math.random() * 0.6,
          z + 0.2 + Math.random() * 0.6,
        ),
        vel: new Vector3(Math.cos(angle) * speed, 2 + Math.random() * 3.5, Math.sin(angle) * speed),
        color: new Color(color[0] / 255, color[1] / 255, color[2] / 255).multiplyScalar(shade),
        life: 0,
        ttl: 0.4 + Math.random() * 0.35,
        size: 0.08 + Math.random() * 0.07,
      });
    }
  }

  /** Flashes a brief scale-in ghost over the block placed at (x,y,z). */
  pop(x: number, y: number, z: number): void {
    const mesh = this.popPool.find((m) => !m.visible);
    if (!mesh) return; // all four ghosts busy — a fifth pop in 140ms won't be missed
    mesh.position.set(x + 0.5, y + 0.5, z + 0.5);
    mesh.visible = true;
    this.pops.push({ mesh, age: 0 });
  }

  /** Frees the pooled particle mesh and each pop ghost's (cloned) GPU resources. */
  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as MeshBasicMaterial).dispose();
    for (const pop of this.popPool) {
      pop.geometry.dispose();
      (pop.material as MeshBasicMaterial).dispose();
    }
  }

  /** Advances particle physics and pop fades; call once per frame. */
  update(dt: number): void {
    let write = 0;
    for (const p of this.particles) {
      p.life += dt;
      if (p.life >= p.ttl) continue;
      p.vel.y += GRAVITY * dt;
      p.pos.addScaledVector(p.vel, dt);
      const fade = 1 - p.life / p.ttl;
      const s = p.size * (0.5 + fade * 0.5);
      this.scratchScale.setScalar(s);
      this.scratchMatrix.compose(p.pos, this.scratchQuat, this.scratchScale);
      this.mesh.setMatrixAt(write, this.scratchMatrix);
      this.mesh.setColorAt(write, p.color);
      this.particles[write] = p;
      write++;
    }
    this.particles.length = write;
    // Zero out the tail so stale instances vanish without shrinking the buffer.
    for (let i = write; i < this.mesh.count; i++) this.mesh.setMatrixAt(i, HIDDEN);
    this.mesh.count = write;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;

    for (let i = this.pops.length - 1; i >= 0; i--) {
      const pop = this.pops[i];
      pop.age += dt;
      const t = pop.age / POP_DURATION;
      if (t >= 1) {
        pop.mesh.visible = false;
        this.pops.splice(i, 1);
        continue;
      }
      const scale = 1.15 - 0.15 * t;
      pop.mesh.scale.setScalar(scale);
      (pop.mesh.material as MeshBasicMaterial).opacity = 0.4 * (1 - t);
    }
  }
}
