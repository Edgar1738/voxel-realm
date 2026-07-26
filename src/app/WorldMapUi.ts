// src/app/WorldMapUi.ts
//
// The M-key world map overlay: a pixel-per-block top-down canvas of the loaded world with
// landmark labels, the tour route, and a player arrow. Renders once per open (the world
// does not change enough while glancing at a map to justify per-frame redraws). All pixel
// math lives in worldMapRender.ts; this file owns the DOM and marker drawing only.
import { renderMapPixels, type MapRGB, type SurfaceSampler } from './worldMapRender';
import { mapClickToWorld, nearestWithin, worldToMapPixel, type Waypoint } from './waypoint';

export interface WorldMapContext {
  center: { x: number; z: number };
  /** Camera yaw (radians) - rotates the player arrow only; the map itself stays north-up. */
  yaw: number;
  /** Map half-extent in blocks (typically viewDistance * chunk size). */
  radius: number;
  sample: SurfaceSampler;
  palette: Map<number, MapRGB>;
  title: string;
  /** `found: false` renders an anonymous gray dot - the name stays hidden until discovered. */
  landmarks: ReadonlyArray<{ name: string; x: number; z: number; found?: boolean }>;
  tour: ReadonlyArray<{ name?: string; x: number; z: number }>;
  /** The current navigation waypoint, drawn as a cyan pin; clicking it again clears it. */
  waypoint?: Waypoint;
}

/** Map interaction events; the map owns click-to-placement, the host owns persistence + pointer lock. */
export interface WorldMapCallbacks {
  onSetWaypoint(x: number, z: number): void;
  onClearWaypoint(): void;
  /** The map was dismissed by user interaction, so the host can re-acquire pointer lock. */
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

type Destination = {
  label: string;
  waypoint: Waypoint;
};

export function createWorldMapUi(callbacks?: WorldMapCallbacks): WorldMapUi {
  const root = document.createElement('div');
  root.id = 'world-map';
  root.setAttribute('aria-hidden', 'true');

  const panel = document.createElement('div');
  panel.className = 'world-map-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-labelledby', 'world-map-title');
  panel.setAttribute('aria-describedby', 'world-map-hint world-map-destinations-summary');

  const header = document.createElement('div');
  header.className = 'world-map-header';

  const title = document.createElement('div');
  title.id = 'world-map-title';
  title.className = 'world-map-title';

  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.className = 'world-map-close';
  closeButton.textContent = 'Close map';
  closeButton.setAttribute('aria-label', 'Close world map');
  header.append(title, closeButton);

  const canvas = document.createElement('canvas');
  canvas.className = 'world-map-canvas';
  canvas.setAttribute('role', 'img');
  canvas.setAttribute(
    'aria-label',
    'World map overview. Use the destination buttons to choose a waypoint with the keyboard.',
  );

  const hint = document.createElement('div');
  hint.id = 'world-map-hint';
  hint.className = 'world-map-hint';
  hint.textContent =
    'Click the canvas to place a waypoint. Click the waypoint again to clear it. Press Escape to close.';

  const layout = document.createElement('div');
  layout.className = 'world-map-layout';

  const clearButton = document.createElement('button');
  clearButton.type = 'button';
  clearButton.className = 'world-map-clear';
  clearButton.textContent = 'Clear waypoint';
  clearButton.setAttribute('aria-label', 'Clear current waypoint');

  const destinationsSummary = document.createElement('div');
  destinationsSummary.id = 'world-map-destinations-summary';
  destinationsSummary.className = 'world-map-hint';

  const destinations = document.createElement('nav');
  destinations.className = 'world-map-destinations';
  destinations.setAttribute('aria-label', 'Map destinations');

  layout.append(clearButton, destinationsSummary, destinations);
  panel.append(header, canvas, hint, layout);
  root.append(panel);
  document.body.append(root);

