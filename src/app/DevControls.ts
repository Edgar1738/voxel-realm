import type { Renderer } from '../render/Renderer';
import type { CameraRig } from '../render/CameraRig';
import type { PlayerController } from '../player/PlayerController';
import type { Vec3 } from '../core/types';

/**
 * Dev-only roam + capture surface, exposed as `window.__vr`. The live WebGL context hangs
 * CDP/Playwright screenshots, so capture renders one frame and returns a JPEG data URL instead.
 * Imported only under `import.meta.env.DEV`, so none of this ships in production.
 */
export interface VrDevApi {
  /** Current player position. */
  pos(): Vec3;
  /** Current look angles (radians). */
  look(): { yaw: number; pitch: number };
  /** Move the player to a world position (stays put in fly mode). */
  teleport(x: number, y: number, z: number): void;
  /** Set absolute look angles. yaw 0 faces -Z; +pitch looks up. */
  aim(yaw: number, pitch?: number): void;
  /** Nudge look angles by deltas. */
  turn(dyaw: number, dpitch?: number): void;
  /** Toggle fly mode (default on). */
  fly(on?: boolean): void;
  /** Capture the world view as a downscaled JPEG data URL. */
  view(maxWidth?: number, quality?: number): string;
  /** Capture the world with the DOM HUD composited on top (async; falls back to world-only). */
  shot(maxWidth?: number, quality?: number): Promise<string>;
}

type Html2Canvas = (
  el: HTMLElement,
  opts?: { backgroundColor?: string | null; scale?: number; logging?: boolean },
) => Promise<HTMLCanvasElement>;

const PITCH_LIMIT = Math.PI / 2 - 0.01;
const clampPitch = (p: number): number => Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, p));

export function installDevControls(
  renderer: Renderer,
  player: PlayerController,
  rig: CameraRig,
): void {
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

  const view = (maxWidth = 480, quality = 0.55): string => {
    syncCamera();
    renderer.renderOnce();
    return downscale(renderer.domElement, maxWidth).toDataURL('image/jpeg', quality);
  };

  let html2canvas: Html2Canvas | undefined;
  const shot = async (maxWidth = 480, quality = 0.6): Promise<string> => {
    syncCamera();
    renderer.renderOnce();
    const frame = downscale(renderer.domElement, maxWidth);
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

  const api: VrDevApi = {
    pos: () => ({ ...player.position }),
    look: () => ({ yaw: rig.yaw, pitch: rig.pitch }),
    teleport: (x, y, z) => {
      player.position.x = x;
      player.position.y = y;
      player.position.z = z;
    },
    aim: (yaw, pitch = rig.pitch) => {
      rig.yaw = yaw;
      rig.pitch = clampPitch(pitch);
    },
    turn: (dyaw, dpitch = 0) => {
      rig.yaw += dyaw;
      rig.pitch = clampPitch(rig.pitch + dpitch);
    },
    fly: (on = true) => {
      player.flying = on;
    },
    view,
    shot,
  };

  (window as typeof window & { __vr?: VrDevApi }).__vr = api;
}
