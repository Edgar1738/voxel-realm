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

const GLASS_SWATCH =
  'repeating-conic-gradient(rgba(255,255,255,0.10) 0% 25%, transparent 0% 50%) 0 0 / 12px 12px,' +
  'linear-gradient(160deg, rgba(255,255,255,0.2), rgba(0,0,0,0.05)),' +
  'rgba(205,232,240,0.45)';

const FALLBACK_SWATCH = '#5a5a60';

function isGlass(id: BlockId): boolean {
  return id === GLASS;
}

/** Builds the soft "block face" background for a slot from its block id. */
function swatchBackground(id: BlockId): string {
  if (isGlass(id)) return GLASS_SWATCH;
  const hex = SWATCH_COLORS[id] ?? FALLBACK_SWATCH;
  return `linear-gradient(160deg, rgba(255,255,255,0.14), rgba(0,0,0,0.18)), ${hex}`;
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

/** Player-facing world info shown by the intro/info dialog (fallbacks applied by the caller). */
export interface WorldInfo {
  title: string;
  description?: string;
  landmarks: string[];
  /** Number of tour waypoints; the Start Tour action shows only when this is >= 2. */
  tourCount: number;
}

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
  /** World info trigger (click handled by Game); visible in both experience modes. */
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
  /** Blueprint library dialog: load/save/delete; resolves undefined on cancel. */
  showBlueprintDialog(opts: {
    saved: string[];
    curated: string[];
    canSave: boolean;
  }): Promise<BlueprintChoice | undefined>;
  /**
   * Play mode hides the creative chrome (tools, hotbar, world/blueprint/reset); build mode
   * restores it. Purely visual — input gating lives in input.ts, not here.
   */
  setExperienceMode(mode: 'play' | 'build'): void;
  /** Shows/updates the tour HUD, or hides it when passed undefined. */
  setTourHud(status: TourHudStatus | undefined): void;
  /** World intro/info dialog; resolves the chosen action or undefined on dismiss. */
  showWorldInfoDialog(info: WorldInfo): Promise<'explore' | 'tour' | 'build' | undefined>;
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
 */
export function createCreativeUi(
  registry: BlockRegistry,
  inventory: CreativeInventory,
  tools: readonly string[],
  toolLabel: (tool: string) => string,
  onSelectTool: (tool: string) => void,
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
  const toolButtons = new Map<string, HTMLButtonElement>();
  for (const t of tools) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'tool-btn';
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

  const reset = button('Reset world');
  reset.className = 'reset-btn';

  const worldButton = button('World: default');
  worldButton.className = 'world-btn';

  const blueprintButton = button('Blueprints');
  blueprintButton.className = 'world-btn';

  const infoButton = button('Info');
  infoButton.className = 'world-btn';
  infoButton.title = 'About this world';

  const modeButton = button('Play mode');
  modeButton.className = 'world-btn';

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

  dock.append(toolRow, soundGroup, infoButton, modeButton, blueprintButton, worldButton, reset);

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

    const swatch = document.createElement('span');
    swatch.className = 'inventory-swatch';
    swatch.style.background = swatchBackground(id);
    swatch.setAttribute('aria-hidden', 'true');

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
    toolRow.style.display = play ? 'none' : '';
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
      e.stopPropagation(); // keep game shortcuts (E inventory, B build, tools) inert
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

  const showBlueprintDialog = (opts: {
    saved: string[];
    curated: string[];
    canSave: boolean;
  }): Promise<BlueprintChoice | undefined> =>
    new Promise((resolve) => {
      const panel = dialogPanel('Blueprints');
      const title = document.createElement('div');
      title.className = 'dialog-title';
      title.textContent = 'Blueprints';
      const message = document.createElement('p');
      message.className = 'dialog-message';
      message.textContent = opts.canSave
        ? 'Load a blueprint into paste mode, or save the current clipboard.'
        : 'Load a blueprint into paste mode. (Copy a selection in build mode to save one.)';

      const finish = (choice: BlueprintChoice | undefined): void => {
        close();
        resolve(choice);
      };

      const list = document.createElement('div');
      list.className = 'world-list';
      for (const name of opts.saved) {
        const row = document.createElement('div');
        row.className = 'blueprint-row';
        const loadBtn = button(name);
        loadBtn.className = 'dialog-btn world-item';
        loadBtn.addEventListener('click', () => finish({ kind: 'load', name, curated: false }));
        const deleteBtn = button('✕');
        deleteBtn.className = 'dialog-btn blueprint-delete';
        deleteBtn.title = `Delete blueprint "${name}"`;
        deleteBtn.setAttribute('aria-label', `Delete blueprint ${name}`);
        deleteBtn.addEventListener('click', () => finish({ kind: 'delete', name }));
        row.append(loadBtn, deleteBtn);
        list.append(row);
      }
      for (const name of opts.curated) {
        const b = button(`${name} (built-in)`);
        b.className = 'dialog-btn world-item';
        b.addEventListener('click', () => finish({ kind: 'load', name, curated: true }));
        list.append(b);
      }
      if (opts.saved.length === 0 && opts.curated.length === 0) {
        const empty = document.createElement('p');
        empty.className = 'dialog-message';
        empty.textContent = 'No blueprints yet.';
        list.append(empty);
      }

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

      const actions = document.createElement('div');
      actions.className = 'dialog-actions';
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
      actions.append(saveBtn, cancelBtn);

      panel.append(title, message, list, nameInput, actions);
      const close = openDialogPanel(panel, () => finish(undefined));
    });

  const showWorldInfoDialog = (
    info: WorldInfo,
  ): Promise<'explore' | 'tour' | 'build' | undefined> =>
    new Promise((resolve) => {
      const panel = dialogPanel(info.title);
      const title = document.createElement('div');
      title.className = 'dialog-title';
      title.textContent = info.title;
      const message = document.createElement('p');
      message.className = 'dialog-message';
      message.textContent = info.description?.trim() || 'No description yet.';
      panel.append(title, message);

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
      slot.style.background = swatchBackground(id);
      const name = registry.get(id).name;
      slot.title = name;
      slot.setAttribute('aria-label', `Slot ${index + 1}: ${name}`);

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
