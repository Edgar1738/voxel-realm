// What the first-person hand shows. Purely cosmetic: 'block' renders the selected hotbar
// block (the classic build view), the tools are viewmodels only, and 'empty' hides the hand.
// Placing/breaking always uses the selected hotbar block regardless of mode.
export type HandModeId = 'block' | 'pickaxe' | 'axe' | 'sword' | 'empty';

export interface HandMode {
  id: HandModeId;
  name: string;
}

export const HAND_MODES: readonly HandMode[] = [
  { id: 'block', name: 'Block' },
  { id: 'pickaxe', name: 'Pickaxe' },
  { id: 'axe', name: 'Axe' },
  { id: 'sword', name: 'Sword' },
  { id: 'empty', name: 'Empty' },
];

export const DEFAULT_HAND_MODE_ID: HandModeId = 'block';
export const HAND_MODE_STORAGE_KEY = 'vr.handMode';

const HAND_MODE_IDS = new Set<string>(HAND_MODES.map((mode) => mode.id));

export function isHandModeId(id: string): id is HandModeId {
  return HAND_MODE_IDS.has(id);
}

export function resolveHandMode(id: string = DEFAULT_HAND_MODE_ID): HandMode {
  return HAND_MODES.find((mode) => mode.id === id) ?? HAND_MODES[0];
}

export function nextHandModeId(current: string = DEFAULT_HAND_MODE_ID): HandModeId {
  const mode = resolveHandMode(current);
  const index = HAND_MODES.findIndex((m) => m.id === mode.id);
  return HAND_MODES[(index + 1) % HAND_MODES.length].id;
}

export function loadHandModeId(
  storage: Pick<Storage, 'getItem'>,
  key = HAND_MODE_STORAGE_KEY,
): HandModeId {
  const stored = storage.getItem(key);
  return stored && isHandModeId(stored) ? stored : DEFAULT_HAND_MODE_ID;
}

export function saveHandModeId(
  storage: Pick<Storage, 'setItem'>,
  id: string,
  key = HAND_MODE_STORAGE_KEY,
): HandModeId {
  const mode = resolveHandMode(id);
  storage.setItem(key, mode.id);
  return mode.id;
}
