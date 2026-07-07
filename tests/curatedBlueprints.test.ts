import { describe, it, expect } from 'vitest';
import {
  CURATED_BLUEPRINTS,
  curatedCategory,
  BLUEPRINT_CATEGORIES,
  PREFAB_CATALOG,
  catalogEntry,
  catalogByCategory,
  searchCatalog,
  catalogEntrySize,
  validatePrefabCatalog,
} from '../src/app/curatedBlueprints';
import { validatePrefab } from '../src/core/Prefab';

describe('curatedBlueprints — categorization', () => {
  it('assigns every Village structure from the spec to Village', () => {
    for (const name of [
      'cottage',
      'well',
      'lamp-post',
      'barn',
      'market-stall',
      'farm-plot',
      'stable',
      'blacksmith',
      'tavern',
      'town-gate',
    ]) {
      expect(curatedCategory(name)).toBe('Village');
    }
  });

  it('assigns every Adventure structure from the spec to Adventure', () => {
    for (const name of [
      'ruined-tower',
      'ruinedWatchtower',
      'ruinedCottage',
      'standingStones',
      'obelisk',
      'campShrine',
      'brokenBridge',
      'statue',
      'deadTree',
    ]) {
      expect(curatedCategory(name)).toBe('Adventure');
    }
  });

  it('assigns every Utility structure from the spec to Utility', () => {
    for (const name of [
      'bridge',
      'broken-wall',
      'road-straight',
      'road-corner',
      'wall-segment',
      'stairs-ramp',
      'dock',
    ]) {
      expect(curatedCategory(name)).toBe('Utility');
    }
  });

  it('assigns every Nature structure from the spec to Nature', () => {
    for (const name of [
      'boulder-cluster',
      'rock-outcrop',
      'stone-shelf',
      'pond-small',
      'pond-large',
    ]) {
      expect(curatedCategory(name)).toBe('Nature');
    }
  });

  it('assigns every Coastal structure from the spec to Coastal', () => {
    for (const name of ['lighthouse', 'rowboat', 'shipwreck', 'fishing-hut', 'buoy']) {
      expect(curatedCategory(name)).toBe('Coastal');
      expect(CURATED_BLUEPRINTS[name]).toBeTypeOf('function');
    }
  });

  it('assigns every Dungeon structure from the spec to Dungeon', () => {
    for (const name of [
      'crypt',
      'dungeon-cell',
      'collapsed-hall',
      'treasure-vault',
      'catacomb-nook',
    ]) {
      expect(curatedCategory(name)).toBe('Dungeon');
      expect(CURATED_BLUEPRINTS[name]).toBeTypeOf('function');
    }
  });

  it('exposes seven tabs ending with the Coastal and Dungeon categories', () => {
    expect(BLUEPRINT_CATEGORIES).toEqual([
      'Saved',
      'Village',
      'Adventure',
      'Utility',
      'Nature',
      'Coastal',
      'Dungeon',
    ]);
  });

  it('every curated blueprint has a category and produces a valid prefab', () => {
    for (const name of Object.keys(CURATED_BLUEPRINTS)) {
      expect(BLUEPRINT_CATEGORIES).toContain(curatedCategory(name));
      expect(validatePrefab(CURATED_BLUEPRINTS[name]())).toBeNull();
    }
  });

  it('defaults an unlisted curated name to Utility', () => {
    expect(curatedCategory('some-future-structure')).toBe('Utility');
  });
});

describe('prefab catalog — metadata & queries', () => {
  it('is structurally valid (unique ids, categories, names, tags, geometry)', () => {
    expect(validatePrefabCatalog()).toEqual([]);
  });

  it('derives CURATED_BLUEPRINTS from the catalog, preserving order and ids', () => {
    expect(Object.keys(CURATED_BLUEPRINTS)).toEqual(PREFAB_CATALOG.map((e) => e.id));
  });

  it('every entry has a display name, a description and at least one tag', () => {
    for (const e of PREFAB_CATALOG) {
      expect(e.name.trim().length).toBeGreaterThan(0);
      expect(e.description.trim().length).toBeGreaterThan(0);
      expect(e.tags.length).toBeGreaterThan(0);
    }
  });

  it('looks up entries by id and returns undefined for unknown ids', () => {
    expect(catalogEntry('lighthouse')?.category).toBe('Coastal');
    expect(catalogEntry('nope')).toBeUndefined();
  });

  it('groups by category consistently with curatedCategory', () => {
    for (const e of PREFAB_CATALOG) {
      expect(catalogByCategory(e.category).map((x) => x.id)).toContain(e.id);
      expect(curatedCategory(e.id)).toBe(e.category);
    }
  });

  it('searches across id, name, tags and description', () => {
    const ruins = searchCatalog('ruin').map((e) => e.id);
    expect(ruins).toContain('ruined-tower');
    expect(ruins).toContain('shipwreck'); // tagged 'ruin'
    expect(ruins).not.toContain('cottage');
    // A tag hit that isn't in the name/id.
    expect(searchCatalog('water').map((e) => e.id)).toContain('dock');
    // Empty query returns the whole catalog.
    expect(searchCatalog('  ')).toHaveLength(PREFAB_CATALOG.length);
  });

  it('measures a built prefab size with positive dimensions', () => {
    const size = catalogEntrySize(catalogEntry('cottage')!);
    expect(size).toHaveLength(3);
    for (const d of size) expect(d).toBeGreaterThan(0);
    expect(validatePrefab(catalogEntry('cottage')!.build())).toBeNull();
  });
});
