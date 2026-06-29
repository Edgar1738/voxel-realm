import { mulberry32 } from '../core/math';

export const TILE = 16; // px per tile

export type RGB = readonly [number, number, number];
export type Pixel = (px: number, py: number, rng: () => number) => RGB;

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
  | 'ore';

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
    const ox = (Math.floor(py / courseH) % 2) * (brickW / 2);
    const onMortar = py % courseH === 0 || (px + ox) % brickW === 0;
    return onMortar ? shade(mortar, (rng() - 0.5) * 6) : shade(base, (rng() - 0.5) * 16);
  };
const planks =
  (base: RGB): Pixel =>
  (px, py, rng) => {
    if (py % 5 === 0) return shade(base, -38);
    const grain = px % 2 === 0 ? 4 : -4;
    return shade(base, grain + (rng() - 0.5) * 9);
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
  (_px, _py, rng) => {
    const r = rng();
    const blade = r < 0.14 ? 22 : r > 0.9 ? -16 : 0;
    return shade(base, blade + (rng() - 0.5) * 14);
  };
const grassSideP =
  (dirt: RGB, green: RGB): Pixel =>
  (_px, py, rng) => {
    const lip = py < 3 || (py === 3 && rng() < 0.5);
    return lip ? shade(green, (rng() - 0.5) * 16) : shade(dirt, (rng() - 0.5) * 18);
  };
const stoneFace =
  (base: RGB): Pixel =>
  (_px, _py, rng) =>
    rng() < 0.05 ? shade(base, -36) : shade(base, (rng() - 0.5) * 20);
const leavesP =
  (base: RGB): Pixel =>
  (_px, _py, rng) => {
    const r = rng();
    return r < 0.1
      ? shade(base, -34)
      : r > 0.88
        ? shade(base, 26)
        : shade(base, (rng() - 0.5) * 22);
  };
const glassP =
  (base: RGB): Pixel =>
  (px, py, rng) => {
    const border = px === 0 || py === 0 || px === TILE - 1 || py === TILE - 1;
    return border ? shade(base, 24) : shade(base, (rng() - 0.5) * 6);
  };
const lanternP =
  (frame: RGB, glow: RGB): Pixel =>
  (px, py, rng) => {
    const onFrame = px <= 1 || py <= 1 || px >= TILE - 2 || py >= TILE - 2 || px === 7 || px === 8;
    return onFrame ? shade(frame, (rng() - 0.5) * 8) : shade(glow, (rng() - 0.5) * 18);
  };
const oreP =
  (spot: RGB): Pixel =>
  (_px, _py, rng) =>
    rng() < 0.18 ? shade(spot, (rng() - 0.5) * 26) : shade([128, 128, 132], (rng() - 0.5) * 18);

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
      out[p + 3] = 255;
    }
  }
}
