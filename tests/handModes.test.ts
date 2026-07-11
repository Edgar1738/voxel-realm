import { describe, it, expect } from 'vitest';
import {
  DEFAULT_HAND_MODE_ID,
  HAND_MODES,
  HAND_MODE_STORAGE_KEY,
  isHandModeId,
  loadHandModeId,
  nextHandModeId,
  resolveHandMode,
  saveHandModeId,
} from '../src/character/HandModes';

function memoryStorage(initial: Record<string, string> = {}): Storage {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    key: () => null,
    get length() {
      return map.size;
    },
  };
}

describe('hand modes', () => {
  it('ships block, the tool set, and empty in cycle order', () => {
    expect(HAND_MODES.map((m) => m.id)).toEqual(['block', 'pickaxe', 'axe', 'sword', 'empty']);
  });

  it('defaults to block (the classic held-block view)', () => {
    expect(DEFAULT_HAND_MODE_ID).toBe('block');
    expect(resolveHandMode().id).toBe('block');
  });

  it('validates ids and falls back on unknown ones', () => {
    expect(isHandModeId('axe')).toBe(true);
    expect(isHandModeId('bazooka')).toBe(false);
    expect(resolveHandMode('bazooka').id).toBe('block');
  });

  it('cycles through every mode and wraps back to block', () => {
    let id = DEFAULT_HAND_MODE_ID as string;
    const seen: string[] = [id];
    for (let i = 0; i < HAND_MODES.length - 1; i++) {
      id = nextHandModeId(id);
      seen.push(id);
    }
    expect(seen).toEqual(HAND_MODES.map((m) => m.id));
    expect(nextHandModeId(id)).toBe('block');
    expect(nextHandModeId('unknown')).toBe('pickaxe'); // unknown resolves to block, then advances
  });

  it('persists to localStorage and ignores junk on load', () => {
    const storage = memoryStorage();
    expect(loadHandModeId(storage)).toBe('block');
    expect(saveHandModeId(storage, 'sword')).toBe('sword');
    expect(storage.getItem(HAND_MODE_STORAGE_KEY)).toBe('sword');
    expect(loadHandModeId(storage)).toBe('sword');
    expect(saveHandModeId(storage, 'nope')).toBe('block'); // invalid saves normalize to default
    expect(loadHandModeId(memoryStorage({ [HAND_MODE_STORAGE_KEY]: 'garbage' }))).toBe('block');
  });
});
