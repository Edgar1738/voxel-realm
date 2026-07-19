// src/app/worldMapRender.ts
//
// Pure pixel rendering for the M-key world map: one pixel per block column, colored by the
// column's top block and shaded by its height. No DOM, no three.js — WorldMapUi owns the
// canvas and marker overlay; this module owns everything unit-testable.
import { WORLD_HEIGHT } from '../core/constants';
import { AIR, BLOCK_DEFS, LAVA, MAGMA, WATER, Face, type BlockDef } from '../blocks/blocks';
import { expandFaces } from '../blocks/textures';

export type MapRGB = readonly [number, number, number];

export interface MapSurface {
  id: number;
  y: number;
}

/** Top-most non-air block at a world column; undefined = unloaded (painted transparent). */
export type SurfaceSampler = (x: number, z: number) => MapSurface | undefined;
/** Exact block at a world-space depth; undefined means its chunk is not loaded. */
export type CaveSampler = (x: number, y: number, z: number) => number | undefined;

const FALLBACK_RGB: MapRGB = [90, 90, 96];

/**
 * Base map color per block id: the base color of the block's top-face texture pattern, so
 * the map palette can never drift from the real textures. Custom-pixel faces fall back to
 * a neutral gray.
 */
export function buildMapPalette(defs: readonly BlockDef[] = BLOCK_DEFS): Map<number, MapRGB> {
  const palette = new Map<number, MapRGB>();
  for (const def of defs) {
    if (!def.faces) continue;
    const top = expandFaces(def.faces)[Face.PosY];
    const rgb = 'colors' in top ? top.colors[0] : undefined;
    palette.set(def.id, rgb ? [rgb[0], rgb[1], rgb[2]] : FALLBACK_RGB);
  }
  return palette;
}

export interface MapImage {
  /** Pixels per side; the map is a (2·radius+1)² square centered on the player. */
  size: number;
  /** RGBA rows, north (−Z) at the top. Unloaded columns keep alpha 0. */
  data: Uint8ClampedArray<ArrayBuffer>;
}

/** Height relief: bedrock reads dark, the world ceiling bright; water stays flat. */
export function heightShade(id: number, y: number): number {
  if (id === WATER) return 0.9;
  return 0.62 + 0.46 * (y / WORLD_HEIGHT);
}

/**
 * Renders the player-centered top-down map: one pixel per block column inside `radius`.
 * Row 0 is north (−Z), matching the screen with no rotation.
 */
export function renderMapPixels(
  sample: SurfaceSampler,
  palette: Map<number, MapRGB>,
  centerX: number,
  centerZ: number,
  radius: number,
): MapImage {
  const size = radius * 2 + 1;
  const data = new Uint8ClampedArray(size * size * 4);
  for (let dz = -radius; dz <= radius; dz++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const s = sample(centerX + dx, centerZ + dz);
      if (!s) continue; // unloaded — leave transparent
      const rgb = palette.get(s.id) ?? FALLBACK_RGB;
      const shade = heightShade(s.id, s.y);
      const i = ((dz + radius) * size + (dx + radius)) * 4;
      data[i] = rgb[0] * shade;
      data[i + 1] = rgb[1] * shade;
      data[i + 2] = rgb[2] * shade;
      data[i + 3] = 255;
    }
  }
  return { size, data };
}

/**
 * Renders a horizontal cave slice. Open passages are charcoal, solid geology uses a darkened
 * block palette, and lava/magma stay bright enough to read as navigation landmarks.
 */
export function renderCaveMapPixels(
  sample: CaveSampler,
  palette: Map<number, MapRGB>,
  centerX: number,
  centerZ: number,
  depthY: number,
  radius: number,
): MapImage {
  const size = radius * 2 + 1;
  const data = new Uint8ClampedArray(size * size * 4);
  for (let dz = -radius; dz <= radius; dz++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const id = sample(centerX + dx, depthY, centerZ + dz);
      if (id === undefined) continue;
      const rgb = id === AIR ? ([34, 38, 47] as const) : (palette.get(id) ?? FALLBACK_RGB);
      const shade = id === LAVA ? 1.18 : id === MAGMA ? 1.05 : id === AIR ? 1 : 0.42;
      const i = ((dz + radius) * size + (dx + radius)) * 4;
      data[i] = Math.min(255, rgb[0] * shade);
      data[i + 1] = Math.min(255, rgb[1] * shade);
      data[i + 2] = Math.min(255, rgb[2] * shade);
      data[i + 3] = 255;
    }
  }
  return { size, data };
}
