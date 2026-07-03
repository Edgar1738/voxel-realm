import { CREATIVE_BLOCKS, type CreativeInventory } from './CreativeInventory';
import type { BlockRegistry } from '../blocks/BlockRegistry';
import {
  GRASS,
  DIRT,
  STONE,
  SAND,
  WOOD,
  LEAVES,
  GLASS,
  SNOW,
  CACTUS,
  PLANKS,
  COBBLESTONE,
  BRICK,
} from '../blocks/blocks';
import type { BlockId } from '../core/types';
import type { Prefab } from '../core/Prefab';
import { renderBlueprintThumbnail, THUMBNAIL_SIZE } from './blueprintThumbnail';
import { renderBlockIcon } from './blockIcon';
import { TUNNEL_SIZES, TUNNEL_LENGTHS, TUNNEL_PATHS, type TunnelConfig } from '../edit/Brushes';

/**
 * Display-only swatch colors for hotbar/picker slots (an app/UI concern — the pure block
 * registry stays color-free). Glass is intentionally absent: it renders via {@link isGlass}.
 */
const SWATCH_COLORS: Partial<Record<BlockId, string>> = {
  [GRASS]: '#56983c',
  [DIRT]: '#86603e',
  [STONE]: '#808084',
  [SAND]: '#cebe8c',
  [WOOD]: '#694e2e',
  [LEAVES]: '#36782c',
  [SNOW]: '#ecf0f5',
  [CACTUS]: '#3c6e3c',
  [PLANKS]: '#a58250',
  [COBBLESTONE]: '#6e6e72',
  [BRICK]: '#96463a',
};

const FALLBACK_SWATCH = '#5a5a60';

function isGlass(id: BlockId): boolean {
  return id === GLASS;
}

/** Flat CSS color for a block id, suitable for canvas fills (no gradients/patterns). */
export function swatchFlatColor(id: BlockId): string {
  if (isGlass(id)) return 'rgba(205,232,240,0.7)';
  return SWATCH_COLORS[id] ?? FALLBACK_SWATCH;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Per-tool icon shapes, declared as element specs so we can build trusted SVG nodes. */
const TOOL_ICON_SHAPES: Record<string, ReadonlyArray<[string, Record<string, string>]>> = {
  single: [['rect', { x: '4', y: '4', width: '6', height: '6', rx: '1', fill: 'currentColor' }]],
  tunnel: [['rect', { x: '1.5', y: '5', width: '11', height: '4', rx: '2', fill: 'currentColor' }]],
  sphere: [
    [
      'circle',
      { cx: '7', cy: '7', r: '4.5', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.4' },
    ],
  ],
  'box-clear': [
    [
      'rect',
      {
        x: '2.5',
        y: '2.5',
        width: '9',
        height: '9',
        rx: '1',
        fill: 'none',
        stroke: 'currentColor',
        'stroke-width': '1.4',
        'stroke-dasharray': '2 1.6',
      },
    ],
  ],
  fill: [['path', { d: 'M7 2 L12 11 L2 11 Z', fill: 'currentColor' }]],
  replace: [
    [
      'rect',
      {
        x: '2.5',
        y: '2.5',
        width: '6',
        height: '6',
        rx: '1',
        fill: 'none',
        stroke: 'currentColor',
        'stroke-width': '1.3',
      },
    ],
    [
      'rect',
      {
        x: '5.5',
        y: '5.5',
        width: '6',
        height: '6',
        rx: '1',
        fill: 'currentColor',
        'fill-opacity': '0.85',
      },
    ],
  ],
};

/** Speaker icon shapes: body + two arcs when audible, body + strike-through when muted. */
const SPEAKER_SHAPES: Record<'on' | 'off', ReadonlyArray<[string, Record<string, string>]>> = {
  on: [
    ['path', { d: 'M2 5.5 H4.5 L7.5 3 V11 L4.5 8.5 H2 Z', fill: 'currentColor' }],
    [
      'path',
      {
        d: 'M9.5 4.8 A2.6 2.6 0 0 1 9.5 9.2',
        fill: 'none',
        stroke: 'currentColor',
        'stroke-width': '1.3',
        'stroke-linecap': 'round',
      },
    ],
    [
      'path',
      {
        d: 'M11 3.2 A4.6 4.6 0 0 1 11 10.8',
        fill: 'none',
        stroke: 'currentColor',
        'stroke-width': '1.3',
        'stroke-linecap': 'round',
      },
    ],
  ],
  off: [
    ['path', { d: 'M2 5.5 H4.5 L7.5 3 V11 L4.5 8.5 H2 Z', fill: 'currentColor' }],
    [
      'line',
      {
        x1: '9',
        y1: '4.5',
        x2: '12.5',
        y2: '9.5',
        stroke: 'currentColor',
        'stroke-width': '1.4',
        'stroke-linecap': 'round',
      },
    ],
    [
      'line',
      {
        x1: '12.5',
        y1: '4.5',
        x2: '9',
        y2: '9.5',
        stroke: 'currentColor',
        'stroke-width': '1.4',
        'stroke-linecap': 'round',
      },
    ],
  ],
};

/** Builds a 14px inline-SVG icon from typed shape specs (no innerHTML — trusted nodes). */
function buildIcon(shapes: ReadonlyArray<[string, Record<string, string>]>): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('width', '14');
  svg.setAttribute('height', '14');
  svg.setAttribute('viewBox', '0 0 14 14');
  svg.setAttribute('aria-hidden', 'true');
  for (const [tag, attrs] of shapes) {
    const node = document.createElementNS(SVG_NS, tag);
    for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, value);
    svg.append(node);
  }
  return svg;
}

