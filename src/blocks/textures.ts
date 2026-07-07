import { mulberry32 } from '../core/math';

export const TILE = 16; // px per tile

export type RGB = readonly [number, number, number];
export type RGBA = readonly [number, number, number, number];
export type Pixel = (px: number, py: number, rng: () => number) => RGB | RGBA;

export type PatternName =
  | 'speckle'
  | 'brick'
  | 'cobble'
  | 'planks'
  | 'rings'
  | 'bark'
  | 'ridges'
  | 'grassTop'
  | 'grassSide'
  | 'stone'
  | 'leaves'
  | 'glass'
  | 'lantern'
  | 'ore'
  | 'glow'
  | 'bookshelf'
  | 'furnace'
  | 'flower'
  | 'tallGrass';

export type TextureSpec = { pattern: PatternName; colors: RGB[]; amp?: number } | { custom: Pixel };

export type FaceTextures =
  | TextureSpec
  | { top: TextureSpec; side: TextureSpec; bottom: TextureSpec }
  | [TextureSpec, TextureSpec, TextureSpec, TextureSpec, TextureSpec, TextureSpec];

function clamp(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}
function shade(c: RGB, d: number): RGB {
  return [c[0] + d, c[1] + d, c[2] + d] as RGB;
}

// ---- pattern builders (moved verbatim from TextureArray.ts, wrapped to (colors, amp?)) ----
const speckle =
  (base: RGB, amp: number): Pixel =>
  (_px, _py, rng) =>
    shade(base, (rng() - 0.5) * 2 * amp);
const brick =
  (base: RGB, mortar: RGB): Pixel =>
  (px, py, rng) => {
    const courseH = 4,
      brickW = 8;
    const course = Math.floor(py / courseH);
    const ox = (course % 2) * (brickW / 2);
    const onMortar = py % courseH === 0 || (px + ox) % brickW === 0;
    if (onMortar) return shade(mortar, (rng() - 0.5) * 6);
    // Per-brick tone so a wall reads as individual bricks, plus a faint shadow line at each base.
    const brickCol = Math.floor((px + ox) / brickW);
    const tone = (((((course * 7 + brickCol * 13) % 5) + 5) % 5) - 2) * 5; // stable -10..10 per brick
    const weather = py % courseH === courseH - 1 ? -6 : 0;
    return shade(base, tone + weather + (rng() - 0.5) * 12);
  };
const planks =
  (base: RGB): Pixel =>
  (px, py, rng) => {
    if (py % 5 === 0) return shade(base, -38); // dark seam between courses
    const board = Math.floor(py / 5);
    const boardTone = (((board * 7) % 5) - 2) * 3; // per-board tone variation (-6..+6)
    const grain = px % 2 === 0 ? 4 : -4;
    const knot = (px * 3 + board * 11) % 23 === 0 ? -22 : 0; // occasional wood knot
    return shade(base, grain + boardTone + knot + (rng() - 0.5) * 8);
  };
const cobble =
  (base: RGB, mortar: RGB): Pixel =>
  (px, py, rng) => {
    const cell = 8,
      lx = px % cell,
      ly = py % cell;
    if (lx === 0 || ly === 0 || lx === cell - 1 || ly === cell - 1)
      return shade(mortar, (rng() - 0.5) * 8);
    const r = Math.hypot(lx - (cell - 1) / 2, ly - (cell - 1) / 2) / (cell / 2);
    return shade(base, (1 - r) * 14 + (rng() - 0.5) * 22);
  };
const rings =
  (base: RGB): Pixel =>
  (px, py, rng) =>
    shade(base, Math.sin(Math.hypot(px - 7.5, py - 7.5) * 1.7) * 10 + (rng() - 0.5) * 8);
const bark =
  (base: RGB): Pixel =>
  (px, _py, rng) => {
    const groove = px % 4 === 0 ? -14 : px % 4 === 2 ? 6 : 0;
    return shade(base, groove + (rng() - 0.5) * 10);
  };
const ridges =
  (base: RGB): Pixel =>
  (px, _py, rng) => {
    const ridge = px === 0 || px === TILE - 1 ? -16 : px % 5 === 0 ? 8 : 0;
    return shade(base, ridge + (rng() - 0.5) * 10);
  };
const grassTopP =
  (base: RGB): Pixel =>
  (px, py, rng) => {
    // Clumped blades: brighter tufts and shadowed gaps grouped in patches, plus fine noise,
    // so grass reads as clustered growth rather than per-pixel static.
    const clump = Math.sin(px * 1.3 + py * 0.7) + Math.sin(px * 0.5 - py * 1.4);
    const tuft = clump > 1.0 ? 20 : clump < -1.0 ? -18 : 0;
    const r = rng();
    const blade = r < 0.12 ? 20 : r > 0.92 ? -14 : 0;
    return shade(base, tuft + blade + (rng() - 0.5) * 12);
  };
