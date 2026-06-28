import {
  DataArrayTexture,
  RGBAFormat,
  UnsignedByteType,
  NearestFilter,
  RepeatWrapping,
} from 'three';
import { TEXTURE_LAYER_COUNT, TextureLayer } from '../blocks/blocks';
import { mulberry32 } from '../core/math';

const TILE = 16; // px per tile

type RGB = readonly [number, number, number];
type Pixel = (px: number, py: number, rng: () => number) => RGB;

function clamp(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}

/** Adds a uniform delta to every channel (lighten/darken). */
function shade(c: RGB, d: number): RGB {
  return [c[0] + d, c[1] + d, c[2] + d];
}

/** Paints one TILE×TILE layer from a per-pixel function (seeded per layer for determinism). */
function paint(out: Uint8Array, layer: number, fn: Pixel): void {
  const rng = mulberry32(0xc0ffee + layer);
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

// ---- pattern builders ----
const speckle =
  (base: RGB, amp: number): Pixel =>
  (_px, _py, rng) =>
    shade(base, (rng() - 0.5) * 2 * amp);

/** Offset brick courses with mortar lines. */
const brick =
  (base: RGB, mortar: RGB): Pixel =>
  (px, py, rng) => {
    const courseH = 4;
    const brickW = 8;
    const ox = (Math.floor(py / courseH) % 2) * (brickW / 2);
    const onMortar = py % courseH === 0 || (px + ox) % brickW === 0;
    return onMortar ? shade(mortar, (rng() - 0.5) * 6) : shade(base, (rng() - 0.5) * 16);
  };

/** Horizontal plank seams + faint vertical grain. */
const planks =
  (base: RGB): Pixel =>
  (px, py, rng) => {
    if (py % 5 === 0) return shade(base, -38);
    const grain = px % 2 === 0 ? 4 : -4;
    return shade(base, grain + (rng() - 0.5) * 9);
  };

/** Rounded cobbles in a grid with dark mortar between. */
const cobble =
  (base: RGB, mortar: RGB): Pixel =>
  (px, py, rng) => {
    const cell = 8;
    const lx = px % cell;
    const ly = py % cell;
    if (lx === 0 || ly === 0 || lx === cell - 1 || ly === cell - 1) {
      return shade(mortar, (rng() - 0.5) * 8);
    }
    const r = Math.hypot(lx - (cell - 1) / 2, ly - (cell - 1) / 2) / (cell / 2);
    return shade(base, (1 - r) * 14 + (rng() - 0.5) * 22);
  };

/** Concentric growth rings (wood end grain). */
const rings =
  (base: RGB): Pixel =>
  (px, py, rng) =>
    shade(base, Math.sin(Math.hypot(px - 7.5, py - 7.5) * 1.7) * 10 + (rng() - 0.5) * 8);

/** Vertical bark grooves. */
const bark =
  (base: RGB): Pixel =>
  (px, _py, rng) => {
    const groove = px % 4 === 0 ? -14 : px % 4 === 2 ? 6 : 0;
    return shade(base, groove + (rng() - 0.5) * 10);
  };

/** Vertical ridges (cactus flesh). */
const ridges =
  (base: RGB): Pixel =>
  (px, _py, rng) => {
    const ridge = px === 0 || px === TILE - 1 ? -16 : px % 5 === 0 ? 8 : 0;
    return shade(base, ridge + (rng() - 0.5) * 10);
  };

/** Scattered grass blades. */
const grassTop =
  (base: RGB): Pixel =>
  (_px, _py, rng) => {
    const r = rng();
    const blade = r < 0.14 ? 22 : r > 0.9 ? -16 : 0;
    return shade(base, blade + (rng() - 0.5) * 14);
  };

/** Dirt body with a jagged green strip along the top (grass block side). */
const grassSide =
  (dirt: RGB, green: RGB): Pixel =>
  (_px, py, rng) => {
    const lip = py < 3 || (py === 3 && rng() < 0.5);
    return lip ? shade(green, (rng() - 0.5) * 16) : shade(dirt, (rng() - 0.5) * 18);
  };

/** Mostly-uniform stone with occasional dark cracks. */
const stoneFace =
  (base: RGB): Pixel =>
  (_px, _py, rng) =>
    rng() < 0.05 ? shade(base, -36) : shade(base, (rng() - 0.5) * 20);

/** Dappled foliage with light gaps and dark holes. */
const leaves =
  (base: RGB): Pixel =>
  (_px, _py, rng) => {
    const r = rng();
    return r < 0.1
      ? shade(base, -34)
      : r > 0.88
        ? shade(base, 26)
        : shade(base, (rng() - 0.5) * 22);
  };

/** Pale tint with a brighter pane border. */
const glass =
  (base: RGB): Pixel =>
  (px, py, rng) => {
    const border = px === 0 || py === 0 || px === TILE - 1 || py === TILE - 1;
    return border ? shade(base, 24) : shade(base, (rng() - 0.5) * 6);
  };

/** A dark metal frame around a glowing core (lantern). */
const lantern =
  (frame: RGB, glow: RGB): Pixel =>
  (px, py, rng) => {
    const onFrame = px <= 1 || py <= 1 || px >= TILE - 2 || py >= TILE - 2 || px === 7 || px === 8;
    return onFrame ? shade(frame, (rng() - 0.5) * 8) : shade(glow, (rng() - 0.5) * 18);
  };

/** Stone speckled with clustered ore flecks of `spot`. */
const ore =
  (spot: RGB): Pixel =>
  (_px, _py, rng) =>
    rng() < 0.18 ? shade(spot, (rng() - 0.5) * 26) : shade([128, 128, 132], (rng() - 0.5) * 18);

/** Builds the procedural block-face texture array (one layer per TextureLayer). */
export function createTextureArray(): DataArrayTexture {
  const data = new Uint8Array(TILE * TILE * 4 * TEXTURE_LAYER_COUNT);
  paint(data, TextureLayer.GrassTop, grassTop([86, 152, 60]));
  paint(data, TextureLayer.GrassSide, grassSide([134, 96, 62], [86, 152, 60]));
  paint(data, TextureLayer.Dirt, speckle([134, 96, 62], 20));
  paint(data, TextureLayer.Stone, stoneFace([128, 128, 132]));
  paint(data, TextureLayer.WoodTop, rings([160, 130, 85]));
  paint(data, TextureLayer.WoodSide, bark([105, 78, 46]));
  paint(data, TextureLayer.Leaves, leaves([54, 120, 44]));
  paint(data, TextureLayer.Sand, speckle([206, 190, 140], 12));
  paint(data, TextureLayer.Water, speckle([50, 110, 200], 10));
  paint(data, TextureLayer.Snow, speckle([236, 240, 245], 6));
  paint(data, TextureLayer.Cactus, ridges([60, 110, 60]));
  paint(data, TextureLayer.Glass, glass([205, 232, 240]));
  paint(data, TextureLayer.Planks, planks([165, 130, 80]));
  paint(data, TextureLayer.Cobblestone, cobble([118, 118, 122], [70, 70, 74]));
  paint(data, TextureLayer.Brick, brick([150, 70, 58], [198, 182, 162]));
  paint(data, TextureLayer.Lantern, lantern([60, 52, 40], [255, 226, 140]));
  paint(data, TextureLayer.CoalOre, ore([40, 40, 44]));
  paint(data, TextureLayer.IronOre, ore([196, 150, 110]));
  paint(data, TextureLayer.GoldOre, ore([235, 205, 70]));
  paint(data, TextureLayer.Crystal, ore([120, 220, 235]));

  const tex = new DataArrayTexture(data, TILE, TILE, TEXTURE_LAYER_COUNT);
  tex.format = RGBAFormat;
  tex.type = UnsignedByteType;
  tex.magFilter = NearestFilter;
  tex.minFilter = NearestFilter;
  tex.wrapS = RepeatWrapping;
  tex.wrapT = RepeatWrapping;
  tex.needsUpdate = true;
  return tex;
}
