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
 * Swatch colors and inline-SVG icon builders for the creative UI. Extracted from CreativeUi so the
 * (pure, DOM-only) icon language lives on its own — no dependency on the UI wiring. All SVG nodes
 * are built from typed shape specs (no innerHTML): trusted, XSS-safe, and easy to unit-test.
 */

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
export const SPEAKER_SHAPES: Record<
  'on' | 'off',
  ReadonlyArray<[string, Record<string, string>]>
> = {
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

type IconShapes = ReadonlyArray<[string, Record<string, string>]>;

/** Sun disc + eight rays; shown on the time slider when it's daytime. */
export const SUN_SHAPES: IconShapes = [
  ['circle', { cx: '7', cy: '7', r: '2.6', fill: 'currentColor' }],
  ...[
    'M7 0.6 V2.3',
    'M7 11.7 V13.4',
    'M0.6 7 H2.3',
    'M11.7 7 H13.4',
    'M2.5 2.5 L3.7 3.7',
    'M11.5 2.5 L10.3 3.7',
    'M2.5 11.5 L3.7 10.3',
    'M11.5 11.5 L10.3 10.3',
  ].map((d): [string, Record<string, string>] => [
    'path',
    { d, stroke: 'currentColor', 'stroke-width': '1.2', 'stroke-linecap': 'round' },
  ]),
];

/** Crescent moon; shown on the time slider at night. */
export const MOON_SHAPES: IconShapes = [
  ['path', { d: 'M9.2 2.6 A5 5 0 1 0 9.2 11.4 A3.9 3.9 0 1 1 9.2 2.6 Z', fill: 'currentColor' }],
];

/** Shared cloud body for the precipitation weather icons. */
const CLOUD_SHAPE: [string, Record<string, string>] = [
  'path',
  {
    d: 'M3.6 9.4 A2.3 2.3 0 0 1 3.9 5 A3 3 0 0 1 9.6 5.2 A2.2 2.2 0 0 1 10 9.4 Z',
    fill: 'currentColor',
    'fill-opacity': '0.92',
  },
];

/** Weather-mode icons: sun (clear), cloud+drops (rain), bolt (storm), flakes (snow), cycle (auto). */
export const WEATHER_ICON_SHAPES: Record<string, IconShapes> = {
  clear: SUN_SHAPES,
  rain: [
    CLOUD_SHAPE,
    ...['M5 10.4 L4.3 12.2', 'M7 10.4 L6.3 12.2', 'M9 10.4 L8.3 12.2'].map(
      (d): [string, Record<string, string>] => [
        'path',
        { d, stroke: 'currentColor', 'stroke-width': '1.1', 'stroke-linecap': 'round' },
      ],
    ),
  ],
  storm: [
    CLOUD_SHAPE,
    ['path', { d: 'M7.4 9.2 L5 12.1 H6.6 L6 14 L9 10.9 H7.4 Z', fill: 'currentColor' }],
  ],
  snow: [
    CLOUD_SHAPE,
    ['circle', { cx: '5', cy: '11.6', r: '0.7', fill: 'currentColor' }],
    ['circle', { cx: '7', cy: '12.3', r: '0.7', fill: 'currentColor' }],
    ['circle', { cx: '9', cy: '11.6', r: '0.7', fill: 'currentColor' }],
  ],
  auto: [
    [
      'path',
      {
        d: 'M10.8 4.6 A4.2 4.2 0 1 0 12 8',
        fill: 'none',
        stroke: 'currentColor',
        'stroke-width': '1.3',
        'stroke-linecap': 'round',
      },
    ],
    ['path', { d: 'M8.2 3.3 L11 4.3 L10.2 7 Z', fill: 'currentColor' }],
  ],
};

/** Builds a 14px inline-SVG icon from typed shape specs (no innerHTML — trusted nodes). */
export function buildIcon(shapes: ReadonlyArray<[string, Record<string, string>]>): SVGSVGElement {
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
export function buildToolIcon(tool: string): SVGSVGElement {
  return buildIcon(TOOL_ICON_SHAPES[tool] ?? TOOL_ICON_SHAPES.single);
}