const grassSideP =
  (dirt: RGB, green: RGB): Pixel =>
  (px, py, rng) => {
    const lip = py < 3 || (py === 3 && rng() < 0.5);
    if (lip) return shade(green, (rng() - 0.5) * 16);
    // A few grass tufts hang a row or two below the lip for a softer transition.
    if (py <= 6 && (px * 7) % 5 === 0 && rng() < 0.6) return shade(green, (rng() - 0.5) * 14 - 6);
    const pebble = rng() < 0.06 ? -16 : 0; // occasional darker pebble in the dirt
    return shade(dirt, pebble + (rng() - 0.5) * 16);
  };
const stoneFace =
  (base: RGB): Pixel =>
  (px, py, rng) => {
    // Low-frequency veining + sparse hairline seams over the speckle, so stone reads as
    // rock with structure instead of flat noise.
    const vein = Math.sin(px * 1.3 + py * 2.1) * 5 + Math.sin(px * 0.7 - py * 1.1) * 3;
    const crack = (px * 5 + py * 3) % 17 === 0 ? -14 : 0;
    const fleck = rng() < 0.04 ? -30 : 0;
    return shade(base, vein + crack + fleck + (rng() - 0.5) * 12);
  };
const leavesP =
  (base: RGB): Pixel =>
  (px, py, rng) => {
    // Clustered light/shadow so leaves read as overlapping clumps rather than TV static.
    const cluster = Math.sin(px * 0.9 + py * 1.7) + Math.sin(px * 1.9 - py * 0.6);
    const depth = cluster > 0.8 ? 24 : cluster < -0.9 ? -30 : 0;
    const r = rng();
    const spore = r < 0.08 ? -18 : r > 0.9 ? 16 : 0;
    return shade(base, depth + spore + (rng() - 0.5) * 16);
  };
const glassP =
  (base: RGB): Pixel =>
  (px, py, rng) => {
    const border = px === 0 || py === 0 || px === TILE - 1 || py === TILE - 1;
    if (border) return shade(base, 24);
    // Diagonal sheen streaks across the pane for a glassy highlight.
    const d = (px + py) % 11;
    const sheen = d === 4 ? 22 : d === 5 ? 14 : 0;
    return shade(base, sheen + (rng() - 0.5) * 5);
  };
const lanternP =
  (frame: RGB, glow: RGB): Pixel =>
  (px, py, rng) => {
    const onFrame = px <= 1 || py <= 1 || px >= TILE - 2 || py >= TILE - 2 || px === 7 || px === 8;
    if (onFrame) return shade(frame, (rng() - 0.5) * 8);
    // Warm glow that brightens toward the center of each pane so the lantern reads as lit.
    const core = (1 - Math.min(1, Math.hypot(px - 7.5, py - 7.5) / 8)) * 20;
    return shade(glow, core + (rng() - 0.5) * 14);
  };
const oreP =
  (spot: RGB): Pixel =>
  (_px, _py, rng) =>
    rng() < 0.18 ? shade(spot, (rng() - 0.5) * 26) : shade([128, 128, 132], (rng() - 0.5) * 18);
/** Bright, faintly-mottled emitter face (glowstone). */
const glowP =
  (base: RGB): Pixel =>
  (_px, _py, rng) =>
    shade(base, (rng() - 0.5) * 18 + (rng() < 0.2 ? 14 : 0));
/** Horizontal shelves with vertical book spines (bookshelf side). */
const bookshelfP =
  (wood: RGB): Pixel =>
  (px, py, rng) => {
    const shelf = py % 7 === 0 || py % 7 === 6;
    if (shelf) return shade(wood, -28);
    const spine = (px * 7 + ((py / 7) | 0) * 13) % 5;
    const tint: RGB = spine === 0 ? [150, 60, 50] : spine === 2 ? [60, 90, 150] : [70, 120, 70];
    return shade(tint, (rng() - 0.5) * 20);
  };
/** Stone block with a dark firebox arch (furnace front). */
const furnaceP =
  (stoneBase: RGB, fire: RGB): Pixel =>
  (px, py, rng) => {
    const inFirebox = px >= 4 && px <= 11 && py >= 8 && py <= 13;
    return inFirebox ? shade(fire, (rng() - 0.5) * 24) : shade(stoneBase, (rng() - 0.5) * 18);
  };

const TRANSPARENT: RGBA = [0, 0, 0, 0];

