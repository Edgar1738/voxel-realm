// src/app/WorldMapUi.ts
//
// The M-key world map overlay: a pixel-per-block top-down canvas of the loaded world with
// landmark labels, the tour route, and a player arrow. Renders once per open (the world
// doesn't change enough while glancing at a map to justify per-frame redraws). All pixel
// math lives in worldMapRender.ts; this file owns the DOM and marker drawing only.
import {
  renderCaveMapPixels,
  renderMapPixels,
  type CaveSampler,
  type MapRGB,
  type SurfaceSampler,
} from './worldMapRender';
import { mapClickToWorld, worldToMapPixel, nearestWithin, type Waypoint } from './waypoint';

export interface WorldMapContext {
  center: { x: number; z: number };
  /** Camera yaw (radians) — rotates the player arrow only; the map itself stays north-up. */
  yaw: number;
  /** Map half-extent in blocks (typically viewDistance · chunk size). */
  radius: number;
  sample: SurfaceSampler;
  /** Optional depth sampler enables the Surface/Cave map toggle. */
  cave?: { y: number; sample: CaveSampler };
  /** Open directly in cave mode when the player is already well underground. */
  initialMode?: 'surface' | 'cave';
  palette: Map<number, MapRGB>;
  title: string;
  /** `found: false` renders an anonymous gray dot — the name stays hidden until discovered. */
  landmarks: ReadonlyArray<{ name: string; x: number; z: number; found?: boolean }>;
  tour: ReadonlyArray<{ name?: string; x: number; z: number }>;
  /** The current navigation waypoint, drawn as a cyan pin; clicking it again clears it. */
  waypoint?: Waypoint;
}

/** Map interaction events; the map owns click→placement, the host owns persistence + pointer lock. */
export interface WorldMapCallbacks {
  onSetWaypoint(x: number, z: number): void;
  onClearWaypoint(): void;
  /** The map was dismissed by a backdrop click, so the host can re-acquire pointer lock. */
  onClose(): void;
}

/** Click tolerance (CSS px) for snapping to a landmark or clearing the current waypoint. */
const CLICK_HIT_CSS = 12;
const WAYPOINT_COLOR = '#3fd8ff';

export interface WorldMapUi {
  /** Opens (rendering fresh) or closes; returns whether the map is now open. */
  toggle(ctx: WorldMapContext): boolean;
  close(): void;
  isOpen(): boolean;
  dispose(): void;
}

const GOLD = '#ffd34d';

