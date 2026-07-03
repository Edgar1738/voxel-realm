import { describe, it, expect } from 'vitest';
import { CURATED_BLUEPRINTS, curatedCategory, BLUEPRINT_CATEGORIES } from '../src/app/curatedBlueprints';
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
