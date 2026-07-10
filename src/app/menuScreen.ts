// src/app/menuScreen.ts
//
// DOM rendering for the world-select front door. All card/URL logic is the pure, unit-tested
// menu.ts module; this file only builds elements (textContent everywhere — manifest strings
// never touch innerHTML). Styles live in index.html with the rest of the app CSS.
import { worldCards, CREATE_CARDS, shippedWorldUrl, type WorldCard, type CreateCard } from './menu';
import type { WorldManifest } from '../persistence/worldManifest';
import { parseImportText, importSaveName, writeImportedWorld } from '../persistence/worldShare';
import { createBootStore } from './bootStore';
import { BLOCK_DEFS } from '../blocks/blocks';

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

function cardBanner(hue: number, label: string, preview?: string): HTMLElement {
  const banner = el('div', 'menu-card-banner');
  // The gradient always paints first — it doubles as the loading placeholder and the
  // fallback when a preview image is missing or 404s (the broken <img> is removed).
  banner.style.background = `linear-gradient(135deg, hsl(${hue} 55% 42%), hsl(${(hue + 45) % 360} 60% 26%))`;
  if (preview) {
    const img = el('img', 'menu-card-preview');
    img.src = preview; // manifest-relative path; attribute assignment, never innerHTML
    img.alt = '';
    img.addEventListener('error', () => img.remove());
    banner.appendChild(img);
  } else {
    banner.appendChild(el('span', 'menu-card-banner-glyph', label.slice(0, 1).toUpperCase()));
  }
  return banner;
}

function worldCardEl(card: WorldCard): HTMLAnchorElement {
  const a = el('a', 'menu-card');
  a.href = card.url;
  a.appendChild(cardBanner(card.hue, card.title, card.preview));

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
  createGrid.appendChild(importCardEl(manifest));
  create.appendChild(createGrid);
  column.appendChild(create);

  root.appendChild(column);
}

/**
 * The "Import a world" card: picks a `.voxelrealm.json` share file, validates it, writes it
 * into a fresh save (never a shipped slug — that would boot the shipped store and hide the
 * import), and navigates there. Errors render inline on the card.
 */
function importCardEl(manifest: WorldManifest): HTMLElement {
  const card = el('div', 'menu-card menu-card-small menu-import-card');
  card.setAttribute('role', 'button');
  card.tabIndex = 0;
  const swatch = el('span', 'menu-swatch menu-import-swatch', '⇪');
  const body = el('div', 'menu-card-body');
  body.appendChild(el('h3', 'menu-card-title', 'Import a world'));
  const blurb = el('p', 'menu-card-desc', 'Open a shared .voxelrealm.json file.');
  body.appendChild(blurb);
  card.append(swatch, body);

  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,application/json';
  input.style.display = 'none';
  card.appendChild(input);

  const validIds = new Set(BLOCK_DEFS.map((d) => d.id));
  const fail = (message: string): void => {
    blurb.textContent = message;
    blurb.classList.add('menu-import-error');
  };

  input.addEventListener('change', () => {
    const file = input.files?.[0];
    if (!file) return;
    blurb.textContent = 'Importing…';
    blurb.classList.remove('menu-import-error');
    void (async () => {
      try {
        const { snapshot, chunkCount, dropped } = parseImportText(await file.text(), (id) =>
          validIds.has(id),
        );
        const name = importSaveName(snapshot.meta?.title, file.name, Date.now());
        const store = createBootStore(name, (id) => validIds.has(id), manifest, {
          dev: import.meta.env.DEV,
          baseUrl: import.meta.env.BASE_URL,
        });
        await writeImportedWorld(store, snapshot);
        if (dropped > 0) {
          console.warn(`Voxel Realm: import dropped ${dropped} malformed entries.`);
        }
        blurb.textContent = `Opening ${chunkCount} chunks…`;
        window.location.href = shippedWorldUrl(name);
      } catch (err) {
        fail(err instanceof Error ? err.message : 'Import failed.');
      }
    })();
  });
  const open = (): void => input.click();
  card.addEventListener('click', open);
  card.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      open();
    }
  });
  return card;
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
