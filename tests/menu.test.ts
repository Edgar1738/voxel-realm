import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  shouldShowMenu,
  shippedWorldUrl,
  saveWorldUrl,
  authoringWorldUrl,
  freeBuildUrl,
  presetUrl,
  cardHue,
  worldCards,
  featuredWorldCard,
  curatedWorldCards,
  CREATE_CARDS,
} from '../src/app/menu';
import { isWorldPreset } from '../src/worldgen/Presets';
import { worldNameFromSearch } from '../src/persistence/worldName';
import {
  emptyManifest,
  upsertManifestEntry,
  buildManifestEntry,
  type WorldManifest,
} from '../src/persistence/worldManifest';
import type { WorldMeta } from '../src/persistence/SaveTypes';

vi.mock('../src/app/bootStore', () => ({
  createBootStore: vi.fn(),
}));

vi.mock('../src/persistence/worldShare', () => ({
  parseImportText: vi.fn(),
  importSaveName: vi.fn(),
  writeImportedWorld: vi.fn(),
}));

vi.mock('../src/blocks/blocks', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/blocks/blocks')>();
  return {
    ...actual,
    BLOCK_DEFS: [{ id: 'stone' }, { id: 'grass' }],
  };
});

import { attachWorldsLink, renderMenu } from '../src/app/menuScreen';

type FakeEvent = {
  key?: string;
  preventDefault(): void;
  stopPropagation(): void;
};

class FakeTextNode {
  parentNode?: FakeElement;

  constructor(public textContent: string) {}
}

class FakeClassList {
  constructor(private readonly owner: FakeElement) {}

  add(...tokens: string[]): void {
    const next = new Set(this.owner.className.split(/\s+/).filter(Boolean));
    for (const token of tokens) next.add(token);
    this.owner.className = [...next].join(' ');
  }

  remove(...tokens: string[]): void {
    const removed = new Set(tokens);
    this.owner.className = this.owner.className
      .split(/\s+/)
      .filter((token) => token && !removed.has(token))
      .join(' ');
  }

  contains(token: string): boolean {
    return this.owner.className.split(/\s+/).includes(token);
  }
}

class FakeElement {
  className = '';
  children: Array<FakeElement | FakeTextNode> = [];
  style: Record<string, string> = {};
  attributes = new Map<string, string>();
  hidden = false;
  tabIndex = 0;
  href = '';
  src = '';
  alt = '';
  type = '';
  accept = '';
  files?: { 0?: { text(): Promise<string>; name: string } };
  parentNode?: FakeElement;
  private ownText = '';
  readonly classList = new FakeClassList(this);
  readonly listeners = new Map<string, Array<(event: FakeEvent) => void>>();

  constructor(public readonly tagName: string) {}

  set textContent(value: string) {
    this.ownText = value;
    this.children = [];
  }

  get textContent(): string {
    const childText = this.children.map((child) => child.textContent).join('');
    return `${this.ownText}${childText}`;
  }

