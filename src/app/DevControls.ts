import type { Renderer } from '../render/Renderer';
import type { CameraRig } from '../render/CameraRig';
import type { PlayerController } from '../player/PlayerController';
import type { ChunkManager } from '../world/ChunkManager';
import type { EditService } from '../edit/EditService';
import type { CreativeInventory } from './CreativeInventory';
import { CREATIVE_BLOCKS } from './CreativeInventory';
import type { BlockRegistry } from '../blocks/BlockRegistry';
import { boxVoxels } from '../edit/Brushes';
import { AIR } from '../blocks/blocks';
import type { BlockId, Vec3 } from '../core/types';
import type { SetVoxel } from '../edit/EditTypes';

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
}

type Html2Canvas = (
  el: HTMLElement,
  opts?: { backgroundColor?: string | null; scale?: number; logging?: boolean },
) => Promise<HTMLCanvasElement>;

const PITCH_LIMIT = Math.PI / 2 - 0.01;
const clampPitch = (p: number): number => Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, p));

export function installDevControls(ctx: DevControlsContext): void {
  const { renderer, player, rig, manager, edit, inventory, registry } = ctx;

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

  const applyEdits = (voxels: SetVoxel[]): number => {
    const batch = edit.apply(voxels);
    return batch ? batch.changes.length : 0;
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

    // --- see ---
    view,
    shot,
    save,

    // --- build (via the real EditService, so undo/redo + persistence apply) ---
    place: (x: number, y: number, z: number, id: BlockId): number => applyEdits([{ x, y, z, id }]),
    fill: (
      x1: number,
      y1: number,
      z1: number,
      x2: number,
      y2: number,
      z2: number,
      id: BlockId,
    ): number =>
      applyEdits(
        boxVoxels({ x: x1, y: y1, z: z1 }, { x: x2, y: y2, z: z2 }).map((v) => ({ ...v, id })),
      ),
    clearBox: (x1: number, y1: number, z1: number, x2: number, y2: number, z2: number): number =>
      applyEdits(
        boxVoxels({ x: x1, y: y1, z: z1 }, { x: x2, y: y2, z: z2 }).map((v) => ({ ...v, id: AIR })),
      ),
    undo: (): string => edit.undo(),
    redo: (): string => edit.redo(),

    // --- introspect ---
    blockAt: (x: number, y: number, z: number): string =>
      registry.get(manager.getBlock(x, y, z)).name,
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
