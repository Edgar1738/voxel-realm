import type { Renderer } from '../render/Renderer';
import type { CameraRig } from '../render/CameraRig';
import type { PlayerController } from '../player/PlayerController';
import type { ChunkManager } from '../world/ChunkManager';
import type { DayNight } from '../render/DayNight';
import type { CelestialSky } from '../render/CelestialSky';
import type { EditService } from '../edit/EditService';
import type { CreativeInventory } from './CreativeInventory';
import { CREATIVE_BLOCKS } from './CreativeInventory';
import type { BlockRegistry } from '../blocks/BlockRegistry';
import {
  applyVoxelsInBatches,
  buildTerrainPathVoxels,
  createMemoryBookmarks,
  type BatchedEditResult,
  type EditResult,
  type Pose,
  type TerrainPathOptions,
  type TerrainPathPoint,
} from './DevBuildTools';
import { collectDevState, type DevState } from './DevState';
import { frameBox } from './studioFraming';
import { lineVoxels, cylinderVoxels, pyramidVoxels, hollowBoxVoxels } from './DevShapes';
import { boxVoxels, sphereVoxels, tunnelVoxels } from '../edit/Brushes';
import { AIR } from '../blocks/blocks';
import { WORLD_HEIGHT } from '../core/constants';
import { chunkKey, worldToChunkCoord } from '../core/coords';
import type { BlockId, Vec3 } from '../core/types';
import type { SetVoxel } from '../edit/EditTypes';
import { listWorlds, copyWorld, deleteWorld } from '../persistence/ServerWorldCatalog';
import type { WorldPreset } from '../worldgen/Presets';
import { rotateY, mirror as mirrorPrefab, repeat, type Prefab } from '../core/Prefab';
import { replaceVoxels, prefabToVoxels } from './RegionOps';

/**
 * Dev-only "roam studio" exposed as `window.__vr`: pose the camera, roam, build, capture, and
 * introspect the world headlessly. The live WebGL context hangs CDP screenshots, so capture
 * renders one frame and returns/writes a JPEG instead. Imported only under import.meta.env.DEV,
 * so none of this ships in production.
 */
export interface DevControlsContext {
  renderer: Renderer;
  player: PlayerController;
  rig: CameraRig;
  manager: ChunkManager;
  edit: EditService;
  inventory: CreativeInventory;
  registry: BlockRegistry;
  daynight: DayNight;
  celestial: CelestialSky;
  preset: WorldPreset;
  worldName: string;
}

/** A portable structure: per-voxel [dx,dy,dz,id] offsets from the min corner (non-air only). */
export type Blueprint = Prefab;

type Html2Canvas = (
  el: HTMLElement,
  opts?: { backgroundColor?: string | null; scale?: number; logging?: boolean },
) => Promise<HTMLCanvasElement>;

const PITCH_LIMIT = Math.PI / 2 - 0.01;
const clampPitch = (p: number): number => Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, p));

