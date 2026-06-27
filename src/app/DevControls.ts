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
import { boxVoxels, sphereVoxels, tunnelVoxels } from '../edit/Brushes';
import { AIR } from '../blocks/blocks';
import { WORLD_HEIGHT } from '../core/constants';
import { worldToChunkCoord } from '../core/coords';
import type { BlockId, Vec3 } from '../core/types';
import type { SetVoxel } from '../edit/EditTypes';
import { listWorlds, copyWorld, deleteWorld } from '../persistence/ServerWorldCatalog';
import { worldNameFromSearch } from '../persistence/worldName';

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
}

/** A portable structure: per-voxel [dx,dy,dz,id] offsets from the min corner (non-air only). */
export interface Blueprint {
  dims: [number, number, number];
  blocks: Array<[number, number, number, BlockId]>;
}

/** Outcome of a build edit so scripts can tell why voxels didn't all change. */
export interface EditResult {
  requested: number;
  applied: number;
  /** y outside [0, WORLD_HEIGHT). */
  outOfWorld: number;
  /** Target chunk not loaded — preloadArea or teleport nearer first. */
  unloaded: number;
  /** In a loaded chunk but the block was already there. */
  noChange: number;
}

type Html2Canvas = (
  el: HTMLElement,
  opts?: { backgroundColor?: string | null; scale?: number; logging?: boolean },
) => Promise<HTMLCanvasElement>;

const PITCH_LIMIT = Math.PI / 2 - 0.01;
const clampPitch = (p: number): number => Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, p));

