// src/render/HeldBlock.ts
//
// First-person hand: what the camera-anchored right hand shows. In 'block' mode it renders
// the selected hotbar block as a small cube (Minecraft's held item); tool modes swap in a
// cosmetic pickaxe/axe/sword viewmodel; 'empty' hides the hand. Textures are painted from
// the same procedural specs as the world's texture array, one tiny DataTexture per unique
// spec (cached — most blocks share layers, tools add a few of their own). Materials draw
// with depthTest off: the shapes are small and render last, so they composite correctly
// over the world without ever clipping into a wall the player stands against.
import {
  BoxGeometry,
  DataTexture,
  Group,
  Mesh,
  MeshBasicMaterial,
  NearestFilter,
  PlaneGeometry,
  RGBAFormat,
  SRGBColorSpace,
  type PerspectiveCamera,
  type Scene,
} from 'three';
import { Face, BLOCK_TEXTURES } from '../blocks/blocks';
import { TILE, paintLayer, specKey, type TextureSpec } from '../blocks/textures';
import type { BlockRegistry } from '../blocks/BlockRegistry';
import type { HandModeId } from '../character/HandModes';

/** Rest pose, tuned like Minecraft's right-hand item (camera space, −Z forward). */
const REST = { x: 0.46, y: -0.44, z: -0.86 };
const SCALE = 0.4;
/** Per-face brightness so the unlit cube still reads 3D (same idea as the block icons). */
const FACE_SHADE: Record<Face, number> = {
  [Face.PosX]: 0.8,
  [Face.NegX]: 0.8,
  [Face.PosY]: 1,
  [Face.NegY]: 0.55,
  [Face.PosZ]: 0.9,
  [Face.NegZ]: 0.7,
};
const PUNCH_SECONDS = 0.22;

/** A blocky tool part in tool-local space: handle along +Y, head spanning X (screen profile). */
interface ToolPart {
  size: [number, number, number];
  pos: [number, number, number];
  spec: TextureSpec;
}

// Tool material specs reuse the world's procedural patterns so viewmodels match the
// pixel look of the blocks they swing at.
const WOOD_SPEC: TextureSpec = {
  pattern: 'planks',
  colors: [
    [126, 96, 58],
    [108, 80, 46],
  ],
};
const STONE_HEAD_SPEC: TextureSpec = {
  pattern: 'stone',
  colors: [
    [132, 132, 138],
    [112, 112, 120],
  ],
};
const IRON_BLADE_SPEC: TextureSpec = {
  pattern: 'stone',
  colors: [
    [206, 210, 218],
    [180, 184, 194],
  ],
};
const DARK_WOOD_SPEC: TextureSpec = {
  pattern: 'planks',
  colors: [
    [88, 64, 38],
    [74, 52, 30],
  ],
};

/** Blocky Minecraft-style tool models, assembled from a few textured boxes each. */
const TOOL_PARTS: Record<'pickaxe' | 'axe' | 'sword', readonly ToolPart[]> = {
  pickaxe: [
    { size: [0.14, 1.15, 0.14], pos: [0, -0.05, 0], spec: WOOD_SPEC },
    { size: [0.95, 0.18, 0.18], pos: [0, 0.55, 0], spec: STONE_HEAD_SPEC },
    { size: [0.15, 0.3, 0.16], pos: [0.46, 0.42, 0], spec: STONE_HEAD_SPEC },
    { size: [0.15, 0.3, 0.16], pos: [-0.46, 0.42, 0], spec: STONE_HEAD_SPEC },
  ],
  axe: [
    { size: [0.14, 1.15, 0.14], pos: [0, -0.05, 0], spec: WOOD_SPEC },
    { size: [0.36, 0.34, 0.16], pos: [-0.22, 0.5, 0], spec: STONE_HEAD_SPEC },
    { size: [0.2, 0.5, 0.16], pos: [-0.48, 0.42, 0], spec: STONE_HEAD_SPEC },
  ],
  sword: [
    { size: [0.12, 0.4, 0.12], pos: [0, -0.62, 0], spec: DARK_WOOD_SPEC },
    { size: [0.34, 0.12, 0.16], pos: [0, -0.38, 0], spec: DARK_WOOD_SPEC },
    { size: [0.16, 1.0, 0.08], pos: [0, 0.18, 0], spec: IRON_BLADE_SPEC },
    { size: [0.09, 0.16, 0.08], pos: [0, 0.76, 0], spec: IRON_BLADE_SPEC },
  ],
};

