import { describe, it, expect } from 'vitest';
import {
  parseHotbar,
  serializeHotbar,
  loadHotbar,
  saveHotbar,
  hotbarKey,
  defaultHotbar,
  HOTBAR_VERSION,
  HOTBAR_SIZE,
  type HotbarPrefs,
  type HotbarStore,
} from '../src/app/hotbarPrefs';
import { CREATIVE_BLOCKS } from '../src/app/CreativeInventory';

const FALLBACK: HotbarPrefs = { slots: CREATIVE_BLOCKS.slice(0, HOTBAR_SIZE), selectedSlot: 0 };
const NON_CREATIVE = 99999; // never a creative block id

function fakeStore(
  init: Record<string, string> = {},
): HotbarStore & { data: Record<string, string> } {
  const data = { ...init };
  return {
    data,
    getItem: (k) => data[k] ?? null,
    setItem: (k, v) => {
      data[k] = v;
    },
  };
}

describe('hotbar parse/validate', () => {
  it('round-trips a valid hotbar', () => {
    const prefs: HotbarPrefs = { slots: CREATIVE_BLOCKS.slice(0, HOTBAR_SIZE), selectedSlot: 5 };
    expect(parseHotbar(serializeHotbar(prefs), FALLBACK)).toEqual(prefs);
  });

  it('falls back for null, non-JSON, wrong version, and wrong length', () => {
    expect(parseHotbar(null, FALLBACK)).toBe(FALLBACK);
    expect(parseHotbar('nope', FALLBACK)).toBe(FALLBACK);
    expect(
      parseHotbar(
        JSON.stringify({ v: HOTBAR_VERSION + 1, slots: FALLBACK.slots, selectedSlot: 0 }),
        FALLBACK,
      ),
    ).toBe(FALLBACK);
    expect(
      parseHotbar(JSON.stringify({ v: HOTBAR_VERSION, slots: [1, 2], selectedSlot: 0 }), FALLBACK),
    ).toBe(FALLBACK);
  });

  it('repairs a single bad slot to the fallback slot (keeps the rest)', () => {
    const slots = [...FALLBACK.slots];
    slots[3] = NON_CREATIVE;
    const parsed = parseHotbar(
      JSON.stringify({ v: HOTBAR_VERSION, slots, selectedSlot: 0 }),
      FALLBACK,
    );
    expect(parsed.slots[3]).toBe(FALLBACK.slots[3]);
    expect(parsed.slots[0]).toBe(FALLBACK.slots[0]);
  });

  it('clamps an out-of-range selectedSlot to 0', () => {
    const parsed = parseHotbar(
      JSON.stringify({ v: HOTBAR_VERSION, slots: FALLBACK.slots, selectedSlot: 42 }),
      FALLBACK,
    );
    expect(parsed.selectedSlot).toBe(0);
  });
});

describe('hotbar load/save', () => {
  it('keys per world and round-trips', () => {
    const store = fakeStore();
    const prefs: HotbarPrefs = { slots: CREATIVE_BLOCKS.slice(0, HOTBAR_SIZE), selectedSlot: 2 };
    saveHotbar(store, 'giza', prefs);
    expect(store.data[hotbarKey('giza')]).toBeDefined();
    expect(loadHotbar(store, 'giza', FALLBACK)).toEqual(prefs);
    // A different world gets the fallback.
    expect(loadHotbar(store, 'tidewreck', FALLBACK)).toEqual(FALLBACK);
  });

  it('defaultHotbar is the first nine creative blocks, slot 0', () => {
    expect(defaultHotbar()).toEqual({
      slots: CREATIVE_BLOCKS.slice(0, HOTBAR_SIZE),
      selectedSlot: 0,
    });
  });

  it('fails open when the store throws', () => {
    const throwing: HotbarStore = {
      getItem: () => {
        throw new Error('x');
      },
      setItem: () => {
        throw new Error('x');
      },
    };
    expect(loadHotbar(throwing, 'giza', FALLBACK)).toBe(FALLBACK);
    expect(() => saveHotbar(throwing, 'giza', FALLBACK)).not.toThrow();
  });
});
