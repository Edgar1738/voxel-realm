// src/app/WorldMapUi.ts
//
// The M-key world map overlay: a pixel-per-block top-down canvas of the loaded world with
// landmark labels, the tour route, and a player arrow. Renders once per open (the world
// doesn't change enough while glancing at a map to justify per-frame redraws). All pixel
// math lives in worldMapRender.ts; this file owns the DOM and marker drawing only.
import { renderMapPixels, type MapRGB, type SurfaceSampler } from './worldMapRender';

export interface WorldMapContext {
  center: { x: number; z: number };
  /** Camera yaw (radians) — rotates the player arrow only; the map itself stays north-up. */
  yaw: number;
  /** Map half-extent in blocks (typically viewDistance · chunk size). */
  radius: number;
  sample: SurfaceSampler;
  palette: Map<number, MapRGB>;
  title: string;
  /** `found: false` renders an anonymous gray dot — the name stays hidden until discovered. */
  landmarks: ReadonlyArray<{ name: string; x: number; z: number; found?: boolean }>;
  tour: ReadonlyArray<{ name?: string; x: number; z: number }>;
}

export interface WorldMapUi {
  /** Opens (rendering fresh) or closes; returns whether the map is now open. */
  toggle(ctx: WorldMapContext): boolean;
  close(): void;
  isOpen(): boolean;
  dispose(): void;
}

const GOLD = '#ffd34d';

export function createWorldMapUi(): WorldMapUi {
  const root = document.createElement('div');
  root.id = 'world-map';
  root.setAttribute('aria-hidden', 'true');
  const panel = document.createElement('div');
  panel.className = 'world-map-panel';
  const title = document.createElement('div');
  title.className = 'world-map-title';
  const canvas = document.createElement('canvas');
  canvas.className = 'world-map-canvas';
  const hint = document.createElement('div');
  hint.className = 'world-map-hint';
  hint.textContent = 'M to close · gold = tour route · dots = landmarks';
  panel.append(title, canvas, hint);
  root.append(panel);
  document.body.append(root);

  let open = false;

  const draw = (ctx2d: CanvasRenderingContext2D, ctx: WorldMapContext): void => {
    const img = renderMapPixels(ctx.sample, ctx.palette, ctx.center.x, ctx.center.z, ctx.radius);
    canvas.width = img.size;
    canvas.height = img.size;
    ctx2d.putImageData(new ImageData(img.data, img.size, img.size), 0, 0);

    const toPx = (wx: number, wz: number): [number, number] => [
      wx - ctx.center.x + ctx.radius + 0.5,
      wz - ctx.center.z + ctx.radius + 0.5,
    ];
    const labelScale = Math.max(1, img.size / 260); // keep text readable on big maps

    // Tour route: a gold polyline through the waypoints, dots at each stop.
    if (ctx.tour.length >= 2) {
      ctx2d.strokeStyle = GOLD;
      ctx2d.globalAlpha = 0.8;
      ctx2d.lineWidth = labelScale;
      ctx2d.beginPath();
      ctx.tour.forEach((p, i) => {
        const [px, pz] = toPx(p.x, p.z);
        if (i === 0) ctx2d.moveTo(px, pz);
        else ctx2d.lineTo(px, pz);
      });
      ctx2d.stroke();
      ctx2d.globalAlpha = 1;
      ctx2d.fillStyle = GOLD;
      for (const p of ctx.tour) {
        const [px, pz] = toPx(p.x, p.z);
        ctx2d.beginPath();
        ctx2d.arc(px, pz, 1.6 * labelScale, 0, Math.PI * 2);
        ctx2d.fill();
      }
    }

    // Landmarks: discovered = white dot + label; undiscovered = anonymous gray dot.
    ctx2d.font = `${Math.round(9 * labelScale)}px system-ui, sans-serif`;
    ctx2d.textBaseline = 'bottom';
    for (const l of ctx.landmarks) {
      const [px, pz] = toPx(l.x, l.z);
      if (px < 0 || pz < 0 || px > img.size || pz > img.size) continue;
      const found = l.found !== false;
      ctx2d.fillStyle = found ? '#ffffff' : 'rgba(190,195,205,0.65)';
      ctx2d.beginPath();
      ctx2d.arc(px, pz, (found ? 1.8 : 1.3) * labelScale, 0, Math.PI * 2);
      ctx2d.fill();
      if (!found) continue;
      ctx2d.strokeStyle = 'rgba(0,0,0,0.85)';
      ctx2d.lineWidth = 3;
      ctx2d.strokeText(l.name, px + 3 * labelScale, pz - 2 * labelScale);
      ctx2d.fillText(l.name, px + 3 * labelScale, pz - 2 * labelScale);
    }

    // Player arrow at the center, rotated to the look direction (map stays north-up;
    // forward (−sin yaw, −cos yaw) maps to a screen rotation of −yaw).
    const c = ctx.radius + 0.5;
    const s = 4 * labelScale;
    ctx2d.save();
    ctx2d.translate(c, c);
    ctx2d.rotate(-ctx.yaw);
    ctx2d.fillStyle = '#ff5c5c';
    ctx2d.strokeStyle = 'rgba(0,0,0,0.85)';
    ctx2d.lineWidth = 1;
    ctx2d.beginPath();
    ctx2d.moveTo(0, -s);
    ctx2d.lineTo(s * 0.7, s);
    ctx2d.lineTo(0, s * 0.55);
    ctx2d.lineTo(-s * 0.7, s);
    ctx2d.closePath();
    ctx2d.fill();
    ctx2d.stroke();
    ctx2d.restore();
  };

  const close = (): void => {
    if (!open) return;
    open = false;
    root.classList.remove('is-open');
    root.setAttribute('aria-hidden', 'true');
  };

  return {
    toggle(ctx: WorldMapContext): boolean {
      if (open) {
        close();
        return false;
      }
      const ctx2d = canvas.getContext('2d');
      if (!ctx2d) return false;
      title.textContent = ctx.title;
      draw(ctx2d, ctx);
      open = true;
      root.classList.add('is-open');
      root.setAttribute('aria-hidden', 'false');
      return true;
    },
    close,
    isOpen: () => open,
    dispose(): void {
      root.remove();
    },
  };
}