/**
 * Grip pose: the heads already span X (screen profile), so the tool only needs a diagonal
 * lean — roll left plus a touch of forward pitch — to read like Minecraft's held tools.
 * The group's own yaw (−0.6) keeps a hint of the head's front face visible for depth.
 */
const TOOL_ROTATION = { x: 0.25, y: 0, z: -0.5 };

export class HeldBlock {
  private readonly group = new Group();
  private currentId = -1;
  private mesh?: Mesh;
  private mode: HandModeId = 'block';
  private toolGroup?: Group;
  private readonly toolDisposables: (BoxGeometry | MeshBasicMaterial)[] = [];
  /** One tiny texture per unique layer index, shared across blocks and faces. */
  private readonly layerTextures = new Map<number, DataTexture>();
  /** One tiny texture per unique tool spec, shared across tool parts. */
  private readonly specTextures = new Map<string, DataTexture>();
  private punchT = 0;
  private swayYaw = 0;
  private swayPitch = 0;
  private prevYaw?: number;
  private prevPitch?: number;

  constructor(private readonly registry: BlockRegistry) {
    this.group.visible = false;
    this.group.renderOrder = 1000;
  }

  /** Parents the group to the camera (adding the camera to the scene so children render). */
  attach(scene: Scene, camera: PerspectiveCamera): void {
    scene.add(camera);
    camera.add(this.group);
    this.group.position.set(REST.x, REST.y, REST.z);
    this.group.rotation.set(0.12, -0.6, 0.02);
    this.group.scale.setScalar(SCALE);
  }

  /** Kicks the place/break swing animation. */
  punch(): void {
    this.punchT = 1;
  }

  /** Swaps the displayed block (no-op when unchanged; AIR hides the hand). */
  setBlock(id: number): void {
    if (id === this.currentId) return;
    this.currentId = id;
    if (this.mesh) {
      this.group.remove(this.mesh);
      this.mesh.geometry.dispose();
      const mats = Array.isArray(this.mesh.material) ? this.mesh.material : [this.mesh.material];
      for (const m of mats) m.dispose();
      delete this.mesh;
    }
    if (id === 0 || !this.registry.has(id)) return;
    this.mesh = this.registry.shape(id) === 'cross' ? this.buildCross(id) : this.buildCube(id);
    this.mesh.renderOrder = 1000;
    this.mesh.visible = this.mode === 'block';
    this.group.add(this.mesh);
  }

  /** Swaps what the hand shows: the block cube, a cosmetic tool, or nothing. */
  setMode(mode: HandModeId): void {
    if (mode === this.mode) return;
    this.mode = mode;
    if (this.toolGroup) {
      this.group.remove(this.toolGroup);
      for (const d of this.toolDisposables) d.dispose();
      this.toolDisposables.length = 0;
      delete this.toolGroup;
    }
    if (mode === 'pickaxe' || mode === 'axe' || mode === 'sword') {
      this.toolGroup = this.buildTool(mode);
      this.group.add(this.toolGroup);
    }
    if (this.mesh) this.mesh.visible = mode === 'block';
  }

  /**
   * Per-frame animation: look-lag sway (the hand trails the camera), walk bob, and the
   * punch dip. `bobY` is the view-bob vertical offset so hand and eye move together.
   */
  update(dt: number, opts: { visible: boolean; yaw: number; pitch: number; bobY: number }): void {
    const handShown =
      this.mode === 'block' ? this.mesh !== undefined : this.toolGroup !== undefined;
    this.group.visible = opts.visible && handShown;
    if (!this.group.visible) {
      this.prevYaw = opts.yaw;
      this.prevPitch = opts.pitch;
      return;
    }
    const dYaw = opts.yaw - (this.prevYaw ?? opts.yaw);
    const dPitch = opts.pitch - (this.prevPitch ?? opts.pitch);
    this.prevYaw = opts.yaw;
    this.prevPitch = opts.pitch;
    // Look-lag accumulates the camera's turn and eases back to center.
    const clamp = (v: number): number => Math.max(-0.1, Math.min(0.1, v));
    this.swayYaw = clamp(this.swayYaw + dYaw * 0.4) * Math.max(0, 1 - dt * 8);
    this.swayPitch = clamp(this.swayPitch + dPitch * 0.4) * Math.max(0, 1 - dt * 8);

    this.punchT = Math.max(0, this.punchT - dt / PUNCH_SECONDS);
    // The punch dips the hand down-forward and back in one half-sine.
    const punch = Math.sin(this.punchT * Math.PI);

    this.group.position.set(
      REST.x + this.swayYaw,
      REST.y - this.swayPitch + opts.bobY - punch * 0.16,
      REST.z - punch * 0.18,
    );
    this.group.rotation.set(0.12 - punch * 0.5, -0.6 + this.swayYaw * 1.4, 0.02);
  }