export function installDevControls(ctx: DevControlsContext): void {
  const {
    renderer,
    player,
    rig,
    manager,
    edit,
    inventory,
    registry,
    daynight,
    celestial,
    preset,
    worldName,
  } = ctx;

  const currentWorld = worldName;
  const gotoWorld = (name: string): void => {
    const u = new URL(window.location.href);
    u.searchParams.set('save', name);
    window.location.href = u.toString();
  };

  // Push the current player eye + look into the camera so a teleport/aim is reflected
  // immediately on the next capture, independent of the rAF render loop's timing.
  const syncCamera = (): void => {
    const eye = player.eye();
    rig.applyEye(eye.x, eye.y, eye.z);
  };

  const downscale = (src: HTMLCanvasElement, maxWidth: number): HTMLCanvasElement => {
    const scale = Math.min(1, maxWidth / src.width);
    const off = document.createElement('canvas');
    off.width = Math.max(1, Math.round(src.width * scale));
    off.height = Math.max(1, Math.round(src.height * scale));
    off.getContext('2d')?.drawImage(src, 0, 0, off.width, off.height);
    return off;
  };

  const renderToCanvas = (maxWidth: number): HTMLCanvasElement => {
    syncCamera();
    // Re-place the sun/moon/stars for the (possibly just-moved) camera before this one-off render,
    // since the rAF loop's update may be throttled in a headless/background tab.
    celestial.update(daynight.time, renderer.camera.position);
    renderer.renderOnce();
    return downscale(renderer.domElement, maxWidth);
  };

  const view = (maxWidth = 720, quality = 0.6): string =>
    renderToCanvas(maxWidth).toDataURL('image/jpeg', quality);

  let html2canvas: Html2Canvas | undefined;
  const shot = async (maxWidth = 720, quality = 0.65): Promise<string> => {
    const frame = renderToCanvas(maxWidth);
    try {
      if (!html2canvas) {
        const mod = await import(/* @vite-ignore */ 'https://esm.sh/html2canvas@1.4.1');
        html2canvas = mod.default;
      }
      const hud = document.getElementById('creative-ui');
      if (hud) {
        const rendered = await html2canvas(hud, { backgroundColor: null, logging: false });
        frame.getContext('2d')?.drawImage(rendered, 0, 0, frame.width, frame.height);
      }
    } catch (err) {
      console.warn('Voxel Realm: HUD composite failed, returning world-only frame', err);
    }
    return frame.toDataURL('image/jpeg', quality);
  };

  let lastSavedPath = '';
  /** Capture and write the JPEG to .captures/<name>.jpg via the dev server; returns the path. */
  const save = async (
    name = 'frame',
    opts: { hud?: boolean; maxWidth?: number; quality?: number } = {},
  ): Promise<string> => {
    const dataUrl = opts.hud
      ? await shot(opts.maxWidth ?? 960, opts.quality ?? 0.7)
      : view(opts.maxWidth ?? 960, opts.quality ?? 0.7);
    const res = await fetch('/__capture', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, dataUrl }),
    });
    const { path } = (await res.json()) as { path: string };
    lastSavedPath = path;
    return path;
  };

  const lookAt = (tx: number, ty: number, tz: number): void => {
    const eye = player.eye();
    const dx = tx - eye.x;
    const dy = ty - eye.y;
    const dz = tz - eye.z;
    const horizontal = Math.hypot(dx, dz);
    rig.yaw = Math.atan2(-dx, -dz);
    rig.pitch = clampPitch(Math.atan2(dy, horizontal));
  };

  const MAX_BUILD = 50000;
  const applyBatch = (voxels: SetVoxel[]): EditResult => {
    if (voxels.length > MAX_BUILD)
      throw new Error(`build too large (${voxels.length} > ${MAX_BUILD})`);
    let outOfWorld = 0;
    let unloaded = 0;
    const unloadedChunkSet = new Set<string>();
    for (const v of voxels) {
      if (v.y < 0 || v.y >= WORLD_HEIGHT) outOfWorld++;
      else if (!manager.isLoaded(v.x, v.z)) {
        unloaded++;
        unloadedChunkSet.add(chunkKey(worldToChunkCoord(v.x), worldToChunkCoord(v.z)));
      }
    }
    const batch = edit.apply(voxels);
    const applied = batch ? batch.changes.length : 0;
    const noChange = Math.max(0, voxels.length - applied - outOfWorld - unloaded);
    return {
      requested: voxels.length,
      applied,
      outOfWorld,
      unloaded,
      noChange,
      invalid: 0,
      unloadedChunks: [...unloadedChunkSet],
    };
  };
  const voxelBounds = (voxels: SetVoxel[]) => {
    let minX = Infinity,
      minZ = Infinity,
      maxX = -Infinity,
      maxZ = -Infinity;
    for (const v of voxels) {
      if (v.x < minX) minX = v.x;
      if (v.z < minZ) minZ = v.z;
      if (v.x > maxX) maxX = v.x;
      if (v.z > maxZ) maxZ = v.z;
    }
    return { minX, minZ, maxX, maxZ };
  };

  const applyAny = (
    voxels: SetVoxel[],
    opts: { label?: string; maxBatchSize?: number; preload?: boolean } = {},
  ): BatchedEditResult => {
    const valid = voxels.filter((v) => registry.has(v.id));
    const invalidCount = voxels.length - valid.length;
    if (invalidCount > 0) {
      const prefix = opts.label ? `[${opts.label}] ` : '';
      console.warn(
        `Voxel Realm build: ${prefix}${invalidCount} voxel(s) rejected for unknown block id`,
      );
    }
    if (valid.length > 0 && opts.preload !== false) {
      const b = voxelBounds(valid);
      try {
        manager.preloadBox(b.minX, b.minZ, b.maxX, b.maxZ);
      } catch {
        /* region too large to auto-preload; fall through and report unloaded honestly */
      }
    }
    const maxBatchSize = Math.min(
      MAX_BUILD,
      Math.max(1, Math.floor(opts.maxBatchSize ?? MAX_BUILD)),
    );
    const result = edit.group(() => applyVoxelsInBatches(valid, applyBatch, maxBatchSize));
    const finalResult: BatchedEditResult = {
      ...result,
      requested: result.requested + invalidCount,
      invalid: result.invalid + invalidCount,
    };
    if (finalResult.unloaded > 0) {
      const prefix = opts.label ? `[${opts.label}] ` : '';
      console.warn(
        `Voxel Realm build: ${prefix}${finalResult.unloaded} voxel(s) hit unloaded chunks ${finalResult.unloadedChunks.join(' ')}`,
      );
    }
    if (opts.label) console.debug(`Voxel Realm build: ${opts.label}`, finalResult);
    return finalResult;
  };

  const orbitCamera = (
    cx: number,
    cy: number,
    cz: number,
    radius: number,
    angle = 0,
    height?: number,
  ): void => {
    player.position.x = cx + radius * Math.cos(angle);
    player.position.z = cz + radius * Math.sin(angle);
    player.position.y = height ?? cy + radius * 0.6;
    lookAt(cx, cy, cz);
  };

  const bookmarks = createMemoryBookmarks(
    (): Pose => ({
      pos: { ...player.position },
      yaw: rig.yaw,
      pitch: rig.pitch,
    }),
    (pose) => {
      player.position.x = pose.pos.x;
      player.position.y = pose.pos.y;
      player.position.z = pose.pos.z;
      rig.yaw = pose.yaw;
      rig.pitch = clampPitch(pose.pitch);
      syncCamera();
    },
  );

  // ---- primitive voxel builders (pure generators live in DevShapes.ts) ----

  // ---- blueprint library (persisted to .blueprints/ via the dev server) ----
  const saveBlueprint = async (name: string, bp: Blueprint): Promise<string> => {
    const res = await fetch('/__blueprint', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, blueprint: bp }),
    });
    return ((await res.json()) as { path: string }).path;
  };
  const loadBlueprint = async (name: string): Promise<Blueprint> => {
    const res = await fetch(`/__blueprint?name=${encodeURIComponent(name)}`);
    if (!res.ok) throw new Error(`blueprint not found: ${name}`);
    return (await res.json()) as Blueprint;
  };

  const api = {
    // --- roam ---
    pos: (): Vec3 => ({ ...player.position }),
    look: (): { yaw: number; pitch: number } => ({ yaw: rig.yaw, pitch: rig.pitch }),
    teleport: (x: number, y: number, z: number): void => {
      player.position.x = x;
      player.position.y = y;
      player.position.z = z;
    },
    aim: (yaw: number, pitch = rig.pitch): void => {
      rig.yaw = yaw;
      rig.pitch = clampPitch(pitch);
    },
    turn: (dyaw: number, dpitch = 0): void => {
      rig.yaw += dyaw;
      rig.pitch = clampPitch(rig.pitch + dpitch);
    },
    lookAt,
    /** Place the camera on a circle of `radius` around (cx,cy,cz) at `angle` rad, looking in. */
    orbit: (cx: number, cy: number, cz: number, radius: number, angle = 0, height?: number): void =>
      orbitCamera(cx, cy, cz, radius, angle, height),
    /**
     * Position the camera to frame an axis-aligned box (corners need not be ordered).
     * Sizes the distance to fit the box for the current fov/aspect; returns the eye/target used.
     * `dir` optionally overrides the viewing direction from the box center toward the eye.
     */
    frame: (
      x1: number,
      y1: number,
      z1: number,
      x2: number,
      y2: number,
      z2: number,
      dir?: Vec3,
    ): { eye: Vec3; target: Vec3 } => {
      const min = { x: Math.min(x1, x2), y: Math.min(y1, y2), z: Math.min(z1, z2) };
      const max = { x: Math.max(x1, x2), y: Math.max(y1, y2), z: Math.max(z1, z2) };
      const { eye, target } = frameBox(min, max, renderer.camera.fov, renderer.camera.aspect, dir);
      player.position.x = eye.x;
      player.position.y = eye.y;
      player.position.z = eye.z;
      lookAt(target.x, target.y, target.z);
      return { eye, target };
    },
    /** Move along the current look direction by `dist` blocks (fly roaming). */
    forward: (dist: number): void => {
      const { yaw, pitch } = rig;
      player.position.x += -Math.sin(yaw) * Math.cos(pitch) * dist;
      player.position.y += Math.sin(pitch) * dist;
      player.position.z += -Math.cos(yaw) * Math.cos(pitch) * dist;
    },
    fly: (on = true): void => {
      player.flying = on;
    },
    /** Set time of day (0=midnight, 0.25=sunrise, 0.5=noon, 0.75=sunset). */
    time: (t: number): void => daynight.set(t),
    timeOfDay: (): number => daynight.time,
    /** Real seconds for a full day/night cycle (default 600). */
    dayLength: (seconds: number): void => {
      daynight.dayLengthSec = Math.max(1, seconds);
    },

    // --- see ---
    view,
    shot,
    save,
    /** Path of the most recent save()/capture write (synchronous; '' before the first capture). */
    lastCapturePath: (): string => lastSavedPath,
    capture: {
      overview: async (
        name: string,
        target: Vec3,
        opts: {
          radius?: number;
          angle?: number;
          height?: number;
          hud?: boolean;
          maxWidth?: number;
          quality?: number;
        } = {},
      ): Promise<string> => {
        orbitCamera(
          target.x,
          target.y,
          target.z,
          opts.radius ?? 60,
          opts.angle ?? Math.PI / 4,
          opts.height,
        );
        const saveOpts: { hud?: boolean; maxWidth?: number; quality?: number } = {
          hud: opts.hud ?? true,
        };
        if (opts.maxWidth !== undefined) saveOpts.maxWidth = opts.maxWidth;
        if (opts.quality !== undefined) saveOpts.quality = opts.quality;
        return save(name, saveOpts);
      },
    },

    // --- build (via the real EditService, so undo/redo + persistence apply) ---
    apply: (
      voxels: SetVoxel[],
      opts: { label?: string; maxBatchSize?: number } = {},
    ): BatchedEditResult => applyAny(voxels, opts),
    path: (
      points: TerrainPathPoint[],
      opts: Partial<TerrainPathOptions> & { label?: string } = {},
    ): BatchedEditResult => {
      const block = opts.block ?? inventory.selectedBlock;
      const pathOpts: TerrainPathOptions = { block };
      if (opts.width !== undefined) pathOpts.width = opts.width;
      if (opts.supportBlock !== undefined) pathOpts.supportBlock = opts.supportBlock;
      if (opts.markerEvery !== undefined) pathOpts.markerEvery = opts.markerEvery;
      if (opts.markerBlock !== undefined) pathOpts.markerBlock = opts.markerBlock;
      return applyAny(
        buildTerrainPathVoxels(points, pathOpts, (x, z) => api.surface(x, z).y ?? 0),
        { label: opts.label ?? 'path' },
      );
    },
    place: (x: number, y: number, z: number, id: BlockId): BatchedEditResult =>
      applyAny([{ x, y, z, id }]),
    fill: (
      x1: number,
      y1: number,
      z1: number,
      x2: number,
      y2: number,
      z2: number,
      id: BlockId,
    ): BatchedEditResult =>
      applyAny(
        boxVoxels({ x: x1, y: y1, z: z1 }, { x: x2, y: y2, z: z2 }).map((v) => ({ ...v, id })),
      ),
    clearBox: (
      x1: number,
      y1: number,
      z1: number,
      x2: number,
      y2: number,
      z2: number,
    ): BatchedEditResult =>
      applyAny(
        boxVoxels({ x: x1, y: y1, z: z1 }, { x: x2, y: y2, z: z2 }).map((v) => ({ ...v, id: AIR })),
      ),
    sphere: (cx: number, cy: number, cz: number, radius: number, id: BlockId): BatchedEditResult =>
      applyAny(sphereVoxels({ x: cx, y: cy, z: cz }, radius).map((v) => ({ ...v, id }))),
    tunnel: (
      x: number,
      y: number,
      z: number,
      dir: Vec3,
      length: number,
      radius: number,
      id: BlockId,
    ): BatchedEditResult =>
      applyAny(tunnelVoxels({ x, y, z }, dir, length, radius).map((v) => ({ ...v, id }))),
    /** Copy a region into a portable blueprint (relative coords, non-air only). */
    copy: (x1: number, y1: number, z1: number, x2: number, y2: number, z2: number): Blueprint => {
      const [ax, bx] = [Math.min(x1, x2), Math.max(x1, x2)];
      const [ay, by] = [Math.min(y1, y2), Math.max(y1, y2)];
      const [az, bz] = [Math.min(z1, z2), Math.max(z1, z2)];
      if ((bx - ax + 1) * (by - ay + 1) * (bz - az + 1) > 200000)
        throw new Error('copy region too large (>200k)');
      try {
        manager.preloadBox(ax, az, bx, bz);
      } catch {
        /* region too large to auto-preload */
      }
      const blocks: Array<[number, number, number, BlockId]> = [];
      for (let y = ay; y <= by; y++)
        for (let z = az; z <= bz; z++)
          for (let x = ax; x <= bx; x++) {
            const id = manager.getBlock(x, y, z);
            if (id !== AIR) blocks.push([x - ax, y - ay, z - az, id]);
          }
      return { dims: [bx - ax + 1, by - ay + 1, bz - az + 1], blocks };
    },
    /** Stamp a blueprint with its min corner at (ox,oy,oz). */
    paste: (bp: Blueprint, ox: number, oy: number, oz: number): BatchedEditResult =>
      applyAny(bp.blocks.map(([dx, dy, dz, id]) => ({ x: ox + dx, y: oy + dy, z: oz + dz, id }))),

    /** Replace every `fromId` voxel in the box with `toId` (one undo). */
    replace: (
      x1: number,
      y1: number,
      z1: number,
      x2: number,
      y2: number,
      z2: number,
      fromId: BlockId,
      toId: BlockId,
    ): BatchedEditResult => {
      try {
        manager.preloadBox(Math.min(x1, x2), Math.min(z1, z2), Math.max(x1, x2), Math.max(z1, z2));
      } catch {
        /* region too large to auto-preload */
      }
      return applyAny(
        replaceVoxels(
          (x, y, z) => manager.getBlock(x, y, z),
          { x1, y1, z1, x2, y2, z2 },
          fromId,
          toId,
        ),
        { label: 'replace' },
      );
    },

    /** Move a box by (dx,dy,dz): copy, clear the source, paste at the offset — one undo. */
    move: (
      x1: number,
      y1: number,
      z1: number,
      x2: number,
      y2: number,
      z2: number,
      dx: number,
      dy: number,
      dz: number,
    ): BatchedEditResult => {
      const bp = api.copy(x1, y1, z1, x2, y2, z2);
      const ox = Math.min(x1, x2),
        oy = Math.min(y1, y2),
        oz = Math.min(z1, z2);
      const clear = boxVoxels({ x: x1, y: y1, z: z1 }, { x: x2, y: y2, z: z2 }).map((v) => ({
        ...v,
        id: AIR,
      }));
      const paste = prefabToVoxels(bp, ox + dx, oy + dy, oz + dz);
      return applyAny([...clear, ...paste], { label: 'move' });
    },

    /**
     * Mirror a box in place across 'x' or 'z' (one undo).
     * NOTE: pastes in place WITHOUT clearing the source footprint — mirroring a non-square region
     * can leave residual original voxels outside the new footprint; clear the box first (or use
     * square regions) if that matters.
     */
    mirror: (
      x1: number,
      y1: number,
      z1: number,
      x2: number,
      y2: number,
      z2: number,
      axis: 'x' | 'z',
    ): BatchedEditResult => {
      const bp = api.copy(x1, y1, z1, x2, y2, z2);
      const ox = Math.min(x1, x2),
        oy = Math.min(y1, y2),
        oz = Math.min(z1, z2);
      return applyAny(prefabToVoxels(mirrorPrefab(bp, axis), ox, oy, oz), { label: 'mirror' });
    },

    /**
     * Rotate a box in place about Y by `quarterTurns` * 90deg, re-anchored at the min corner (one undo).
     * NOTE: pastes in place WITHOUT clearing the source footprint — rotating a non-square region
     * can leave residual original voxels outside the new footprint; clear the box first (or use
     * square regions) if that matters.
     */
    rotate: (
      x1: number,
      y1: number,
      z1: number,
      x2: number,
      y2: number,
      z2: number,
      quarterTurns: number,
    ): BatchedEditResult => {
      const bp = api.copy(x1, y1, z1, x2, y2, z2);
      const ox = Math.min(x1, x2),
        oy = Math.min(y1, y2),
        oz = Math.min(z1, z2);
      return applyAny(prefabToVoxels(rotateY(bp, quarterTurns), ox, oy, oz), { label: 'rotate' });
    },

    /** Tile a box into an nx*ny*nz grid with the given per-axis stride (one undo). */
    array: (
      x1: number,
      y1: number,
      z1: number,
      x2: number,
      y2: number,
      z2: number,
      nx: number,
      ny: number,
      nz: number,
      sx: number,
      sy: number,
      sz: number,
    ): BatchedEditResult => {
      const bp = api.copy(x1, y1, z1, x2, y2, z2);
      const ox = Math.min(x1, x2),
        oy = Math.min(y1, y2),
        oz = Math.min(z1, z2);
      return applyAny(prefabToVoxels(repeat(bp, nx, ny, nz, [sx, sy, sz]), ox, oy, oz), {
        label: 'array',
      });
    },

    line: (x1: number, y1: number, z1: number, x2: number, y2: number, z2: number, id: BlockId) =>
      applyAny(lineVoxels(x1, y1, z1, x2, y2, z2, id)),
    cylinder: (cx: number, cy: number, cz: number, radius: number, height: number, id: BlockId) =>
      applyAny(cylinderVoxels(cx, cy, cz, radius, height, id)),
    pyramid: (cx: number, cy: number, cz: number, baseRadius: number, id: BlockId) =>
      applyAny(pyramidVoxels(cx, cy, cz, baseRadius, id)),
    hollowBox: (
      x1: number,
      y1: number,
      z1: number,
      x2: number,
      y2: number,
      z2: number,
      id: BlockId,
    ) => applyAny(hollowBoxVoxels(x1, y1, z1, x2, y2, z2, id)),
    /** Persist a blueprint to .blueprints/<name>.json (reusable across sessions). */
    saveBlueprint: (name: string, bp: Blueprint): Promise<string> => saveBlueprint(name, bp),
    loadBlueprint: (name: string): Promise<Blueprint> => loadBlueprint(name),
    /** Load a named blueprint and stamp it at (ox,oy,oz). */
    stamp: async (name: string, ox: number, oy: number, oz: number): Promise<BatchedEditResult> => {
      const bp = await loadBlueprint(name);
      return applyAny(
        bp.blocks.map(([dx, dy, dz, id]) => ({ x: ox + dx, y: oy + dy, z: oz + dz, id })),
      );
    },
    undo: (): string => edit.undo(),
    redo: (): string => edit.redo(),
    /** Force-generate + mesh chunks within `radius` chunks of world (x,z) so edits/scans work now. */
    preloadArea: (x: number, z: number, radius = 2): { generated: number; meshed: number } =>
      manager.preload(worldToChunkCoord(x), worldToChunkCoord(z), Math.max(0, Math.floor(radius))),
    /** Whether the chunk at world (x,z) is loaded (editable/scannable). */
    isLoaded: (x: number, z: number): boolean => manager.isLoaded(x, z),

    // --- named worlds (shared storage) ---
    world: {
      list: (): Promise<string[]> => listWorlds(),
      current: (): string => currentWorld,
      /** Copy the current world to `name` (does not switch). Returns the new name. */
      saveAs: async (name: string): Promise<string> => {
        await copyWorld(currentWorld, name);
        return name;
      },
      /** Reload into world `name` (creates it on first edit if absent). */
      load: (name: string): void => gotoWorld(name),
      delete: (name: string): Promise<void> => deleteWorld(name),
    },
    bookmark: bookmarks,

    // --- introspect / structural perception ---
    blockAt: (x: number, y: number, z: number): string =>
      registry.get(manager.getBlock(x, y, z)).name,
    /** Highest non-air voxel in the (x,z) column: {y, block}, or y=null if all air/unloaded. */
    surface: (x: number, z: number): { y: number | null; block: string } => {
      for (let y = WORLD_HEIGHT - 1; y >= 0; y--) {
        const id = manager.getBlock(x, y, z);
        if (id !== AIR) return { y, block: registry.get(id).name };
      }
      return { y: null, block: 'air' };
    },
    /** Block histogram over a box (capped at 200k voxels): { dims, nonAir, counts }. */
    scan: (
      x1: number,
      y1: number,
      z1: number,
      x2: number,
      y2: number,
      z2: number,
    ): { dims: [number, number, number]; nonAir: number; counts: Record<string, number> } => {
      const [ax, bx] = [Math.min(x1, x2), Math.max(x1, x2)];
      const [ay, by] = [Math.min(y1, y2), Math.max(y1, y2)];
      const [az, bz] = [Math.min(z1, z2), Math.max(z1, z2)];
      const dims: [number, number, number] = [bx - ax + 1, by - ay + 1, bz - az + 1];
      if (dims[0] * dims[1] * dims[2] > 200000) throw new Error('scan region too large (>200k)');
      const counts: Record<string, number> = {};
      let nonAir = 0;
      for (let y = ay; y <= by; y++)
        for (let z = az; z <= bz; z++)
          for (let x = ax; x <= bx; x++) {
            const id = manager.getBlock(x, y, z);
            if (id === AIR) continue;
            nonAir++;
            const name = registry.get(id).name;
            counts[name] = (counts[name] ?? 0) + 1;
          }
      return { dims, nonAir, counts };
    },
    /** ASCII top-down floor plan of one y-layer (area capped at 80x80): { y, legend, rows }. */
    slice: (
      y: number,
      x1: number,
      z1: number,
      x2: number,
      z2: number,
    ): { y: number; legend: Record<string, string>; rows: string[] } => {
      const [ax, bx] = [Math.min(x1, x2), Math.max(x1, x2)];
      const [az, bz] = [Math.min(z1, z2), Math.max(z1, z2)];
      if ((bx - ax + 1) * (bz - az + 1) > 6400) throw new Error('slice area too large (>80x80)');
      const palette = '#@%&*+=oxOXNHBW';
      const chars = new Map<BlockId, string>();
      const rows: string[] = [];
      for (let z = az; z <= bz; z++) {
        let row = '';
        for (let x = ax; x <= bx; x++) {
          const id = manager.getBlock(x, y, z);
          if (id === AIR) {
            row += ' ';
            continue;
          }
          if (!chars.has(id)) chars.set(id, palette[chars.size % palette.length]);
          row += chars.get(id);
        }
        rows.push(row);
      }
      const legend: Record<string, string> = {};
      for (const [id, ch] of chars) legend[ch] = registry.get(id).name;
      return { y, legend, rows };
    },
    blocks: (): Array<{ id: BlockId; name: string }> =>
      CREATIVE_BLOCKS.map((id) => ({ id, name: registry.get(id).name })),
    state: (): DevState =>
      collectDevState({ player, rig, manager, inventory, registry, preset, worldName }),
    /** Lists the available methods (so a fresh session can discover the API). */
    help: (): string[] => Object.keys(api),
  };

  (window as typeof window & { __vr?: typeof api }).__vr = api;
}
