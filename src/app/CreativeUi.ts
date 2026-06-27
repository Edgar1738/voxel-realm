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

/** Builds a 14px inline-SVG icon node for a tool (no innerHTML — trusted, typed shapes). */
function buildToolIcon(tool: string): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('width', '14');
  svg.setAttribute('height', '14');
  svg.setAttribute('viewBox', '0 0 14 14');
  svg.setAttribute('aria-hidden', 'true');
  const shapes = TOOL_ICON_SHAPES[tool] ?? TOOL_ICON_SHAPES.single;
  for (const [tag, attrs] of shapes) {
    const node = document.createElementNS(SVG_NS, tag);
    for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, value);
    svg.append(node);
  }
  return svg;
}

/** DOM handles for the creative HUD; pure construction, no game logic. */
export interface CreativeUi {
  hotbar: HTMLDivElement;
  /** The grid container holding the block tiles; Game delegates tile clicks off this node. */
  picker: HTMLDivElement;
  reset: HTMLButtonElement;
  /** Dev world menu: a button labeled with the current world (click handled by Game). */
  worldButton: HTMLButtonElement;
  /** Highlights the button for `tool` and dims the rest. */
  setActiveTool(tool: string): void;
  /** Shows `text` as a transient toast that fades out on its own. */
  setStatus(text: string): void;
  renderHotbar(): void;
  /** Opens or closes the inventory modal (fade/scale; inert when closed). */
  setInventoryOpen(open: boolean): void;
  /** Whether the inventory modal is currently open. */
  isInventoryOpen(): boolean;
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

  dock.append(toolRow, worldButton, reset);

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

  root.append(dock, scrim, status, hotbar);
  document.body.append(root);

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
    setActiveTool,
    setStatus,
    renderHotbar,
    setInventoryOpen,
    isInventoryOpen,
  };
}