export function installDevControls(ctx: DevControlsContext): void {
  const { renderer, player, rig, manager, edit, inventory, registry, daynight, celestial } = ctx;

  const currentWorld = worldNameFromSearch(window.location.search);
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
  const applyEdits = (voxels: SetVoxel[]): EditResult => {
    if (voxels.length > MAX_BUILD)
      throw new Error(`build too large (${voxels.length} > ${MAX_BUILD})`);
    let outOfWorld = 0;
    let unloaded = 0;
    for (const v of voxels) {
      if (v.y < 0 || v.y >= WORLD_HEIGHT) outOfWorld++;
      else if (!manager.isLoaded(v.x, v.z)) unloaded++;
    }
    const batch = edit.apply(voxels);
    const applied = batch ? batch.changes.length : 0;
    const noChange = Math.max(0, voxels.length - applied - outOfWorld - unloaded);
    return { requested: voxels.length, applied, outOfWorld, unloaded, noChange };
  };

  // ---- primitive voxel builders ----
  const lineVoxels = (
    x1: number,
    y1: number,
    z1: number,
    x2: number,
    y2: number,
    z2: number,
    id: BlockId,
  ): SetVoxel[] => {
    const steps = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1), Math.abs(z2 - z1));
    const out: SetVoxel[] = [];
    const seen = new Set<string>();
    for (let i = 0; i <= steps; i++) {
      const t = steps === 0 ? 0 : i / steps;
      const x = Math.round(x1 + (x2 - x1) * t);
      const y = Math.round(y1 + (y2 - y1) * t);
      const z = Math.round(z1 + (z2 - z1) * t);
      const key = `${x},${y},${z}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ x, y, z, id });
    }
    return out;
  };

  const cylinderVoxels = (
    cx: number,
    cy: number,
    cz: number,
    radius: number,
    height: number,
    id: BlockId,
  ): SetVoxel[] => {
    const out: SetVoxel[] = [];
    const r2 = radius * radius;
    for (let h = 0; h < height; h++)
      for (let dz = -radius; dz <= radius; dz++)
        for (let dx = -radius; dx <= radius; dx++)
          if (dx * dx + dz * dz <= r2) out.push({ x: cx + dx, y: cy + h, z: cz + dz, id });
    return out;
  };

  const pyramidVoxels = (
    cx: number,
    cy: number,
    cz: number,
    baseRadius: number,
    id: BlockId,
  ): SetVoxel[] => {
    const out: SetVoxel[] = [];
    for (let level = 0; level <= baseRadius; level++) {
      const r = baseRadius - level;
      for (let dz = -r; dz <= r; dz++)
        for (let dx = -r; dx <= r; dx++) out.push({ x: cx + dx, y: cy + level, z: cz + dz, id });
    }
    return out;
  };

  const hollowBoxVoxels = (
    x1: number,
    y1: number,
    z1: number,
    x2: number,
    y2: number,
    z2: number,
    id: BlockId,
  ): SetVoxel[] => {
    const [ax, bx] = [Math.min(x1, x2), Math.max(x1, x2)];
    const [ay, by] = [Math.min(y1, y2), Math.max(y1, y2)];
    const [az, bz] = [Math.min(z1, z2), Math.max(z1, z2)];
    const out: SetVoxel[] = [];
    for (let y = ay; y <= by; y++)
      for (let z = az; z <= bz; z++)
        for (let x = ax; x <= bx; x++)
          if (x === ax || x === bx || y === ay || y === by || z === az || z === bz)
            out.push({ x, y, z, id });
    return out;
  };

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
    orbit: (
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

    // --- build (via the real EditService, so undo/redo + persistence apply) ---
    place: (x: number, y: number, z: number, id: BlockId): EditResult =>
      applyEdits([{ x, y, z, id }]),
    fill: (
      x1: number,
      y1: number,
      z1: number,
      x2: number,
      y2: number,
      z2: number,
      id: BlockId,
    ): EditResult =>
      applyEdits(
        boxVoxels({ x: x1, y: y1, z: z1 }, { x: x2, y: y2, z: z2 }).map((v) => ({ ...v, id })),
      ),
    clearBox: (
      x1: number,
      y1: number,
      z1: number,
      x2: number,
      y2: number,
      z2: number,
    ): EditResult =>
      applyEdits(
        boxVoxels({ x: x1, y: y1, z: z1 }, { x: x2, y: y2, z: z2 }).map((v) => ({ ...v, id: AIR })),
      ),
    sphere: (cx: number, cy: number, cz: number, radius: number, id: BlockId): EditResult =>
      applyEdits(sphereVoxels({ x: cx, y: cy, z: cz }, radius).map((v) => ({ ...v, id }))),
    tunnel: (
      x: number,
      y: number,
      z: number,
      dir: Vec3,
      length: number,
      radius: number,
      id: BlockId,
    ): EditResult =>
      applyEdits(tunnelVoxels({ x, y, z }, dir, length, radius).map((v) => ({ ...v, id }))),
    /** Copy a region into a portable blueprint (relative coords, non-air only). */
    copy: (x1: number, y1: number, z1: number, x2: number, y2: number, z2: number): Blueprint => {
      const [ax, bx] = [Math.min(x1, x2), Math.max(x1, x2)];
      const [ay, by] = [Math.min(y1, y2), Math.max(y1, y2)];
      const [az, bz] = [Math.min(z1, z2), Math.max(z1, z2)];
      if ((bx - ax + 1) * (by - ay + 1) * (bz - az + 1) > 200000)
        throw new Error('copy region too large (>200k)');
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
    paste: (bp: Blueprint, ox: number, oy: number, oz: number): EditResult =>
      applyEdits(bp.blocks.map(([dx, dy, dz, id]) => ({ x: ox + dx, y: oy + dy, z: oz + dz, id }))),
    line: (x1: number, y1: number, z1: number, x2: number, y2: number, z2: number, id: BlockId) =>
      applyEdits(lineVoxels(x1, y1, z1, x2, y2, z2, id)),
    cylinder: (cx: number, cy: number, cz: number, radius: number, height: number, id: BlockId) =>
      applyEdits(cylinderVoxels(cx, cy, cz, radius, height, id)),
    pyramid: (cx: number, cy: number, cz: number, baseRadius: number, id: BlockId) =>
      applyEdits(pyramidVoxels(cx, cy, cz, baseRadius, id)),
    hollowBox: (
      x1: number,
      y1: number,
      z1: number,
      x2: number,
      y2: number,
      z2: number,
      id: BlockId,
    ) => applyEdits(hollowBoxVoxels(x1, y1, z1, x2, y2, z2, id)),
    /** Persist a blueprint to .blueprints/<name>.json (reusable across sessions). */
    saveBlueprint: (name: string, bp: Blueprint): Promise<string> => saveBlueprint(name, bp),
    loadBlueprint: (name: string): Promise<Blueprint> => loadBlueprint(name),
    /** Load a named blueprint and stamp it at (ox,oy,oz). */
    stamp: async (name: string, ox: number, oy: number, oz: number): Promise<EditResult> => {
      const bp = await loadBlueprint(name);
      return applyEdits(
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
    state: (): Record<string, unknown> => ({
      pos: { ...player.position },
      look: { yaw: rig.yaw, pitch: rig.pitch },
      flying: player.flying,
      selectedBlock: registry.get(inventory.selectedBlock).name,
    }),
    /** Lists the available methods (so a fresh session can discover the API). */
    help: (): string[] => Object.keys(api),
  };

  (window as typeof window & { __vr?: typeof api }).__vr = api;
}