/** Builds a 14px inline-SVG icon node for a tool (no innerHTML — trusted, typed shapes). */
function buildToolIcon(tool: string): SVGSVGElement {
  return buildIcon(TOOL_ICON_SHAPES[tool] ?? TOOL_ICON_SHAPES.single);
}

/** One button in a confirm dialog; `danger` renders in the destructive style. */
export interface DialogAction {
  id: string;
  label: string;
  kind?: 'danger';
}

/** Outcome of the world dialog: switch to (or create) a world, or duplicate the current one. */
export interface WorldChoice {
  kind: 'switch' | 'duplicate';
  name: string;
}

/** Outcome of the blueprint dialog: load one into paste mode, save the clipboard, or delete. */
export type BlueprintChoice =
  | { kind: 'load'; name: string; curated: boolean }
  | { kind: 'save'; name: string }
  | { kind: 'delete'; name: string };

/** One catalog tab. `Saved` lists the player's own blueprints; the rest are curated/read-only. */
export type BlueprintCategory =
  | 'Saved'
  | 'Village'
  | 'Adventure'
  | 'Utility'
  | 'Nature'
  | 'Coastal'
  | 'Dungeon';

/** A single catalog entry: enough to render a thumbnail + label and to resolve a load/delete. */
export interface BlueprintEntry {
  name: string;
  curated: boolean;
  /** Saved user blueprints are always 'Saved'; curated entries carry their fixed category. */
  category: BlueprintCategory;
  /** Resolves the prefab geometry lazily (curated builders are cheap; saved loads are async). */
  load: () => Prefab | Promise<Prefab>;
}

/** Player-facing world info shown by the intro/info dialog (fallbacks applied by the caller). */
export interface WorldInfo {
  title: string;
  description?: string;
  landmarks: string[];
  /** Number of tour waypoints; the Start Tour action shows only when this is >= 2. */
  tourCount: number;
}

/** One row of the Menu's grouped hotkey reference. */
export interface HotkeyGroup {
  heading: string;
  lines: string[];
}

/** The Menu's fixed hotkey reference, grouped per the controls-audit spec. */
export const MENU_HOTKEY_GROUPS: readonly HotkeyGroup[] = [
  {
    heading: 'Roam',
    lines: ['WASD move', 'Mouse look', 'Space up / jump', 'Shift down', 'F fly', 'L headlamp'],
  },
  { heading: 'Modes', lines: ['B build / play', 'Esc close / cancel'] },
  { heading: 'Blocks', lines: ['1-9 hotbar slot', 'Mouse wheel cycle', 'I inventory'] },
  { heading: 'Build tools', lines: ['X fill', 'G clear', 'R replace', 'C copy'] },
  {
    heading: 'Blueprint paste',
    lines: ['Click to paste', '[ ] rotate', 'M mirror', '+/- array count'],
  },
  { heading: 'Reach', lines: ['Shift + wheel adjusts reach'] },
];

/** What the tour HUD displays for the active waypoint. */
export interface TourHudStatus {
  name: string;
  distance: number;
  index: number;
  total: number;
  done: boolean;
}