/** Tall grass: a few vertical green blades on a transparent background. */
const tallGrassP =
  (green: RGB): Pixel =>
  (px, py, rng): RGBA => {
    // Blades at fixed columns; each blade rises to a jagged top. Everything else is transparent.
    const bladeCols = [3, 6, 8, 11, 13];
    const onBlade = bladeCols.includes(px) && py >= 4 + ((px * 5) % 4) && py <= TILE - 1;
    if (!onBlade) return TRANSPARENT;
    const c = shade(green, (rng() - 0.5) * 26 + (py < 8 ? 14 : 0));
    return [clamp(c[0]), clamp(c[1]), clamp(c[2]), 255];
  };

/** Flower: a green stem with a small colored bloom, on a transparent background. */
const flowerP =
  (stem: RGB, petal: RGB): Pixel =>
  (px, py, rng): RGBA => {
    const onStem = (px === 7 || px === 8) && py >= 7;
    const dx = px - 7.5;
    const dy = py - 5;
    const onBloom = dx * dx + dy * dy <= 6.5;
    if (!onStem && !onBloom) return TRANSPARENT;
    const base = onBloom ? petal : stem;
    const c = shade(base, (rng() - 0.5) * 22);
    return [clamp(c[0]), clamp(c[1]), clamp(c[2]), 255];
  };

/** Map a pattern name + its color list to a Pixel. colors[0] is the base; others as documented. */
function buildPattern(name: PatternName, colors: RGB[], amp?: number): Pixel {
  const c0 = colors[0] ?? [128, 128, 128];
  const c1 = colors[1] ?? c0;
  switch (name) {
    case 'speckle':
      return speckle(c0, amp ?? 16);
    case 'brick':
      return brick(c0, c1);
    case 'cobble':
      return cobble(c0, c1);
    case 'planks':
      return planks(c0);
    case 'rings':
      return rings(c0);
    case 'bark':
      return bark(c0);
    case 'ridges':
      return ridges(c0);
    case 'grassTop':
      return grassTopP(c0);
    case 'grassSide':
      return grassSideP(c0, c1);
    case 'stone':
      return stoneFace(c0);
    case 'leaves':
      return leavesP(c0);
    case 'glass':
      return glassP(c0);
    case 'lantern':
      return lanternP(c0, c1);
    case 'ore':
      return oreP(c0);
    case 'glow':
      return glowP(c0);
    case 'bookshelf':
      return bookshelfP(c0);
    case 'furnace':
      return furnaceP(c0, c1);
    case 'flower':
      return flowerP(c0, c1);
    case 'tallGrass':
      return tallGrassP(c0);
  }
}

let customCounter = 0;
const customKeys = new WeakMap<Pixel, string>();

export function resolvePixel(spec: TextureSpec): Pixel {
  return 'custom' in spec ? spec.custom : buildPattern(spec.pattern, spec.colors, spec.amp);
}

/** Stable key for deduping specs into texture layers. Customs are always unique. */
export function specKey(spec: TextureSpec): string {
  if ('custom' in spec) {
    let k = customKeys.get(spec.custom);
    if (!k) {
      k = `custom#${customCounter++}`;
      customKeys.set(spec.custom, k);
    }
    return k;
  }
  return `${spec.pattern}|${spec.colors.map((c) => c.join(',')).join(';')}|${spec.amp ?? ''}`;
}

/** A stable, key-derived seed so a spec's pixels do not depend on its layer index. */
function specSeed(spec: TextureSpec): number {
  const key = specKey(spec);
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

/** Expand any FaceTextures shorthand into 6 specs in Face order (PosX,NegX,PosY,NegY,PosZ,NegZ). */
export function expandFaces(
  faces: FaceTextures,
): [TextureSpec, TextureSpec, TextureSpec, TextureSpec, TextureSpec, TextureSpec] {
  if (Array.isArray(faces)) return faces;
  if ('top' in faces) {
    const { top, side, bottom } = faces;
    return [side, side, top, bottom, side, side];
  }
  return [faces, faces, faces, faces, faces, faces];
}

/** Paint one TILE*TILE RGBA layer from a spec (seeded by the spec's stable key). */
export function paintLayer(out: Uint8Array, layer: number, spec: TextureSpec): void {
  const fn = resolvePixel(spec);
  const rng = mulberry32(specSeed(spec));
  const offset = layer * TILE * TILE * 4;
  for (let py = 0; py < TILE; py++) {
    for (let px = 0; px < TILE; px++) {
      const c = fn(px, py, rng);
      const p = offset + (py * TILE + px) * 4;
      out[p] = clamp(c[0]);
      out[p + 1] = clamp(c[1]);
      out[p + 2] = clamp(c[2]);
      out[p + 3] = c.length > 3 ? clamp((c as RGBA)[3]) : 255;
    }
  }
}