export function createWorldMapUi(callbacks?: WorldMapCallbacks): WorldMapUi {
  const root = document.createElement('div');
  root.id = 'world-map';
  root.setAttribute('aria-hidden', 'true');
  const panel = document.createElement('div');
  panel.className = 'world-map-panel';
  const title = document.createElement('div');
  title.className = 'world-map-title';
  const controls = document.createElement('div');
  controls.className = 'world-map-controls';
  const modeButton = document.createElement('button');
  modeButton.type = 'button';
  modeButton.className = 'world-map-control';
  const depthDown = document.createElement('button');
  depthDown.type = 'button';
  depthDown.className = 'world-map-control';
  depthDown.textContent = 'Depth −';
  const depthUp = document.createElement('button');
  depthUp.type = 'button';
  depthUp.className = 'world-map-control';
  depthUp.textContent = 'Depth +';
  controls.append(modeButton, depthDown, depthUp);
  const canvas = document.createElement('canvas');
  canvas.className = 'world-map-canvas';
  const hint = document.createElement('div');
  hint.className = 'world-map-hint';
  hint.textContent = 'Click to set a waypoint · click it again to clear · M to close';
  panel.append(title, controls, canvas, hint);
  root.append(panel);
  document.body.append(root);

  let open = false;
  let currentCtx: WorldMapContext | undefined;
  let mode: 'surface' | 'cave' = 'surface';
  let caveY = 0;

  const draw = (ctx2d: CanvasRenderingContext2D, ctx: WorldMapContext): void => {
    const caveMode = mode === 'cave' && ctx.cave !== undefined;
    const img = caveMode
      ? renderCaveMapPixels(
          ctx.cave!.sample,
          ctx.palette,
          ctx.center.x,
          ctx.center.z,
          caveY,
          ctx.radius,
        )
      : renderMapPixels(ctx.sample, ctx.palette, ctx.center.x, ctx.center.z, ctx.radius);
    title.textContent = caveMode ? `${ctx.title} · Cave Y ${caveY}` : ctx.title;
    modeButton.textContent = caveMode ? 'Cave map' : 'Surface map';
    controls.hidden = ctx.cave === undefined;
    depthDown.disabled = !caveMode;
    depthUp.disabled = !caveMode;
    hint.textContent = caveMode
      ? 'Wheel or Depth ± changes the slice · click for waypoint · M closes'
      : 'Click to set a waypoint · Surface map toggles cave view · M closes';
    canvas.width = img.size;
    canvas.height = img.size;
    ctx2d.putImageData(new ImageData(img.data, img.size, img.size), 0, 0);

    const toPx = (wx: number, wz: number): [number, number] => [
      wx - ctx.center.x + ctx.radius + 0.5,
      wz - ctx.center.z + ctx.radius + 0.5,
    ];
    const labelScale = Math.max(1, img.size / 260); // keep text readable on big maps

    // Surface-only annotations would be misleading on a depth slice.
    if (!caveMode && ctx.tour.length >= 2) {
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
    for (const l of caveMode ? [] : ctx.landmarks) {
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

    // Navigation waypoint: a cyan ring + dot (drawn above landmarks, below the player arrow).
    if (ctx.waypoint) {
      const { px, pz } = worldToMapPixel(ctx.waypoint.x, ctx.waypoint.z, ctx.center, ctx.radius);
      ctx2d.strokeStyle = WAYPOINT_COLOR;
      ctx2d.fillStyle = WAYPOINT_COLOR;
      ctx2d.lineWidth = 1.5 * labelScale;
      ctx2d.beginPath();
      ctx2d.arc(px, pz, 3.2 * labelScale, 0, Math.PI * 2);
      ctx2d.stroke();
      ctx2d.beginPath();
      ctx2d.arc(px, pz, 1.2 * labelScale, 0, Math.PI * 2);
      ctx2d.fill();
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
    currentCtx = undefined;
    root.classList.remove('is-open');
    root.setAttribute('aria-hidden', 'true');
  };

  /** Update the drawn waypoint locally (so a click shows instantly) and redraw. */
  const redrawWaypoint = (wp: Waypoint | undefined): void => {
    if (!currentCtx) return;
    const next: WorldMapContext = { ...currentCtx };
    if (wp) next.waypoint = wp;
    else delete next.waypoint;
    currentCtx = next;
    const ctx2d = canvas.getContext('2d');
    if (ctx2d) draw(ctx2d, next);
  };

  const redraw = (): void => {
    if (!currentCtx) return;
    const ctx2d = canvas.getContext('2d');
    if (ctx2d) draw(ctx2d, currentCtx);
  };

  modeButton.addEventListener('click', () => {
    if (!currentCtx?.cave) return;
    mode = mode === 'surface' ? 'cave' : 'surface';
    redraw();
  });
  depthDown.addEventListener('click', () => {
    if (mode !== 'cave') return;
    caveY = Math.max(0, caveY - 4);
    redraw();
  });
  depthUp.addEventListener('click', () => {
    if (mode !== 'cave') return;
    caveY += 4;
    redraw();
  });
  canvas.addEventListener(
    'wheel',
    (e) => {
      if (!open || mode !== 'cave') return;
      e.preventDefault();
      caveY = Math.max(0, caveY + (e.deltaY > 0 ? -4 : 4));
      redraw();
    },
    { passive: false },
  );

  // Placing / snapping / clearing a waypoint from a map click. Landmarks (discovered only) win
  // over bare placement; a click on the existing waypoint clears it.
  canvas.addEventListener('click', (e) => {
    if (!open || !currentCtx || !callbacks) return;
    const rect = canvas.getBoundingClientRect();
    const hit = mapClickToWorld(
      e.clientX,
      e.clientY,
      rect,
      canvas.width,
      currentCtx.center,
      currentCtx.radius,
    );
    const hitRadius = CLICK_HIT_CSS * (canvas.width / rect.width);

    const discovered = currentCtx.landmarks.filter((l) => l.found !== false);
    const lmPixels = discovered.map((l) =>
      worldToMapPixel(l.x, l.z, currentCtx!.center, currentCtx!.radius),
    );
    const lm = nearestWithin(hit.px, hit.pz, lmPixels, hitRadius);
    if (lm >= 0) {
      const t = discovered[lm];
      redrawWaypoint({ x: t.x, z: t.z });
      callbacks.onSetWaypoint(t.x, t.z);
      return;
    }

    if (currentCtx.waypoint) {
      const wpPx = worldToMapPixel(
        currentCtx.waypoint.x,
        currentCtx.waypoint.z,
        currentCtx.center,
        currentCtx.radius,
      );
      if (nearestWithin(hit.px, hit.pz, [wpPx], hitRadius) === 0) {
        redrawWaypoint(undefined);
        callbacks.onClearWaypoint();
        return;
      }
    }

    redrawWaypoint({ x: hit.x, z: hit.z });
    callbacks.onSetWaypoint(hit.x, hit.z);
  });

  // A click on the dimmed backdrop (never the panel) dismisses the map.
  root.addEventListener('click', (e) => {
    if (e.target === root && open) {
      close();
      callbacks?.onClose();
    }
  });

  return {
    toggle(ctx: WorldMapContext): boolean {
      if (open) {
        close();
        return false;
      }
      const ctx2d = canvas.getContext('2d');
      if (!ctx2d) return false;
      currentCtx = ctx;
      caveY = Math.max(0, Math.floor(ctx.cave?.y ?? 0));
      mode = ctx.initialMode === 'cave' && ctx.cave ? 'cave' : 'surface';
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
