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
export function saveWorldUrl(slug: string): string {
  return `?save=${encodeURIComponent(slug)}`;
}

/** URL for a shipped world: opt into the packaged store when opened from the front door. */
export function shippedWorldUrl(slug: string): string {
  return `${saveWorldUrl(slug)}&source=shipped`;
}

/**
 * Navigates to a writable dev world without carrying the front-door packaged-world override.
 * Other query parameters are preserved because they may be intentional debug or spawn settings.
 */
export function authoringWorldUrl(currentHref: string, worldName: string): string {
  const url = new URL(currentHref);
  url.searchParams.set('save', worldName);
  url.searchParams.delete('source');
  return url.toString();
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
  /** Stable per-slug hue for the card art — the fallback when no preview image ships. */
  hue: number;
  /** Relative path to the card's preview screenshot, when the manifest ships one. */
  preview?: string;
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
    ...(w.preview !== undefined ? { preview: w.preview } : {}),
    url: shippedWorldUrl(w.slug),
    hue: cardHue(w.slug),
  }));
}

const FEATURED_WORLD_SLUG = 'frostvale-valley';
const FEATURED_WORLD_TITLE = 'frostvale valley';

/** Frostvale Valley is the featured world when shipped; otherwise use the first manifest world. */
export function featuredWorldCard(cards: readonly WorldCard[]): WorldCard | undefined {
  return (
    cards.find(
      (card) =>
        card.slug === FEATURED_WORLD_SLUG ||
        card.title.trim().toLowerCase() === FEATURED_WORLD_TITLE,
    ) ?? cards[0]
  );
}

/** Remaining curated worlds after the featured card is pulled out. */
export function curatedWorldCards(cards: readonly WorldCard[]): WorldCard[] {
  const featured = featuredWorldCard(cards);
  return featured ? cards.filter((card) => card !== featured) : [];
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
      [
        'sunmeadow-trials',
        'Sunmeadow Trials',
        'Meet Piper Green and race a compact three-flag meadow challenge.',
      ],
      ['ashen-reach', 'Ashen Reach', 'A volcanic frontier: cross the ember bridge to Cinderkeep.'],
      ['citadel', 'The Citadel', 'A ruined fortress-kingdom with a dungeon below.'],
      ['harbor', 'Harbor', 'A coastal harbor town on the waterline.'],
      ['stonehaven', 'Stonehaven', 'An alpine kingdom around a mountain lake (experimental).'],
      ['kingshollow', 'Kingshollow', 'A castle village of cottages, markets, and farm lanes.'],
    ] as Array<[WorldPreset, string, string]>
  ).map(([preset, name, blurb]) => ({
    name,
    blurb,
    url: presetUrl(preset),
    hue: cardHue(preset),
  })),
];
