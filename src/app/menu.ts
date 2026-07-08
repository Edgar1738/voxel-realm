// src/app/menu.ts
//
// Pure logic for the world-select front door: routing (menu vs game), the card data the menu
// renders, and the URLs cards navigate to. DOM rendering lives in menuScreen.ts.
import type { WorldManifest } from '../persistence/worldManifest';
import type { WorldPreset } from '../worldgen/Presets';

/** The menu is the bare-URL front door; any explicit world selection boots straight into it. */
export function shouldShowMenu(search: string): boolean {
  const params = new URLSearchParams(search);
  return !params.has('save') && !params.has('world');
}

/** URL for a shipped world: `?save=<slug>` works in dev (disk store) and prod (static+overlay). */
export function shippedWorldUrl(slug: string): string {
  return `?save=${encodeURIComponent(slug)}`;
}

/** The pre-menu default world — existing players' builds live here. */
export function freeBuildUrl(): string {
  return '?save=default';
}

/**
 * A fresh world on a chosen preset. Pinning `?world=` writes the preset into the new save's meta,
 * and the per-preset save name keeps every preset in its own store on revisits.
 */
export function presetUrl(preset: WorldPreset): string {
  return `?world=${preset}&save=${preset}-world`;
}

export interface WorldCard {
  slug: string;
  title: string;
  description: string;
  tags: string[];
  landmarkCount: number;
  tourCount: number;
  chunkCount?: number;
  url: string;
  /** Stable per-slug hue for the card art (no preview images are shipped yet). */
  hue: number;
}

/** Deterministic hue in [0, 360) so a card's gradient is stable across visits. */
export function cardHue(slug: string): number {
  let h = 0;
  for (let i = 0; i < slug.length; i++) h = (h * 31 + slug.charCodeAt(i)) >>> 0;
  return h % 360;
}

/** The showcase cards, in manifest order. */
export function worldCards(manifest: WorldManifest): WorldCard[] {
  return manifest.worlds.map((w) => ({
    slug: w.slug,
    title: w.title,
    description: w.description,
    tags: [...w.tags],
    landmarkCount: w.landmarks.length,
    tourCount: w.tour.length,
    ...(w.chunkCount !== undefined ? { chunkCount: w.chunkCount } : {}),
    url: shippedWorldUrl(w.slug),
    hue: cardHue(w.slug),
  }));
}

export interface CreateCard {
  name: string;
  blurb: string;
  url: string;
  hue: number;
}

/** The "create a world" cards: the classic free-build world plus a spread of presets. */
export const CREATE_CARDS: readonly CreateCard[] = [
  {
    name: 'Free Build',
    blurb: 'The classic sandbox — continues your existing build.',
    url: freeBuildUrl(),
    hue: cardHue('free-build'),
  },
  ...(
    [
      ['default', 'Rolling Hills', 'Classic terrain — biomes, trees, caves, and ore.'],
      ['flat', 'Flatland', 'A flat grass canvas for pure building.'],
      ['amplified', 'Highlands', 'Tall, dramatic mountains high above sea level.'],
      ['islands', 'Archipelago', 'Island peaks rising from open water.'],
      ['canyon', 'Canyonlands', 'A high plateau cut by deep ravines, ruins on the mesas.'],
      ['villages', 'Villages', 'Gentle plains dotted with generated villages.'],
      ['citadel', 'The Citadel', 'A ruined fortress-kingdom with a dungeon below.'],
      ['harbor', 'Harbor', 'A coastal harbor town on the waterline.'],
      ['stonehaven', 'Stonehaven', 'An alpine kingdom around a mountain lake (experimental).'],
    ] as Array<[WorldPreset, string, string]>
  ).map(([preset, name, blurb]) => ({
    name,
    blurb,
    url: presetUrl(preset),
    hue: cardHue(preset),
  })),
];
