import type { Renderer } from '../render/Renderer';
import type { CameraRig } from '../render/CameraRig';
import type { PlayerController } from '../player/PlayerController';
import type { DayNight } from '../render/DayNight';
import type { CelestialSky } from '../render/CelestialSky';

type Html2Canvas = (
  el: HTMLElement,
  opts?: { backgroundColor?: string | null; scale?: number; logging?: boolean },
) => Promise<HTMLCanvasElement>;

export interface DevCapture {
  syncCamera(): void;
  view(maxWidth?: number, quality?: number): string;
  shot(maxWidth?: number, quality?: number): Promise<string>;
  save(
    name?: string,
    opts?: { hud?: boolean; maxWidth?: number; quality?: number },
  ): Promise<string>;
  lastPath(): string;
}

/** Owns the dev studio's one-off rendering, HUD compositing, and capture persistence. */
export function createDevCapture(
  renderer: Renderer,
  player: PlayerController,
  rig: CameraRig,
  daynight: DayNight,
  celestial: CelestialSky,
): DevCapture {
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
    // Re-place celestial objects for a camera moved while requestAnimationFrame is throttled.
    celestial.update(daynight.time, renderer.camera.position);
    const el = renderer.domElement;
    if (!el.width || !el.height) {
      renderer.resize(
        Math.max(window.innerWidth || 0, 960),
        Math.max(window.innerHeight || 0, 540),
      );
    }
    renderer.renderOnce();
    if (!renderer.domElement.width || !renderer.domElement.height) {
      throw new Error(
        'render canvas is 0×0 — resize the preview viewport (e.g. 1200×800) and retry',
      );
    }
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
    if (!res.ok) {
      throw new Error(`Voxel Realm: capture save failed (${res.status} ${res.statusText})`);
    }
    const { path } = (await res.json()) as { path: string };
    lastSavedPath = path;
    return path;
  };

  return { syncCamera, view, shot, save, lastPath: () => lastSavedPath };
}
