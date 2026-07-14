// Per-world creative hotbar persistence. The hotbar is a world-specific working palette (a Giza
// build reaches for different blocks than a Tidewreck one), so it is keyed per world in
// localStorage. Pure parse/validate/serialize here; CreativeInventory fires the change hook and
// Game wires the load/save. Validated against CREATIVE_BLOCKS so a stale id can't smuggle a
// non-creative block (AIR, etc.) into a slot.
import { CREATIVE_BLOCKS } from './CreativeInventory';
import type { BlockId } from '../core/types';

export const HOTBAR_VERSION = 1;
export const HOTBAR_SIZE = 9;

const CREATIVE_SET: ReadonlySet<BlockId> = new Set(CREATIVE_BLOCKS);

export interface HotbarPrefs {
  slots: BlockId[];
  selectedSlot: number;
}

export interface HotbarStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function hotbarKey(worldName: string): string {
  return `vr.hotbar.${worldName}`;
}

/** The default hotbar: the first nine creative blocks, first slot selected. */
export function defaultHotbar(): HotbarPrefs {
  return { slots: CREATIVE_BLOCKS.slice(0, HOTBAR_SIZE), selectedSlot: 0 };
}

function validSlot(id: unknown): id is BlockId {
  return typeof id === 'number' && Number.isInteger(id) && CREATIVE_SET.has(id);
}

/**
 * Parse a stored hotbar, repairing what it can against `fallback`: a bad individual slot falls back
 * to the corresponding default slot (friendlier than discarding the whole bar for one stale id),
 * and a malformed record as a whole returns the fallback. `fallback` must have HOTBAR_SIZE slots.
 */
export function parseHotbar(raw: string | null, fallback: HotbarPrefs): HotbarPrefs {
  if (raw === null) return fallback;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return fallback;
  }
  if (typeof data !== 'object' || data === null) return fallback;
  const r = data as Record<string, unknown>;
  if (r.v !== HOTBAR_VERSION || !Array.isArray(r.slots) || r.slots.length !== HOTBAR_SIZE) {
    return fallback;
  }
  const slots = r.slots.map((id, i) => (validSlot(id) ? id : fallback.slots[i]));
  const sel = r.selectedSlot;
  const selectedSlot =
    typeof sel === 'number' && Number.isInteger(sel) && sel >= 0 && sel < HOTBAR_SIZE ? sel : 0;
  return { slots, selectedSlot };
}

export function serializeHotbar(prefs: HotbarPrefs): string {
  return JSON.stringify({
    v: HOTBAR_VERSION,
    slots: prefs.slots,
    selectedSlot: prefs.selectedSlot,
  });
}

export function loadHotbar(
  store: HotbarStore,
  worldName: string,
  fallback: HotbarPrefs = defaultHotbar(),
): HotbarPrefs {
  try {
    return parseHotbar(store.getItem(hotbarKey(worldName)), fallback);
  } catch {
    return fallback;
  }
}

export function saveHotbar(store: HotbarStore, worldName: string, prefs: HotbarPrefs): void {
  try {
    store.setItem(hotbarKey(worldName), serializeHotbar(prefs));
  } catch {
    /* ignore — hotbar persistence is best-effort */
  }
}