  let open = false;
  let currentCtx: WorldMapContext | undefined;
  let previousFocus: HTMLElement | null = null;
  const destinationButtons: Array<{ button: HTMLButtonElement; waypoint: Waypoint }> = [];

  const sameWaypoint = (a: Waypoint | undefined, b: Waypoint): boolean =>
    !!a && a.x === b.x && a.z === b.z;

  const focusableChildren = (): HTMLElement[] => {
    const focusables: HTMLElement[] = [];
    const visit = (node: Element): void => {
      if (!(node instanceof HTMLElement)) return;
      const isButton = node.tagName === 'BUTTON';
      const tabIndex = node.getAttribute('tabindex');
      if (
        (isButton || (tabIndex !== null && tabIndex !== '-1')) &&
        !node.hasAttribute('disabled')
      ) {
        focusables.push(node);
      }
      for (const child of Array.from(node.children)) visit(child);
    };
    visit(panel);
    return focusables;
  };

  const syncWaypointControls = (wp: Waypoint | undefined): void => {
    const hasWaypoint = !!wp;
    clearButton.disabled = !hasWaypoint;
    clearButton.setAttribute('aria-disabled', String(!hasWaypoint));
    clearButton.classList.toggle('is-disabled', !hasWaypoint);
    for (const { button, waypoint } of destinationButtons) {
      const active = sameWaypoint(wp, waypoint);
      button.setAttribute('aria-pressed', String(active));
      button.classList.toggle('is-active', active);
    }
  };

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
    // forward (-sin yaw, -cos yaw) maps to a screen rotation of -yaw).
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

  /** Update the drawn waypoint locally (so a click shows instantly) and redraw. */
  const redrawWaypoint = (wp: Waypoint | undefined): void => {
    if (!currentCtx) return;
    const next: WorldMapContext = { ...currentCtx };
    if (wp) next.waypoint = wp;
    else delete next.waypoint;
    currentCtx = next;
    const ctx2d = canvas.getContext('2d');
    if (ctx2d) draw(ctx2d, next);
    syncWaypointControls(next.waypoint);
  };

  const renderDestinations = (ctx: WorldMapContext): void => {
    destinationButtons.length = 0;
    destinations.replaceChildren();

    const makeButton = (destination: Destination): HTMLButtonElement => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'world-map-destination';
      button.textContent = destination.label;
      button.title = `Set waypoint to ${destination.label}`;
      button.addEventListener('click', () => {
        if (!callbacks || !currentCtx) return;
        redrawWaypoint(destination.waypoint);
        callbacks.onSetWaypoint(destination.waypoint.x, destination.waypoint.z);
      });
      destinationButtons.push({ button, waypoint: destination.waypoint });
      return button;
    };

    const appendGroup = (headingText: string, items: ReadonlyArray<Destination>): void => {
      if (items.length === 0) return;
      const section = document.createElement('section');

      const heading = document.createElement('div');
      heading.className = 'world-map-destinations-title';
      heading.textContent = headingText;

      const list = document.createElement('div');
      list.className = 'world-map-destination-list';

      for (const item of items) list.append(makeButton(item));
      section.append(heading, list);
      destinations.append(section);
    };

    const landmarks: Destination[] = ctx.landmarks
      .filter((l) => l.found !== false)
      .map((l) => ({ label: l.name, waypoint: { x: l.x, z: l.z } }));
    const tourStops: Destination[] = ctx.tour.map((stop, i) => ({
      label: stop.name?.trim() || `Tour stop ${i + 1}`,
      waypoint: { x: stop.x, z: stop.z },
    }));
    const hiddenLandmarks = ctx.landmarks.length - landmarks.length;

    destinationsSummary.textContent =
      hiddenLandmarks > 0
        ? `${hiddenLandmarks} undiscovered landmark${hiddenLandmarks === 1 ? '' : 's'} ${hiddenLandmarks === 1 ? 'remains' : 'remain'} hidden until found.`
        : 'Choose a landmark or tour stop to set a waypoint from the keyboard.';

