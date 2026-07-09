// src/app/menuScreen.ts
//
// DOM rendering for the world-select front door. All card/URL logic is the pure, unit-tested
// menu.ts module; this file only builds elements (textContent everywhere — manifest strings
// never touch innerHTML). Styles live in index.html with the rest of the app CSS.
import {
  worldCards,
  CREATE_CARDS,
  atlasFeatured,
  type WorldCard,
  type CreateCard,
  type FeaturedWorld,
} from './menu';
import type { WorldManifest } from '../persistence/worldManifest';

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function cardBanner(hue: number, label: string): HTMLElement {
  const banner = el('div', 'menu-card-banner');
  banner.style.background = `linear-gradient(135deg, hsl(${hue} 55% 42%), hsl(${(hue + 45) % 360} 60% 26%))`;
  banner.appendChild(el('span', 'menu-card-banner-glyph', label.slice(0, 1).toUpperCase()));
  return banner;
}

function worldCardEl(card: WorldCard): HTMLAnchorElement {
  const a = el('a', 'menu-card');
  a.href = card.url;
  a.appendChild(cardBanner(card.hue, card.title));

  const body = el('div', 'menu-card-body');
  body.appendChild(el('h3', 'menu-card-title', card.title));
  body.appendChild(el('p', 'menu-card-desc', card.description));

  const facts: string[] = [];
  if (card.landmarkCount > 0) facts.push(`${card.landmarkCount} landmarks`);
  if (card.tourCount > 0) facts.push('guided tour');
  const footer = el('div', 'menu-card-footer');
  for (const tag of card.tags) footer.appendChild(el('span', 'menu-tag', tag));
  if (facts.length > 0) footer.appendChild(el('span', 'menu-card-facts', facts.join(' · ')));
  body.appendChild(footer);

  a.appendChild(body);
  return a;
}

function featuredCardEl(card: FeaturedWorld): HTMLAnchorElement {
  const a = el('a', 'menu-card menu-card-featured');
  a.href = card.url;
  a.appendChild(cardBanner(card.hue, card.title));

  const body = el('div', 'menu-card-body');
  body.appendChild(el('span', 'menu-card-tagline', card.tagline));
  body.appendChild(el('h3', 'menu-card-title', card.title));
  body.appendChild(el('p', 'menu-card-desc', card.description));

  const footer = el('div', 'menu-card-footer');
  for (const highlight of card.highlights) footer.appendChild(el('span', 'menu-tag', highlight));
  body.appendChild(footer);

  a.appendChild(body);
  return a;
}

function createCardEl(card: CreateCard): HTMLAnchorElement {
  const a = el('a', 'menu-card menu-card-small');
  a.href = card.url;
  const swatch = el('span', 'menu-swatch');
  swatch.style.background = `linear-gradient(135deg, hsl(${card.hue} 55% 42%), hsl(${(card.hue + 45) % 360} 60% 26%))`;
  a.appendChild(swatch);
  const body = el('div', 'menu-card-body');
  body.appendChild(el('h3', 'menu-card-title', card.name));
  body.appendChild(el('p', 'menu-card-desc', card.blurb));
  a.appendChild(body);
  return a;
}

/** Build the front door into `root` (the #menu container). */
export function renderMenu(root: HTMLElement, manifest: WorldManifest): void {
  root.hidden = false;

  const column = el('div', 'menu-column');

  const header = el('header', 'menu-header');
  header.appendChild(el('h1', 'menu-title', 'Voxel Realm'));
  header.appendChild(
    el(
      'p',
      'menu-tagline',
      'A browser voxel sandbox — explore handcrafted worlds, or build your own.',
    ),
  );
  header.appendChild(el('p', 'menu-hint', 'Best with a mouse and keyboard.'));
  column.appendChild(header);

  const featured = el('section', 'menu-section');
  featured.appendChild(el('h2', 'menu-section-title', 'Featured'));
  const featuredGrid = el('div', 'menu-grid');
  featuredGrid.appendChild(featuredCardEl(atlasFeatured()));
  featured.appendChild(featuredGrid);
  column.appendChild(featured);

  const showcase = el('section', 'menu-section');
  showcase.appendChild(el('h2', 'menu-section-title', 'Showcase worlds'));
  const showcaseGrid = el('div', 'menu-grid');
  for (const card of worldCards(manifest)) showcaseGrid.appendChild(worldCardEl(card));
  showcase.appendChild(showcaseGrid);
  column.appendChild(showcase);

  const create = el('section', 'menu-section');
  create.appendChild(el('h2', 'menu-section-title', 'Create a world'));
  const createGrid = el('div', 'menu-grid menu-grid-small');
  for (const card of CREATE_CARDS) createGrid.appendChild(createCardEl(card));
  create.appendChild(createGrid);
  column.appendChild(create);

  root.appendChild(column);
}

/**
 * A small in-game "Worlds" home link back to the front door. Lives on <body>, NOT inside the
 * pause overlay — CameraRig rewrites the overlay's textContent (lock errors), which would destroy
 * any child. Visible only while the pointer is unlocked (i.e. when the pause overlay shows), and
 * `stopPropagation` keeps the document-level click-to-lock handler from firing on the way out.
 */
export function attachWorldsLink(): void {
  const link = el('a', 'menu-worlds-link', '⌂ Worlds');
  link.href = './';
  link.addEventListener('click', (event) => event.stopPropagation());
  document.addEventListener('pointerlockchange', () => {
    link.style.display = document.pointerLockElement ? 'none' : '';
  });
  document.body.appendChild(link);
}