/** DOM handles for the creative HUD; pure construction, no game logic. */
export interface CreativeUi {
  hotbar: HTMLDivElement;
  /** The grid container holding the block tiles; Game delegates tile clicks off this node. */
  picker: HTMLDivElement;
  reset: HTMLButtonElement;
  /** Dev world menu: a button labeled with the current world (click handled by Game). */
  worldButton: HTMLButtonElement;
  /** Blueprint library button (click handled by Game). */
  blueprintButton: HTMLButtonElement;
  /** Menu trigger — world info + grouped hotkey reference (click handled by Game). */
  infoButton: HTMLButtonElement;
  /** Play↔build switch (click handled by Game; Game hides it for uncurated worlds). */
  modeButton: HTMLButtonElement;
  /** Tour HUD skip controls (click handled by Game). */
  tourPrev: HTMLButtonElement;
  tourNext: HTMLButtonElement;
  tourEnd: HTMLButtonElement;
  /** Sound controls: mute toggle + volume slider (wired by Game to the AudioEngine). */
  muteButton: HTMLButtonElement;
  volumeSlider: HTMLInputElement;
  /** Syncs the sound controls to the engine state (icon, slider position, dimming). */
  setSoundUi(volume: number, muted: boolean): void;
  /** Highlights the button for `tool` and dims the rest. */
  setActiveTool(tool: string): void;
  /** Updates the dock's reach readout (the +/- buttons report steps via onReachStep). */
  setReachValue(reach: number): void;
  /** Syncs the dock's hold-to-repeat toggle button to the current setting. */
  setHoldRepeatUi(enabled: boolean): void;
  /** Shows `text` as a transient toast that fades out on its own. */
  setStatus(text: string): void;
  /** Shows a persistent banner (e.g. a storage warning), or hides it when passed `null`. */
  setNotice(text: string | null): void;
  renderHotbar(): void;
  /** Opens or closes the inventory modal (fade/scale; inert when closed). */
  setInventoryOpen(open: boolean): void;
  /** Whether the inventory modal is currently open. */
  isInventoryOpen(): boolean;
  /** Small in-app confirm dialog; resolves the clicked action id ('cancel' on Escape/backdrop). */
  showDialog(opts: { title: string; message: string; actions: DialogAction[] }): Promise<string>;
  /** World switch/create/duplicate dialog; resolves undefined on cancel. */
  showWorldDialog(current: string, worlds: string[]): Promise<WorldChoice | undefined>;
  /**
   * Categorized blueprint catalog (Saved/Village/Adventure/Utility/Nature tabs) with real thumbnails.
   * Resolves undefined on cancel.
   */
  showBlueprintDialog(opts: {
    entries: readonly BlueprintEntry[];
    canSave: boolean;
  }): Promise<BlueprintChoice | undefined>;
  /**
   * Play mode hides the creative chrome (tools, hotbar, world/blueprint/reset); build mode
   * restores it. Purely visual — input gating lives in input.ts, not here.
   */
  setExperienceMode(mode: 'play' | 'build'): void;
  /** Shows/updates the tour HUD, or hides it when passed undefined. */
  setTourHud(status: TourHudStatus | undefined): void;
  /**
   * Menu dialog: world title/description/landmarks + "Current world" + the grouped hotkey
   * reference. Resolves the chosen action or undefined on dismiss.
   */
  showWorldInfoDialog(
    info: WorldInfo,
    worldName: string,
  ): Promise<'explore' | 'tour' | 'build' | undefined>;
}

const STATUS_VISIBLE_MS = 1600;

function button(text: string): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = text;
  return b;
}

/**
 * Builds the creative hotbar, inventory modal, tool dock, and status toast, appending them to the
 * document body. Stops UI pointer events from reaching the document so clicking the HUD never
 * triggers pointer-lock or an edit.
 *
 * @param onSelectTool invoked with the tool id when a tool button is clicked.
 * @param tunnel initial tunnel settings + change callback; the strip shows only while
 *   the Tunnel tool is active in build mode.
 * @param onReachStep invoked with +1/-1 when the dock's reach +/- buttons are clicked;
 *   the caller applies the step and reports the new value via {@link CreativeUi.setReachValue}.
 */
