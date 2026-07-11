import { TILE } from '../blocks/textures';

export type TextureThemeId = 'classic' | 'fantasy';

export interface TextureTheme {
  id: TextureThemeId;
  overrides: ReadonlyMap<string, Uint8Array>;
}

export const PLAYER_TEXTURE_THEME_KEY = 'vr.textureTheme';
export const CLASSIC_TEXTURE_THEME: TextureTheme = {
  id: 'classic',
  overrides: new Map(),
};

export interface TextureThemeResolution {
  search: string;
  playerOverride?: unknown;
  savedTheme?: unknown;
  manifestTheme?: unknown;
}

function parsedTheme(value: unknown): TextureThemeId | undefined {
  return value === 'classic' || value === 'fantasy' ? value : undefined;
}

function suppliedTheme(value: unknown): TextureThemeId | undefined {
  return value === undefined || value === null ? undefined : (parsedTheme(value) ?? 'classic');
}

export function resolveTextureThemeId(options: TextureThemeResolution): TextureThemeId {
  const params = new URLSearchParams(options.search);
  if (params.has('theme')) return parsedTheme(params.get('theme')) ?? 'classic';
  return (
    suppliedTheme(options.playerOverride) ??
    suppliedTheme(options.savedTheme) ??
    suppliedTheme(options.manifestTheme) ??
    'classic'
  );
}

export function readPlayerTextureTheme(storage: Pick<Storage, 'getItem'>): unknown {
  try {
    return storage.getItem(PLAYER_TEXTURE_THEME_KEY);
  } catch {
    return undefined;
  }
}

function atlasUrl(baseUrl: string): string {
  const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  return `${base}assets/textures/fantasy/theme.tiles.json`;
}

export async function loadTextureTheme(
  id: TextureThemeId,
  baseUrl: string,
  fetcher: typeof fetch = fetch,
  warn: (message: string) => void = console.warn,
): Promise<TextureTheme> {
  if (id === 'classic') return CLASSIC_TEXTURE_THEME;
  try {
    const response = await fetcher(atlasUrl(baseUrl));
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const raw: unknown = await response.json();
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new Error('atlas root must be an object');
    }
    const overrides = new Map<string, Uint8Array>();
    const expectedLength = TILE * TILE * 4;
    let malformed = false;
    for (const [key, value] of Object.entries(raw)) {
      if (
        !/^[a-z0-9_]+$/.test(key) ||
        !Array.isArray(value) ||
        value.length !== expectedLength ||
        value.some((channel) => !Number.isInteger(channel) || channel < 0 || channel > 255)
      ) {
        malformed = true;
        continue;
      }
      overrides.set(key, Uint8Array.from(value as number[]));
    }
    if (malformed)
      warn('Fantasy texture atlas contains malformed tiles; using procedural fallbacks.');
    return { id: 'fantasy', overrides };
  } catch (error) {
    warn(
      `Fantasy texture atlas unavailable; using procedural fallbacks: ${(error as Error).message}`,
    );
    return { id: 'fantasy', overrides: new Map() };
  }
}