    appendGroup('Landmarks', landmarks);
    appendGroup('Tour route', tourStops);

    if (!destinations.children.length) {
      const empty = document.createElement('div');
      empty.className = 'world-map-hint';
      empty.textContent = 'No landmarks or tour stops are available on this map.';
      destinations.append(empty);
    }
  };

  const dismiss = (notifyHost: boolean): void => {
    if (!open) return;
    open = false;
    currentCtx = undefined;
    root.classList.remove('is-open');
    root.setAttribute('aria-hidden', 'true');
    window.removeEventListener('keydown', onWindowKey, true);
    const restoreFocus = previousFocus;
    previousFocus = null;
    restoreFocus?.focus();
    if (notifyHost) callbacks?.onClose();
  };

  const onWindowKey = (e: KeyboardEvent): void => {
    if (!open) return;
    e.stopPropagation();
    if (e.code === 'Escape') {
      e.preventDefault();
      dismiss(true);
      return;
    }
    if (e.key !== 'Tab') return;
    const focusables = focusableChildren();
    if (focusables.length === 0) return;
    const current = document.activeElement as HTMLElement | null;
    const index = current ? focusables.indexOf(current) : -1;
    const nextIndex = e.shiftKey
      ? index <= 0
        ? focusables.length - 1
        : index - 1
      : index < 0 || index === focusables.length - 1
        ? 0
        : index + 1;
    e.preventDefault();
    focusables[nextIndex]?.focus();
  };

  const close = (): void => dismiss(false);

  // Placing / snapping / clearing a waypoint from a map click. Landmarks (discovered only) win
  // over bare placement; a click on the existing waypoint clears it.
  canvas.addEventListener('click', (e) => {
    if (!open || !currentCtx || !callbacks) return;
    const ctx = currentCtx;
    const rect = canvas.getBoundingClientRect();
    const hit = mapClickToWorld(e.clientX, e.clientY, rect, canvas.width, ctx.center, ctx.radius);
    const hitRadius = CLICK_HIT_CSS * (canvas.width / rect.width);

    const discovered = ctx.landmarks.filter((l) => l.found !== false);
    const lmPixels = discovered.map((l) => worldToMapPixel(l.x, l.z, ctx.center, ctx.radius));
    const lm = nearestWithin(hit.px, hit.pz, lmPixels, hitRadius);
    if (lm >= 0) {
      const target = discovered[lm];
      redrawWaypoint({ x: target.x, z: target.z });
      callbacks.onSetWaypoint(target.x, target.z);
      return;
    }

    if (ctx.waypoint) {
      const wpPx = worldToMapPixel(ctx.waypoint.x, ctx.waypoint.z, ctx.center, ctx.radius);
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
    if (e.target === root && open) dismiss(true);
  });
  closeButton.addEventListener('click', () => dismiss(true));
  clearButton.addEventListener('click', () => {
    if (!open || !currentCtx?.waypoint || !callbacks) return;
    redrawWaypoint(undefined);
    callbacks.onClearWaypoint();
  });

  return {
    toggle(ctx: WorldMapContext): boolean {
      if (open) {
        close();
        return false;
      }
      const ctx2d = canvas.getContext('2d');
      if (!ctx2d) return false;
      previousFocus = document.activeElement as HTMLElement | null;
      currentCtx = ctx;
      title.textContent = ctx.title;
      draw(ctx2d, ctx);
      renderDestinations(ctx);
      syncWaypointControls(ctx.waypoint);
      open = true;
      root.classList.add('is-open');
      root.setAttribute('aria-hidden', 'false');
      window.addEventListener('keydown', onWindowKey, true);
      closeButton.focus();
      return true;
    },
    close,
    isOpen: () => open,
    dispose(): void {
      close();
      root.remove();
    },
  };
}