export function createCreativeUi(
  registry: BlockRegistry,
  inventory: CreativeInventory,
  tools: readonly string[],
  toolLabel: (tool: string) => string,
  onSelectTool: (tool: string) => void,
  tunnel?: { initial: TunnelConfig; onChange: (config: TunnelConfig) => void },
  onReachStep?: (direction: 1 | -1) => void,
  onHoldRepeatToggle?: () => void,
): CreativeUi {
  const root = document.createElement('div');
  root.id = 'creative-ui';
  root.addEventListener('mousedown', (e) => e.stopPropagation());
  root.addEventListener('click', (e) => e.stopPropagation());

  // Tool dock: a row of tool buttons plus a visually separated Reset button.
  const dock = document.createElement('div');
  dock.className = 'creative-dock';

  const toolRow = document.createElement('div');
  toolRow.className = 'creative-tools';
  toolRow.setAttribute('role', 'group');
  toolRow.setAttribute('aria-label', 'Edit tool');
  // Two-tier rail: Single + Tunnel are the primary dig controls; the rest are secondary.
  const PRIMARY_TOOLS = new Set(['single', 'tunnel']);
  const toolButtons = new Map<string, HTMLButtonElement>();
  let dividerAdded = false;
  for (const t of tools) {
    const primary = PRIMARY_TOOLS.has(t);
    if (!primary && !dividerAdded) {
      const divider = document.createElement('span');
      divider.className = 'tool-divider';
      divider.setAttribute('aria-hidden', 'true');
      toolRow.append(divider);
      dividerAdded = true;
    }
    const b = document.createElement('button');
    b.type = 'button';
    b.className = primary ? 'tool-btn primary' : 'tool-btn secondary';
    b.dataset.tool = t;
    const label = toolLabel(t);
    const text = document.createElement('span');
    text.textContent = label;
    b.append(buildToolIcon(t), text);
    b.title = label;
    b.addEventListener('click', () => onSelectTool(t));
    toolButtons.set(t, b);
    toolRow.append(b);
  }

  // Tunnel settings strip: Size / Length / Path segmented controls, on its own dock row.
  let tunnelConfig: TunnelConfig = {
    ...(tunnel?.initial ?? { size: 3, length: 8, path: 'straight' }),
  };
  const tunnelSettings = document.createElement('div');
  tunnelSettings.className = 'tunnel-settings';
  const tunnelPanel = document.createElement('div');
  tunnelPanel.className = 'tunnel-settings-panel';
  tunnelPanel.setAttribute('role', 'group');
  tunnelPanel.setAttribute('aria-label', 'Tunnel settings');
  tunnelSettings.append(tunnelPanel);

  function tunnelGroup<K extends keyof TunnelConfig>(
    label: string,
    key: K,
    values: readonly TunnelConfig[K][],
    format: (v: TunnelConfig[K]) => string,
  ): HTMLDivElement {
    const group = document.createElement('div');
    group.className = 'tunnel-group';
    const caption = document.createElement('span');
    caption.className = 'tunnel-group-label';
    caption.textContent = label;
    group.append(caption);
    const buttons: HTMLButtonElement[] = [];
    const refresh = (): void => {
      buttons.forEach((b, i) => {
        const on = tunnelConfig[key] === values[i];
        b.classList.toggle('active', on);
        b.setAttribute('aria-pressed', String(on));
      });
    };
    for (const v of values) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'tunnel-opt';
      b.textContent = format(v);
      b.addEventListener('click', () => {
        tunnelConfig = { ...tunnelConfig, [key]: v };
        refresh();
        tunnel?.onChange({ ...tunnelConfig });
      });
      buttons.push(b);
      group.append(b);
    }
    refresh();
    return group;
  }

  tunnelPanel.append(
    tunnelGroup('Size', 'size', TUNNEL_SIZES, String),
    tunnelGroup('Length', 'length', TUNNEL_LENGTHS, String),
    tunnelGroup('Path', 'path', TUNNEL_PATHS, (v) => v[0].toUpperCase() + v.slice(1)),
  );

  let activeToolId = '';
  let playModeUi = false;
  const refreshTunnelStrip = (): void => {
    tunnelSettings.style.display = activeToolId === 'tunnel' && !playModeUi ? '' : 'none';
  };
  refreshTunnelStrip();

  const reset = button('Reset world');
  reset.className = 'reset-btn';

  const worldButton = button('World');
  worldButton.className = 'world-btn';

  const blueprintButton = button('Blueprints');
  blueprintButton.className = 'world-btn';

  const infoButton = button('Menu');
  infoButton.className = 'world-btn';
  infoButton.title = 'Menu — world info and controls';

  const modeButton = button('Play mode');
  modeButton.className = 'world-btn';

  // Reach control: − / value / + mirroring Shift+wheel, for players who forget the hotkey.
  const reachGroup = document.createElement('div');
  reachGroup.className = 'reach-group';
  reachGroup.setAttribute('role', 'group');
  reachGroup.setAttribute('aria-label', 'Build reach');
  const reachMinus = button('−');
  reachMinus.className = 'reach-btn';
  reachMinus.title = 'Shorter build reach (Shift+wheel down)';
  const reachValue = document.createElement('span');
  reachValue.className = 'reach-value';
  const reachPlus = button('+');
  reachPlus.className = 'reach-btn';
  reachPlus.title = 'Longer build reach (Shift+wheel up)';
  reachMinus.addEventListener('click', () => onReachStep?.(-1));
  reachPlus.addEventListener('click', () => onReachStep?.(1));
  reachGroup.append(reachMinus, reachValue, reachPlus);

  const setReachValue = (reach: number): void => {
    reachValue.textContent = `Reach ${reach}`;
  };
  setReachValue(0); // placeholder; Game reports the real value right after boot

  // Hold-to-repeat toggle: when off, holding a mouse button only ever edits once.
  const holdButton = button('Hold');
  holdButton.className = 'hold-btn';
  holdButton.title = 'Hold-to-repeat: keep digging/placing while a mouse button is held';
  holdButton.addEventListener('click', () => onHoldRepeatToggle?.());
  const setHoldRepeatUi = (enabled: boolean): void => {
    holdButton.textContent = enabled ? 'Hold: On' : 'Hold: Off';
    holdButton.classList.toggle('active', enabled);
    holdButton.setAttribute('aria-pressed', String(enabled));
  };
  setHoldRepeatUi(true);

  // Sound controls: mute toggle + volume slider. State/behavior is wired by Game.
  const soundGroup = document.createElement('div');
  soundGroup.className = 'sound-group';
  const muteButton = document.createElement('button');
  muteButton.type = 'button';
  muteButton.className = 'sound-btn';
  const volumeSlider = document.createElement('input');
  volumeSlider.type = 'range';
  volumeSlider.className = 'sound-slider';
  volumeSlider.min = '0';
  volumeSlider.max = '100';
  volumeSlider.step = '1';
  volumeSlider.setAttribute('aria-label', 'Sound volume');
  soundGroup.append(muteButton, volumeSlider);

  const setSoundUi = (volume: number, muted: boolean): void => {
    muteButton.replaceChildren(buildIcon(SPEAKER_SHAPES[muted ? 'off' : 'on']));
    const label = muted ? 'Unmute sound' : 'Mute sound';
    muteButton.title = label;
    muteButton.setAttribute('aria-label', label);
    muteButton.setAttribute('aria-pressed', String(muted));
    volumeSlider.value = String(Math.round(volume * 100));
    volumeSlider.disabled = muted;
    soundGroup.classList.toggle('is-muted', muted);
  };

  // tunnelSettings goes last with flex-basis 100% so it wraps onto its own dock row.
  dock.append(
    toolRow,
    reachGroup,
    holdButton,
    soundGroup,
    infoButton,
    modeButton,
    blueprintButton,
    worldButton,
    reset,
    tunnelSettings,
  );

  // Inventory modal: a dimming scrim (absorbs backdrop clicks) over a centered "Blocks" panel.
  const scrim = document.createElement('div');
  scrim.className = 'inventory-scrim';
  scrim.setAttribute('aria-hidden', 'true');

  const panel = document.createElement('div');
  panel.className = 'inventory-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-label', 'Blocks');

  const title = document.createElement('div');
  title.className = 'inventory-title';
  title.textContent = 'Blocks';

  const picker = document.createElement('div');
  picker.className = 'inventory-grid';
  for (const id of CREATIVE_BLOCKS) {
    const tile = document.createElement('button');
    tile.type = 'button';
    tile.className = 'inventory-tile';
    tile.dataset.block = String(id);
    const name = registry.get(id).name;
    tile.title = name;
    tile.setAttribute('aria-label', name);

    const swatch = document.createElement('canvas');
    swatch.className = 'inventory-swatch';
    swatch.setAttribute('aria-hidden', 'true');
    renderBlockIcon(swatch, id, registry.shape(id), swatchFlatColor(id));

    const caption = document.createElement('span');
    caption.className = 'inventory-name';
    caption.textContent = name;

    tile.append(swatch, caption);
    picker.append(tile);
  }

  panel.append(title, picker);
  scrim.append(panel);

  const hotbar = document.createElement('div');
  hotbar.className = 'creative-hotbar';

  const status = document.createElement('div');
  status.className = 'creative-status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');

  // Persistent top-center banner for sticky warnings (e.g. storage unavailable). Distinct from the
  // transient status toast so a data-loss warning can't fade away before the player notices it.
  const notice = document.createElement('div');
  notice.className = 'creative-notice';
  notice.setAttribute('role', 'alert');
  notice.style.cssText =
    'position:fixed;top:12px;left:50%;transform:translateX(-50%);max-width:72vw;' +
    'padding:8px 14px;border-radius:10px;background:rgba(74,34,12,0.92);' +
    'border:1px solid rgba(255,180,90,0.55);color:#ffe6c2;font-weight:500;text-align:center;' +
    'box-shadow:0 4px 14px rgba(0,0,0,0.45);z-index:6;display:none;';

  // Dialog scrim: shared host for the confirm and world dialogs (one dialog at a time).
  const dialogScrim = document.createElement('div');
  dialogScrim.className = 'dialog-scrim';
  dialogScrim.setAttribute('aria-hidden', 'true');

  // Tour HUD: a top-center strip naming the active waypoint with its distance and skip controls.
  const tourHud = document.createElement('div');
  tourHud.className = 'tour-hud';
  tourHud.setAttribute('role', 'status');
  tourHud.style.display = 'none';
  const tourLabel = document.createElement('span');
  tourLabel.className = 'tour-label';
  const tourPrev = button('◀');
  tourPrev.className = 'tour-btn';
  tourPrev.title = 'Previous waypoint';
  tourPrev.setAttribute('aria-label', 'Previous waypoint');
  const tourNext = button('▶');
  tourNext.className = 'tour-btn';
  tourNext.title = 'Next waypoint';
  tourNext.setAttribute('aria-label', 'Next waypoint');
  const tourEnd = button('✕');
  tourEnd.className = 'tour-btn';
  tourEnd.title = 'End tour';
  tourEnd.setAttribute('aria-label', 'End tour');
  tourHud.append(tourPrev, tourLabel, tourNext, tourEnd);

  const setTourHud = (s: TourHudStatus | undefined): void => {
    if (!s) {
      tourHud.style.display = 'none';
      return;
    }
    tourHud.style.display = 'flex';
    tourLabel.textContent = s.done
      ? `Tour complete — ${s.name}`
      : `${s.index + 1}/${s.total} ${s.name} · ${Math.round(s.distance)}m`;
  };

  root.append(dock, scrim, status, notice, hotbar, tourHud, dialogScrim);
  document.body.append(root);

  const setExperienceMode = (mode: 'play' | 'build'): void => {
    const play = mode === 'play';
    playModeUi = play;
    refreshTunnelStrip();
    toolRow.style.display = play ? 'none' : '';
    reachGroup.style.display = play ? 'none' : '';
    holdButton.style.display = play ? 'none' : '';
    hotbar.style.display = play ? 'none' : '';
    reset.style.display = play ? 'none' : '';
    blueprintButton.style.display = play ? 'none' : '';
    // worldButton visibility stays owned by Game (dev-only button); Game re-applies it on
    // every mode change so play hides it and build restores the dev-only state.
    modeButton.textContent = play ? 'Build (B)' : 'Play mode';
    modeButton.title = play
      ? 'Switch to build mode (creative tools)'
      : 'Back to play mode (explore only)';
  };

  /**
   * Mounts `panel` in the dialog scrim: focuses its first button, swallows game keyboard
   * shortcuts while open (capture-phase), closes on Escape/backdrop, and restores focus on
   * close. Returns the close function.
   */
  const openDialogPanel = (panel: HTMLDivElement, onCancel: () => void): (() => void) => {
    const previousFocus = document.activeElement as HTMLElement | null;
    dialogScrim.replaceChildren(panel);
    dialogScrim.classList.add('is-open');
    dialogScrim.setAttribute('aria-hidden', 'false');
    const onKey = (e: KeyboardEvent): void => {
      e.stopPropagation(); // keep game shortcuts (I inventory, B build, tools) inert
      if (e.code === 'Escape') onCancel();
    };
    const onScrimClick = (e: MouseEvent): void => {
      if (e.target === dialogScrim) onCancel();
    };
    window.addEventListener('keydown', onKey, true);
    dialogScrim.addEventListener('click', onScrimClick);
    panel.querySelector('button')?.focus();
    return () => {
      window.removeEventListener('keydown', onKey, true);
      dialogScrim.removeEventListener('click', onScrimClick);
      dialogScrim.classList.remove('is-open');
      dialogScrim.setAttribute('aria-hidden', 'true');
      dialogScrim.replaceChildren();
      previousFocus?.focus();
    };
  };

  const dialogPanel = (label: string): HTMLDivElement => {
    const panel = document.createElement('div');
    panel.className = 'dialog-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-label', label);
    return panel;
  };

  const showDialog = (opts: {
    title: string;
    message: string;
    actions: DialogAction[];
  }): Promise<string> =>
    new Promise((resolve) => {
      const panel = dialogPanel(opts.title);
      const title = document.createElement('div');
      title.className = 'dialog-title';
      title.textContent = opts.title;
      const message = document.createElement('p');
      message.className = 'dialog-message';
      message.textContent = opts.message;
      const actions = document.createElement('div');
      actions.className = 'dialog-actions';
      const finish = (id: string): void => {
        close();
        resolve(id);
      };
      for (const action of opts.actions) {
        const b = button(action.label);
        b.className = action.kind === 'danger' ? 'dialog-btn danger' : 'dialog-btn';
        b.addEventListener('click', () => finish(action.id));
        actions.append(b);
      }
      panel.append(title, message, actions);
      const close = openDialogPanel(panel, () => finish('cancel'));
    });

  const showWorldDialog = (current: string, worlds: string[]): Promise<WorldChoice | undefined> =>
    new Promise((resolve) => {
      const panel = dialogPanel('Worlds');
      const title = document.createElement('div');
      title.className = 'dialog-title';
      title.textContent = 'Worlds';
      const message = document.createElement('p');
      message.className = 'dialog-message';
      message.textContent = `Current world: ${current}`;

      const finish = (choice: WorldChoice | undefined): void => {
        close();
        resolve(choice);
      };

      const list = document.createElement('div');
      list.className = 'world-list';
      for (const w of worlds) {
        const b = button(w === current ? `${w} (current)` : w);
        b.className = 'dialog-btn world-item';
        b.disabled = w === current;
        b.addEventListener('click', () => finish({ kind: 'switch', name: w }));
        list.append(b);
      }

      const nameInput = document.createElement('input');
      nameInput.type = 'text';
      nameInput.className = 'world-input';
      nameInput.placeholder = 'new world name';
      nameInput.setAttribute('aria-label', 'World name');
      const typedName = (): string => nameInput.value.trim();
      nameInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && typedName()) finish({ kind: 'switch', name: typedName() });
      });

      const actions = document.createElement('div');
      actions.className = 'dialog-actions';
      const switchBtn = button('Switch / create');
      switchBtn.className = 'dialog-btn';
      switchBtn.addEventListener('click', () => {
        if (typedName()) finish({ kind: 'switch', name: typedName() });
      });
      const duplicateBtn = button('Duplicate current →');
      duplicateBtn.className = 'dialog-btn';
      duplicateBtn.title = `Copy "${current}" to the typed name, then open it`;
      duplicateBtn.addEventListener('click', () => {
        if (typedName()) finish({ kind: 'duplicate', name: typedName() });
      });
      const cancelBtn = button('Cancel');
      cancelBtn.className = 'dialog-btn';
      cancelBtn.addEventListener('click', () => finish(undefined));
      actions.append(switchBtn, duplicateBtn, cancelBtn);

      panel.append(title, message, list, nameInput, actions);
      const close = openDialogPanel(panel, () => finish(undefined));
    });

  const BLUEPRINT_CATEGORIES: BlueprintCategory[] = [
    'Saved',
    'Village',
    'Adventure',
    'Utility',
    'Nature',
    'Coastal',
    'Dungeon',
  ];

  const showBlueprintDialog = (opts: {
    entries: readonly BlueprintEntry[];
    canSave: boolean;
  }): Promise<BlueprintChoice | undefined> =>
    new Promise((resolve) => {
      const panel = dialogPanel('Blueprints');
      panel.classList.add('blueprint-panel');
      const title = document.createElement('div');
      title.className = 'dialog-title';
      title.textContent = 'Blueprints';

      const finish = (choice: BlueprintChoice | undefined): void => {
        close();
        resolve(choice);
      };

      const byCategory = new Map<BlueprintCategory, BlueprintEntry[]>(
        BLUEPRINT_CATEGORIES.map((c) => [c, []]),
      );
      for (const entry of opts.entries) byCategory.get(entry.category)?.push(entry);

      const tabRow = document.createElement('div');
      tabRow.className = 'blueprint-tabs';
      tabRow.setAttribute('role', 'tablist');

      const body = document.createElement('div');
      body.className = 'blueprint-body';

      const nameInput = document.createElement('input');
      nameInput.type = 'text';
      nameInput.className = 'world-input';
      nameInput.placeholder = 'blueprint name';
      nameInput.setAttribute('aria-label', 'Blueprint name');
      const typedName = (): string => nameInput.value.trim();
      nameInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && opts.canSave && typedName())
          finish({ kind: 'save', name: typedName() });
      });

      const saveBtn = button('Save clipboard');
      saveBtn.className = 'dialog-btn';
      saveBtn.disabled = !opts.canSave;
      saveBtn.title = opts.canSave
        ? 'Save the current clipboard under the typed name'
        : 'Copy a selection first (B, pick corners, C)';
      saveBtn.addEventListener('click', () => {
        if (typedName()) finish({ kind: 'save', name: typedName() });
      });
      const cancelBtn = button('Cancel');
      cancelBtn.className = 'dialog-btn';
      cancelBtn.addEventListener('click', () => finish(undefined));

      const saveRow = document.createElement('div');
      saveRow.className = 'dialog-actions';
      saveRow.append(nameInput, saveBtn, cancelBtn);

      const tabButtons = new Map<BlueprintCategory, HTMLButtonElement>();

      const renderCategory = (category: BlueprintCategory): void => {
        for (const [c, btn] of tabButtons) {
          btn.classList.toggle('active', c === category);
          btn.setAttribute('aria-selected', String(c === category));
        }
        body.replaceChildren();
        const entries = byCategory.get(category) ?? [];
        if (entries.length === 0) {
          const empty = document.createElement('p');
          empty.className = 'dialog-message';
          empty.textContent =
            category === 'Saved' ? 'No saved blueprints yet.' : 'No structures in this category.';
          body.append(empty);
          return;
        }
        const grid = document.createElement('div');
        grid.className = 'blueprint-grid';
        for (const entry of entries) {
          const card = document.createElement('button');
          card.type = 'button';
          card.className = 'blueprint-card';
          card.title = entry.curated ? `${entry.name} (built-in)` : entry.name;

          const canvas = document.createElement('canvas');
          canvas.className = 'blueprint-thumb';
          canvas.width = THUMBNAIL_SIZE;
          canvas.height = THUMBNAIL_SIZE;
          card.append(canvas);
          void Promise.resolve(entry.load()).then((prefab) => {
            renderBlueprintThumbnail(canvas, prefab, swatchFlatColor);
          });

          const label = document.createElement('span');
          label.className = 'blueprint-card-name';
          label.textContent = entry.name;
          card.append(label);

          card.addEventListener('click', () =>
            finish({ kind: 'load', name: entry.name, curated: entry.curated }),
          );

          if (!entry.curated) {
            const deleteBtn = document.createElement('button');
            deleteBtn.type = 'button';
            deleteBtn.className = 'blueprint-delete';
            deleteBtn.textContent = '✕';
            deleteBtn.title = `Delete blueprint "${entry.name}"`;
            deleteBtn.setAttribute('aria-label', `Delete blueprint ${entry.name}`);
            deleteBtn.addEventListener('click', (e) => {
              e.stopPropagation();
              void showDialog({
                title: 'Delete blueprint?',
                message: `Delete "${entry.name}"? This can't be undone.`,
                actions: [
                  { id: 'cancel', label: 'Cancel' },
                  { id: 'delete', label: 'Delete', kind: 'danger' },
                ],
              }).then((id) => {
                if (id === 'delete') finish({ kind: 'delete', name: entry.name });
              });
            });
            card.append(deleteBtn);
          }

          grid.append(card);
        }
        body.append(grid);
      };

      for (const category of BLUEPRINT_CATEGORIES) {
        const tab = button(category);
        tab.type = 'button';
        tab.className = 'blueprint-tab';
        tab.setAttribute('role', 'tab');
        tab.addEventListener('click', () => renderCategory(category));
        tabButtons.set(category, tab);
        tabRow.append(tab);
      }

      panel.append(title, tabRow, body);
      if (opts.canSave || opts.entries.some((e) => !e.curated)) panel.append(saveRow);
      renderCategory('Saved');
      const close = openDialogPanel(panel, () => finish(undefined));
    });

  const showWorldInfoDialog = (
    info: WorldInfo,
    worldName: string,
  ): Promise<'explore' | 'tour' | 'build' | undefined> =>
    new Promise((resolve) => {
      const panel = dialogPanel(info.title);
      panel.classList.add('menu-panel');
      const title = document.createElement('div');
      title.className = 'dialog-title';
      title.textContent = info.title;
      const worldLine = document.createElement('p');
      worldLine.className = 'dialog-message menu-world-line';
      worldLine.textContent = `Current world: ${worldName}`;
      const message = document.createElement('p');
      message.className = 'dialog-message';
      message.textContent = info.description?.trim() || 'No description yet.';
      panel.append(title, worldLine, message);

      if (info.landmarks.length > 0) {
        const heading = document.createElement('div');
        heading.className = 'info-heading';
        heading.textContent = 'Landmarks';
        const list = document.createElement('ul');
        list.className = 'info-landmarks';
        for (const name of info.landmarks) {
          const li = document.createElement('li');
          li.textContent = name;
          list.append(li);
        }
        panel.append(heading, list);
      }

      const tourLine = document.createElement('p');
      tourLine.className = 'dialog-message';
      tourLine.textContent =
        info.tourCount >= 2
          ? `A guided tour with ${info.tourCount} stops is available.`
          : 'No guided tour for this world.';
      panel.append(tourLine);

      // Grouped hotkey reference — the renamed "Menu" button's second job (Section 6).
      const controlsHeading = document.createElement('div');
      controlsHeading.className = 'info-heading';
      controlsHeading.textContent = 'Controls';
      panel.append(controlsHeading);
      const controlsGrid = document.createElement('div');
      controlsGrid.className = 'menu-controls-grid';
      for (const group of MENU_HOTKEY_GROUPS) {
        const box = document.createElement('div');
        box.className = 'menu-controls-group';
        const groupHeading = document.createElement('div');
        groupHeading.className = 'menu-controls-heading';
        groupHeading.textContent = group.heading;
        box.append(groupHeading);
        const list = document.createElement('ul');
        list.className = 'menu-controls-list';
        for (const line of group.lines) {
          const li = document.createElement('li');
          li.textContent = line;
          list.append(li);
        }
        box.append(list);
        controlsGrid.append(box);
      }
      panel.append(controlsGrid);

      const finish = (action: 'explore' | 'tour' | 'build' | undefined): void => {
        close();
        resolve(action);
      };
      const actions = document.createElement('div');
      actions.className = 'dialog-actions';
      const explore = button('Explore');
      explore.className = 'dialog-btn';
      explore.addEventListener('click', () => finish('explore'));
      actions.append(explore);
      if (info.tourCount >= 2) {
        const tourBtn = button('Start Tour');
        tourBtn.className = 'dialog-btn';
        tourBtn.addEventListener('click', () => finish('tour'));
        actions.append(tourBtn);
      }
      const buildBtn = button('Build');
      buildBtn.className = 'dialog-btn';
      buildBtn.addEventListener('click', () => finish('build'));
      actions.append(buildBtn);
      panel.append(actions);

      const close = openDialogPanel(panel, () => finish(undefined));
    });

  let inventoryOpen = false;
  const isInventoryOpen = (): boolean => inventoryOpen;
  const setInventoryOpen = (open: boolean): void => {
    inventoryOpen = open;
    scrim.classList.toggle('is-open', open);
    scrim.setAttribute('aria-hidden', String(!open));
  };
  // Clicking the backdrop (but not the panel) closes the modal.
  scrim.addEventListener('click', (e) => {
    if (e.target === scrim) setInventoryOpen(false);
  });

  const setActiveTool = (tool: string): void => {
    activeToolId = tool;
    refreshTunnelStrip();
    for (const [id, btn] of toolButtons) {
      btn.classList.toggle('active', id === tool);
      btn.setAttribute('aria-pressed', String(id === tool));
    }
  };

  let statusTimer: number | undefined;
  const setStatus = (text: string): void => {
    status.textContent = text;
    status.classList.add('is-visible');
    if (statusTimer !== undefined) window.clearTimeout(statusTimer);
    statusTimer = window.setTimeout(() => {
      status.classList.remove('is-visible');
      statusTimer = undefined;
    }, STATUS_VISIBLE_MS);
  };

  const setNotice = (text: string | null): void => {
    notice.textContent = text ?? '';
    notice.style.display = text ? 'block' : 'none';
  };

  const renderHotbar = (): void => {
    hotbar.replaceChildren();
    inventory.hotbar.forEach((id, index) => {
      const slot = document.createElement('button');
      slot.type = 'button';
      slot.className = index === inventory.selectedSlot ? 'slot selected' : 'slot';
      slot.dataset.slot = String(index);
      const name = registry.get(id).name;
      slot.title = name;
      slot.setAttribute('aria-label', `Slot ${index + 1}: ${name}`);

      const icon = document.createElement('canvas');
      icon.className = 'slot-icon';
      icon.setAttribute('aria-hidden', 'true');
      renderBlockIcon(icon, id, registry.shape(id), swatchFlatColor(id));
      slot.append(icon);

      const badge = document.createElement('span');
      badge.className = 'slot-badge';
      badge.textContent = String(index + 1);
      slot.append(badge);

      hotbar.append(slot);
    });
  };
  renderHotbar();

  return {
    hotbar,
    picker,
    reset,
    worldButton,
    blueprintButton,
    infoButton,
    modeButton,
    tourPrev,
    tourNext,
    tourEnd,
    muteButton,
    volumeSlider,
    setSoundUi,
    setActiveTool,
    setReachValue,
    setHoldRepeatUi,
    setStatus,
    setNotice,
    renderHotbar,
    setInventoryOpen,
    isInventoryOpen,
    showDialog,
    showWorldDialog,
    showBlueprintDialog,
    setExperienceMode,
    setTourHud,
    showWorldInfoDialog,
  };
}
