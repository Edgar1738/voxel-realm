import { describe, it, expect } from 'vitest';
import {
  shouldShowMenu,
  shippedWorldUrl,
  freeBuildUrl,
  presetUrl,
  cardHue,
  worldCards,
  CREATE_CARDS,
} from '../src/app/menu';
import { isWorldPreset } from '../src/worldgen/Presets';
import { worldNameFromSearch } from '../src/persistence/worldName';
import {
  emptyManifest,
  upsertManifestEntry,
  buildManifestEntry,
} from '../src/persistence/worldManifest';
import type { WorldMeta } from '../src/persistence/SaveTypes';

describe('shouldShowMenu', () => {
  it('shows the menu only on a bare URL', () => {
    expect(shouldShowMenu('')).toBe(true);
    expect(shouldShowMenu('?')).toBe(true);
    expect(shouldShowMenu('?foo=1')).toBe(true); // unknown params don't select a world
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
    expect(worldNameFromSearch(freeBuildUrl())).toBe('default');
    expect(worldNameFromSearch(presetUrl('citadel'))).toBe('citadel-world');
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
        url: '?save=test-cove',
        hue: cardHue('test-cove'),
      },
    ]);
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
    // Free Build is first and targets the legacy default world.
    expect(CREATE_CARDS[0].url).toBe('?save=default');
  });
});