  appendChild<T extends FakeElement | FakeTextNode>(child: T): T {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  append(...nodes: Array<FakeElement | FakeTextNode>): void {
    for (const node of nodes) this.appendChild(node);
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  getAttribute(name: string): string | undefined {
    return this.attributes.get(name);
  }

  addEventListener(type: string, listener: (event: FakeEvent) => void): void {
    const existing = this.listeners.get(type) ?? [];
    existing.push(listener);
    this.listeners.set(type, existing);
  }

  click(): void {}

  remove(): void {
    if (!this.parentNode) return;
    this.parentNode.children = this.parentNode.children.filter((child) => child !== this);
  }
}

class FakeDocument {
  body = new FakeElement('body');
  pointerLockElement: object | null = null;
  private readonly listeners = new Map<string, Array<(event: FakeEvent) => void>>();

  createElement(tag: string): FakeElement {
    return new FakeElement(tag);
  }

  createElementNS(_namespace: string, tag: string): FakeElement {
    return new FakeElement(tag);
  }

  createTextNode(text: string): FakeTextNode {
    return new FakeTextNode(text);
  }

  addEventListener(type: string, listener: (event: FakeEvent) => void): void {
    const existing = this.listeners.get(type) ?? [];
    existing.push(listener);
    this.listeners.set(type, existing);
  }

  dispatch(type: string): void {
    for (const listener of this.listeners.get(type) ?? [])
      listener({
        preventDefault() {},
        stopPropagation() {},
      });
  }
}

function collectElements(
  root: FakeElement,
  predicate: (el: FakeElement) => boolean,
): FakeElement[] {
  const hits: FakeElement[] = [];
  if (predicate(root)) hits.push(root);
  for (const child of root.children) {
    if (child instanceof FakeElement) hits.push(...collectElements(child, predicate));
  }
  return hits;
}

function textNodes(root: FakeElement): string[] {
  return collectElements(root, () => true).map((el) => el.textContent);
}

function manifestEntryMeta(title: string, description: string): WorldMeta {
  return {
    seed: 1337,
    version: 1,
    preset: 'flat',
    title,
    description,
    spawn: { x: 0, y: 64, z: 8 },
    look: { yaw: 1, pitch: 0 },
  };
}

function buildShowcaseManifest(): WorldManifest {
  let manifest = emptyManifest();
  manifest = upsertManifestEntry(
    manifest,
    buildManifestEntry('Starter Bay', manifestEntryMeta('Starter Bay', 'A calm coast.'), {
      tags: ['coastal'],
      chunkCount: 12,
    }),
  );
  manifest = upsertManifestEntry(
    manifest,
    buildManifestEntry(
      'Frostvale Valley',
      manifestEntryMeta('Frostvale Valley', 'Snowfields and a guided valley tour.'),
      {
        tags: ['snow', 'featured'],
        chunkCount: 48,
        preview: 'worlds/previews/frostvale.jpg',
      },
    ),
  );
  manifest = upsertManifestEntry(
    manifest,
    buildManifestEntry('Sunspire', manifestEntryMeta('Sunspire', 'A bright mesa climb.'), {
      tags: ['mesa'],
      chunkCount: 21,
    }),
  );
  return manifest;
}

describe('shouldShowMenu', () => {
  it('shows the menu only on a bare URL', () => {
    expect(shouldShowMenu('')).toBe(true);
    expect(shouldShowMenu('?')).toBe(true);
    expect(shouldShowMenu('?foo=1')).toBe(true);
  });

  it('boots the game whenever a world is selected', () => {
    expect(shouldShowMenu('?save=tidewreck-cove')).toBe(false);
    expect(shouldShowMenu('?world=citadel')).toBe(false);
    expect(shouldShowMenu('?world=flat&save=town')).toBe(false);
  });
});

describe('menu URLs', () => {
  it('round-trip through the boot world-name parser', () => {
    expect(worldNameFromSearch(shippedWorldUrl('tidewreck-cove'))).toBe('tidewreck-cove');
    expect(worldNameFromSearch(saveWorldUrl('custom-world'))).toBe('custom-world');
    expect(worldNameFromSearch(freeBuildUrl())).toBe('default');
    expect(worldNameFromSearch(presetUrl('citadel'))).toBe('citadel-world');
  });

  it('encodes shipped world URLs and tags them as shipped', () => {
    expect(shippedWorldUrl('Frostvale Valley')).toBe('?save=Frostvale%20Valley&source=shipped');
  });

  it('clears the packaged source flag when switching to an authoring world', () => {
    expect(
      authoringWorldUrl(
        'https://voxel.test/?save=frostvale-valley&source=shipped&debug=1',
        'local workshop',
      ),
    ).toBe('https://voxel.test/?save=local+workshop&debug=1');
  });

  it('pins the preset for create-a-world URLs', () => {
    expect(new URLSearchParams(presetUrl('islands')).get('world')).toBe('islands');
  });
});

describe('cards', () => {
  const meta: WorldMeta = {
    seed: 1337,
    version: 1,
    preset: 'flat',
    title: 'Test Cove',
    description: 'A test world.',
    spawn: { x: 0, y: 64, z: 8 },
    look: { yaw: 1, pitch: 0 },
  };

  it('maps manifest entries to showcase cards in order', () => {
    const manifest = upsertManifestEntry(
      emptyManifest(),
      buildManifestEntry('Test Cove', meta, { tags: ['coastal'], chunkCount: 54 }),
    );
    expect(worldCards(manifest)).toEqual([
      {
        slug: 'test-cove',
        title: 'Test Cove',
        description: 'A test world.',
        tags: ['coastal'],
        landmarkCount: 0,
        tourCount: 0,
        chunkCount: 54,
        url: '?save=test-cove&source=shipped',
        hue: cardHue('test-cove'),
      },
    ]);
  });

  it('passes a manifest preview path through to the card; omits it when absent', () => {
    const withPreview = upsertManifestEntry(
      emptyManifest(),
      buildManifestEntry('Test Cove', meta, {
        tags: [],
        preview: 'worlds/previews/test-cove.jpg',
      }),
    );
    expect(worldCards(withPreview)[0].preview).toBe('worlds/previews/test-cove.jpg');

    const without = upsertManifestEntry(
      emptyManifest(),
      buildManifestEntry('Test Cove', meta, { tags: [] }),
    );
    expect('preview' in worldCards(without)[0]).toBe(false);
  });

  it('features Frostvale Valley when present and keeps the rest curated', () => {
    const cards = worldCards(buildShowcaseManifest());
    expect(featuredWorldCard(cards)?.slug).toBe('frostvale-valley');
    expect(curatedWorldCards(cards).map((card) => card.slug)).toEqual(['starter-bay', 'sunspire']);
  });

  it('falls back to the first world when Frostvale Valley is absent', () => {
    const onlyCard = worldCards(
      upsertManifestEntry(
        emptyManifest(),
        buildManifestEntry('Test Cove', meta, { tags: ['coastal'], chunkCount: 54 }),
      ),
    );
    expect(featuredWorldCard(onlyCard)?.slug).toBe('test-cove');
  });

  it('gives every slug a stable hue in [0, 360)', () => {
    for (const slug of ['tidewreck-cove', 'giza', 'x']) {
      const hue = cardHue(slug);
      expect(hue).toBe(cardHue(slug));
      expect(hue).toBeGreaterThanOrEqual(0);
      expect(hue).toBeLessThan(360);
    }
  });

  it('creates only valid preset URLs and never a save name that shadows a shipped slug', () => {
    for (const card of CREATE_CARDS) {
      const params = new URLSearchParams(card.url);
      const world = params.get('world');
      if (world !== null) expect(isWorldPreset(world)).toBe(true);
      expect(card.name.length).toBeGreaterThan(0);
      expect(card.blurb.length).toBeGreaterThan(0);
    }
    expect(CREATE_CARDS[0].url).toBe('?save=default');
  });

  it('offers Ashen Reach as an explorable volcanic frontier', () => {
    expect(CREATE_CARDS).toContainEqual(
      expect.objectContaining({
        name: 'Ashen Reach',
        url: '?world=ashen-reach&save=ashen-reach-world',
      }),
    );
  });
});

describe('menu screen structure', () => {
  let fakeDocument: FakeDocument;

  beforeEach(() => {
    fakeDocument = new FakeDocument();
    vi.stubGlobal('document', fakeDocument as unknown as Document);
    vi.stubGlobal('window', { location: { href: '' } } as Window & typeof globalThis);
  });

  it('renders Frostvale Valley as the featured hero and keeps other worlds in the grid', () => {
    const root = new FakeElement('div');
    renderMenu(root as unknown as HTMLElement, buildShowcaseManifest());

    expect(root.hidden).toBe(false);
    expect(textNodes(root)).toContain('Curated worlds');
    expect(textNodes(root)).toContain('Build or import');
    expect(textNodes(root)).toContain(
      'A browser voxel sandbox — explore handcrafted worlds, or build your own.',
    );

    const featured = collectElements(
      root,
      (el) =>
        el.tagName === 'a' &&
        el.getAttribute('aria-label') === 'Play featured world Frostvale Valley',
    );
    expect(featured).toHaveLength(1);
    expect(featured[0].href).toBe('?save=frostvale-valley&source=shipped');
    expect(featured[0].className).toContain('menu-featured');
    expect(featured[0].textContent).toContain('Play this world');
    expect(featured[0].textContent).toContain('48 chunks');
    expect(
      collectElements(featured[0], (el) => el.className.includes('menu-featured-banner')),
    ).toHaveLength(1);
    expect(
      collectElements(featured[0], (el) => el.className.includes('menu-featured-body')),
    ).toHaveLength(1);
    expect(
      collectElements(featured[0], (el) => el.className.includes('menu-featured-title')),
    ).toHaveLength(1);
    expect(
      collectElements(featured[0], (el) => el.className.includes('menu-featured-meta')),
    ).toHaveLength(1);
    expect(
      collectElements(featured[0], (el) => el.className.includes('menu-featured-cta')),
    ).toHaveLength(1);

    const subsectionTitles = collectElements(
      root,
      (el) =>
        el.className.includes('menu-subsection-title') && el.textContent === 'More curated worlds',
    );
    expect(subsectionTitles).toHaveLength(1);

    const titledCards = collectElements(
      root,
      (el) =>
        el.className.includes('menu-card-title') &&
        ['Starter Bay', 'Frostvale Valley', 'Sunspire'].includes(el.textContent),
    ).map((el) => el.textContent);
    expect(titledCards).toEqual(['Frostvale Valley', 'Starter Bay', 'Sunspire']);

    const importCard = collectElements(
      root,
      (el) => el.className.includes('menu-import-card') && el.getAttribute('role') === 'button',
    );
    expect(importCard).toHaveLength(1);
    expect(collectElements(importCard[0], (el) => el.tagName === 'svg')).toHaveLength(1);
  });

  it('renders an inline-svg worlds link with a stable accessible name', () => {
    attachWorldsLink();

    const links = collectElements(
      fakeDocument.body,
      (el) => el.tagName === 'a' && el.className === 'menu-worlds-link',
    );
    expect(links).toHaveLength(1);
    expect(links[0].getAttribute('aria-label')).toBe('Worlds');
    expect(links[0].textContent).toBe('Worlds');
    expect(collectElements(links[0], (el) => el.tagName === 'svg')).toHaveLength(1);

    fakeDocument.pointerLockElement = {};
    fakeDocument.dispatch('pointerlockchange');
    expect(links[0].style.display).toBe('none');

    fakeDocument.pointerLockElement = null;
    fakeDocument.dispatch('pointerlockchange');
    expect(links[0].style.display).toBe('inline-flex');
  });
});