  dispose(): void {
    this.setBlock(-2); // drops the current mesh (an id that can never be selected)
    this.setMode('empty'); // drops the tool viewmodel and its geometry/materials
    for (const tex of this.layerTextures.values()) tex.dispose();
    this.layerTextures.clear();
    for (const tex of this.specTextures.values()) tex.dispose();
    this.specTextures.clear();
  }

  private specTexture(spec: TextureSpec): DataTexture {
    const key = specKey(spec);
    let tex = this.specTextures.get(key);
    if (!tex) {
      const data = new Uint8Array(TILE * TILE * 4);
      paintLayer(data, 0, spec);
      tex = new DataTexture(data, TILE, TILE, RGBAFormat);
      tex.magFilter = NearestFilter;
      tex.minFilter = NearestFilter;
      tex.colorSpace = SRGBColorSpace;
      tex.needsUpdate = true;
      this.specTextures.set(key, tex);
    }
    return tex;
  }

  /** Assembles a blocky tool viewmodel from textured boxes, tilted into the grip pose. */
  private buildTool(kind: 'pickaxe' | 'axe' | 'sword'): Group {
    const tool = new Group();
    for (const part of TOOL_PARTS[kind]) {
      const geo = new BoxGeometry(...part.size);
      const mat = new MeshBasicMaterial({ map: this.specTexture(part.spec), depthTest: false });
      mat.color.setScalar(0.9); // a touch of shade so the unlit boxes read 3D
      const mesh = new Mesh(geo, mat);
      mesh.position.set(...part.pos);
      mesh.renderOrder = 1000;
      tool.add(mesh);
      this.toolDisposables.push(geo, mat);
    }
    tool.rotation.set(TOOL_ROTATION.x, TOOL_ROTATION.y, TOOL_ROTATION.z);
    tool.renderOrder = 1000;
    return tool;
  }

  private layerTexture(layer: number): DataTexture {
    let tex = this.layerTextures.get(layer);
    if (!tex) {
      const data = new Uint8Array(TILE * TILE * 4);
      paintLayer(data, 0, BLOCK_TEXTURES.uniqueSpecs[layer]);
      tex = new DataTexture(data, TILE, TILE, RGBAFormat);
      tex.magFilter = NearestFilter;
      tex.minFilter = NearestFilter;
      tex.colorSpace = SRGBColorSpace;
      tex.needsUpdate = true;
      this.layerTextures.set(layer, tex);
    }
    return tex;
  }

  private faceMaterial(id: number, face: Face, cutout: boolean): MeshBasicMaterial {
    const shade = FACE_SHADE[face];
    const mat = new MeshBasicMaterial({
      map: this.layerTexture(this.registry.faceLayer(id, face)),
      depthTest: false,
    });
    if (cutout) {
      mat.transparent = true;
      mat.alphaTest = 0.5;
      mat.side = 2; // DoubleSide
    }
    mat.color.setScalar(shade);
    return mat;
  }

  /** BoxGeometry group order (px,nx,py,ny,pz,nz) matches the Face enum indices exactly. */
  private buildCube(id: number): Mesh {
    const half = this.registry.shape(id) === 'slab';
    const geo = new BoxGeometry(1, half ? 0.5 : 1, 1);
    const mats = [Face.PosX, Face.NegX, Face.PosY, Face.NegY, Face.PosZ, Face.NegZ].map((f) =>
      this.faceMaterial(id, f, false),
    );
    const mesh = new Mesh(geo, mats);
    if (half) mesh.position.y = -0.25;
    return mesh;
  }

  /** Cross plants render as one double-sided cutout quad — reads as "holding a flower". */
  private buildCross(id: number): Mesh {
    const geo = new PlaneGeometry(1, 1);
    const mat = this.faceMaterial(id, Face.PosX, true);
    mat.color.setScalar(1);
    return new Mesh(geo, mat);
  }
}
