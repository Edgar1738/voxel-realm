import { describe, expect, it, vi } from 'vitest';
import { BLOCK_DEFS, BLOCK_TEXTURES, TEXTURE_LAYER_COUNT } from '../src/blocks/blocks';
import { paintLayer, specKey, TILE, type TextureSpec } from '../src/blocks/textures';
import { createTextureArray } from '../src/render/TextureArray';
import {
  CLASSIC_TEXTURE_THEME,
  loadTextureTheme,
  resolveTextureThemeId,
} from '../src/assets/TextureTheme';

const SEMANTIC_KEYS = [
  'stone',
  'cobblestone',
  'brick',
  'deepslate',
  'planks',
  'log_bark',
  'log_rings',
  'bookshelf',
  'terracotta',
  'gravel',
  'furnace_front',
  'sand',
  'dirt',
] as const;

describe('texture theme resolution', () => {
  it('uses URL, player, save, manifest, then classic precedence', () => {
    const lower = {
      playerOverride: 'classic',
      savedTheme: 'classic',
      manifestTheme: 'classic',
    } as const;
    expect(resolveTextureThemeId({ ...lower, search: '?theme=fantasy' })).toBe('fantasy');
    expect(resolveTextureThemeId({ ...lower, search: '' })).toBe('classic');
    expect(
      resolveTextureThemeId({
        search: '',
        playerOverride: 'fantasy',
        savedTheme: 'classic',
        manifestTheme: 'classic',
      }),
    ).toBe('fantasy');
    expect(
      resolveTextureThemeId({ search: '', savedTheme: 'fantasy', manifestTheme: 'classic' }),
    ).toBe('fantasy');
    expect(resolveTextureThemeId({ search: '', manifestTheme: 'fantasy' })).toBe('fantasy');
    expect(resolveTextureThemeId({ search: '' })).toBe('classic');
  });

  it('falls back to classic when a supplied value is invalid', () => {
    expect(resolveTextureThemeId({ search: '?theme=neon', savedTheme: 'fantasy' })).toBe('classic');
    expect(resolveTextureThemeId({ search: '', playerOverride: 'neon' })).toBe('classic');
  });
});

describe('texture theme painting', () => {
  const spec: TextureSpec = { pattern: 'stone', colors: [[128, 128, 132]], key: 'stone' };

  it('keeps classic painting byte-identical and leaves spec dedup identity unchanged', () => {
    const before = new Uint8Array(TILE * TILE * 4);
    const classic = new Uint8Array(TILE * TILE * 4);
    paintLayer(before, 0, spec);
    paintLayer(classic, 0, spec, CLASSIC_TEXTURE_THEME);
    expect(classic).toEqual(before);
    expect(specKey(spec)).toBe(specKey({ pattern: 'stone', colors: [[128, 128, 132]] }));
  });

  it('uses imported RGBA pixels, preserves alpha, and falls back when a key is missing', () => {
    const imported = new Uint8Array(TILE * TILE * 4).fill(19);
    imported[3] = 0;
    const themed = new Uint8Array(imported.length);
    paintLayer(themed, 0, spec, { overrides: new Map([['stone', imported]]) });
    expect(themed).toEqual(imported);
    expect(themed[3]).toBe(0);

    const fallback = new Uint8Array(imported.length);
    const procedural = new Uint8Array(imported.length);
    paintLayer(fallback, 0, spec, { overrides: new Map() });
    paintLayer(procedural, 0, spec);
    expect(fallback).toEqual(procedural);
  });

  it('maps every curated semantic key to exactly one unique layer without changing layer count', () => {
    expect(TEXTURE_LAYER_COUNT).toBe(36);
    for (const key of SEMANTIC_KEYS) {
      expect(
        BLOCK_TEXTURES.uniqueSpecs.filter((candidate) =>
          'custom' in candidate ? false : candidate.key === key,
        ),
      ).toHaveLength(1);
    }
    expect(BLOCK_DEFS.map((definition) => definition.id).sort((a, b) => a - b)).toEqual(
      Array.from({ length: 42 }, (_, id) => id),
    );
  });

  it('loads a validated 16x16 tile atlas with the configured base path', async () => {
    const pixels = Array.from({ length: TILE * TILE * 4 }, (_, index) => index % 256);
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ stone: pixels })));
    const theme = await loadTextureTheme('fantasy', '/voxel-realm/', fetcher);
    expect(fetcher).toHaveBeenCalledWith('/voxel-realm/assets/textures/fantasy/theme.tiles.json');
    expect(theme.overrides.get('stone')).toEqual(Uint8Array.from(pixels));
  });

  it('ignores malformed or missing atlas tiles and still creates the normal layer array', async () => {
    const warn = vi.fn();
    const malformed = await loadTextureTheme(
      'fantasy',
      '/',
      async () => new Response(JSON.stringify({ stone: [1, 2, 3] })),
      warn,
    );
    expect(malformed.overrides.size).toBe(0);
    expect(warn).toHaveBeenCalledOnce();
    expect(createTextureArray(malformed).image.depth).toBe(TEXTURE_LAYER_COUNT);
  });
});
