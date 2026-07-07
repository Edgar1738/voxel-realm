import { describe, it, expect } from 'vitest';
import {
  BUILT_IN_PLAYER_SKINS,
  DEFAULT_PLAYER_SKIN_ID,
  loadPlayerSkinId,
  PLAYER_SKIN_STORAGE_KEY,
  savePlayerSkinId,
  isPlayerSkinId,
  nextPlayerSkinId,
  resolvePlayerSkin,
} from '../src/character/PlayerSkins';

describe('built-in player skins', () => {
  it('ships the first-party Voxel Realm skins', () => {
    expect(BUILT_IN_PLAYER_SKINS.map((s) => s.id)).toEqual([
      'realm-scout',
      'castle-mason',
      'dawn-guard',
      'keep-mage',
      'shadow-wanderer',
    ]);
  });

  it('includes the Shadow Wanderer all-black skin', () => {
    const shadow = resolvePlayerSkin('shadow-wanderer');
    expect(shadow.id).toBe('shadow-wanderer');
    expect(isPlayerSkinId('shadow-wanderer')).toBe(true);
    // Every slot is the same near-black value, so the avatar reads as a solid silhouette.
    const values = Object.values(shadow.palette);
    expect(new Set(values).size).toBe(1);
    expect(values[0]).toBeLessThan(0x111111);
  });

  it('defaults to the Realm Scout skin', () => {
    expect(DEFAULT_PLAYER_SKIN_ID).toBe('realm-scout');
    expect(resolvePlayerSkin().id).toBe('realm-scout');
  });

  it('falls back to the default skin for unknown ids', () => {
    expect(resolvePlayerSkin('missing-skin').id).toBe('realm-scout');
  });

  it('validates only built-in skin ids', () => {
    expect(isPlayerSkinId('keep-mage')).toBe(true);
    expect(isPlayerSkinId('custom:<b>bad</b>')).toBe(false);
  });

  it('cycles through built-in skins and falls back safely for unknown ids', () => {
    expect(nextPlayerSkinId('realm-scout')).toBe('castle-mason');
    expect(nextPlayerSkinId('castle-mason')).toBe('dawn-guard');
    expect(nextPlayerSkinId('dawn-guard')).toBe('keep-mage');
    expect(nextPlayerSkinId('keep-mage')).toBe('shadow-wanderer');
    expect(nextPlayerSkinId('shadow-wanderer')).toBe('realm-scout');
    expect(nextPlayerSkinId('unknown')).toBe('castle-mason');
  });

  it('loads only known skin ids from storage', () => {
    expect(loadPlayerSkinId({ getItem: () => 'keep-mage' })).toBe('keep-mage');
    expect(loadPlayerSkinId({ getItem: () => 'custom:<script>alert(1)</script>' })).toBe(
      DEFAULT_PLAYER_SKIN_ID,
    );
    expect(loadPlayerSkinId({ getItem: () => null })).toBe(DEFAULT_PLAYER_SKIN_ID);
  });

  it('saves only resolved built-in skin ids', () => {
    const values = new Map<string, string>();
    const storage = {
      setItem: (key: string, value: string): void => {
        values.set(key, value);
      },
    };

    expect(savePlayerSkinId(storage, 'keep-mage')).toBe('keep-mage');
    expect(values.get(PLAYER_SKIN_STORAGE_KEY)).toBe('keep-mage');
    expect(savePlayerSkinId(storage, 'custom:<b>bad</b>')).toBe(DEFAULT_PLAYER_SKIN_ID);
    expect(values.get(PLAYER_SKIN_STORAGE_KEY)).toBe(DEFAULT_PLAYER_SKIN_ID);
  });

  it('gives every skin the slots required by the avatar mesh', () => {
    for (const skin of BUILT_IN_PLAYER_SKINS) {
      expect(skin.palette.skin).toBeTypeOf('number');
      expect(skin.palette.tunic).toBeTypeOf('number');
      expect(skin.palette.sleeves).toBeTypeOf('number');
      expect(skin.palette.pants).toBeTypeOf('number');
      expect(skin.palette.boots).toBeTypeOf('number');
      expect(skin.palette.gloves).toBeTypeOf('number');
      expect(skin.palette.belt).toBeTypeOf('number');
      expect(skin.palette.trim).toBeTypeOf('number');
      expect(skin.accessories.length).toBeGreaterThan(0);
    }
  });
});
