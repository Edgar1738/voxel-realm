export type PlayerSkinId =
  | 'realm-scout'
  | 'castle-mason'
  | 'dawn-guard'
  | 'keep-mage'
  | 'shadow-wanderer';

export type PlayerSkinSlot =
  | 'skin'
  | 'hair'
  | 'tunic'
  | 'sleeves'
  | 'pants'
  | 'boots'
  | 'gloves'
  | 'belt'
  | 'trim'
  | 'metal'
  | 'leather'
  | 'cloak'
  | 'hood';

export type PlayerAccessoryId =
  | 'hair'
  | 'hood'
  | 'helmet'
  | 'satchel'
  | 'tool-belt'
  | 'backpack'
  | 'cloak'
  | 'mantle';

export type PlayerSkinPalette = Record<PlayerSkinSlot, number>;

export interface PlayerSkin {
  id: PlayerSkinId;
  name: string;
  description: string;
  palette: PlayerSkinPalette;
  accessories: readonly PlayerAccessoryId[];
}

export const DEFAULT_PLAYER_SKIN_ID: PlayerSkinId = 'realm-scout';
export const PLAYER_SKIN_STORAGE_KEY = 'vr.playerSkin';

export const BUILT_IN_PLAYER_SKINS: readonly PlayerSkin[] = [
  {
    id: 'realm-scout',
    name: 'Realm Scout',
    description: 'A practical explorer with travel gear and muted field colors.',
    palette: {
      skin: 0xd9a066,
      hair: 0x5a3824,
      tunic: 0x3e7c59,
      sleeves: 0x2f6047,
      pants: 0x3a4658,
      boots: 0x4b3324,
      gloves: 0x6a4a2e,
      belt: 0x5a3422,
      trim: 0xc9a45c,
      metal: 0x8fa0a6,
      leather: 0x6b4a2f,
      cloak: 0x314c3a,
      hood: 0x3e7c59,
    },
    accessories: ['hair', 'satchel', 'backpack'],
  },
  {
    id: 'castle-mason',
    name: 'Castle Mason',
    description: 'A builder outfit with stone cloth, work gloves, and a tool belt.',
    palette: {
      skin: 0xc88f62,
      hair: 0x3f3029,
      tunic: 0x74786f,
      sleeves: 0x5f655f,
      pants: 0x4b4b44,
      boots: 0x4a3628,
      gloves: 0x8a6a45,
      belt: 0x5d3d25,
      trim: 0xc48d3f,
      metal: 0x9aa0a0,
      leather: 0x7a5533,
      cloak: 0x625b4d,
      hood: 0x74786f,
    },
    accessories: ['hair', 'tool-belt'],
  },
  {
    id: 'dawn-guard',
    name: 'Dawn Guard',
    description: 'A castle guard tabard with light armor and sunrise trim.',
    palette: {
      skin: 0xb77954,
      hair: 0x2d2522,
      tunic: 0x2f5f9e,
      sleeves: 0x28476f,
      pants: 0x293241,
      boots: 0x27211f,
      gloves: 0x42464a,
      belt: 0x44301f,
      trim: 0xf0c66a,
      metal: 0xaeb7bd,
      leather: 0x5d422c,
      cloak: 0x263f6b,
      hood: 0x2f5f9e,
    },
    accessories: ['helmet', 'cloak'],
  },
  {
    id: 'keep-mage',
    name: 'Mage of the Keep',
    description: 'A castle scholar with a deep robe, hood, and warm arcane trim.',
    palette: {
      skin: 0xd2a079,
      hair: 0x4a3b53,
      tunic: 0x3b214d,
      sleeves: 0x513066,
      pants: 0x241930,
      boots: 0x241b23,
      gloves: 0x34243b,
      belt: 0x5a3928,
      trim: 0xd5a84b,
      metal: 0x8c7aa0,
      leather: 0x60442f,
      cloak: 0x1e253c,
      hood: 0x2c173a,
    },
    accessories: ['hood', 'mantle', 'cloak'],
  },
  {
    id: 'shadow-wanderer',
    name: 'Shadow Wanderer',
    description: 'A cloaked figure of pure shadow — the all-black silhouette, now by choice.',
    // Uniform near-black across every slot: reads as a solid black silhouette even under scene
    // lighting (an almost-zero Lambert color stays black), so the classic all-black look is a
    // deliberate, selectable skin rather than an accident of missing lights.
    palette: {
      skin: 0x0a0a0f,
      hair: 0x0a0a0f,
      tunic: 0x0a0a0f,
      sleeves: 0x0a0a0f,
      pants: 0x0a0a0f,
      boots: 0x0a0a0f,
      gloves: 0x0a0a0f,
      belt: 0x0a0a0f,
      trim: 0x0a0a0f,
      metal: 0x0a0a0f,
      leather: 0x0a0a0f,
      cloak: 0x0a0a0f,
      hood: 0x0a0a0f,
    },
    accessories: ['hood', 'cloak'],
  },
];

const BUILT_IN_PLAYER_SKIN_IDS = new Set<string>(BUILT_IN_PLAYER_SKINS.map((skin) => skin.id));

export function isPlayerSkinId(id: string): id is PlayerSkinId {
  return BUILT_IN_PLAYER_SKIN_IDS.has(id);
}

export function resolvePlayerSkin(id: string = DEFAULT_PLAYER_SKIN_ID): PlayerSkin {
  return BUILT_IN_PLAYER_SKINS.find((skin) => skin.id === id) ?? BUILT_IN_PLAYER_SKINS[0];
}

export function nextPlayerSkinId(current: string = DEFAULT_PLAYER_SKIN_ID): PlayerSkinId {
  const currentSkin = resolvePlayerSkin(current);
  const index = BUILT_IN_PLAYER_SKINS.findIndex((skin) => skin.id === currentSkin.id);
  return BUILT_IN_PLAYER_SKINS[(index + 1) % BUILT_IN_PLAYER_SKINS.length].id;
}

export function loadPlayerSkinId(
  storage: Pick<Storage, 'getItem'>,
  key = PLAYER_SKIN_STORAGE_KEY,
): PlayerSkinId {
  const stored = storage.getItem(key);
  return stored && isPlayerSkinId(stored) ? stored : DEFAULT_PLAYER_SKIN_ID;
}

export function savePlayerSkinId(
  storage: Pick<Storage, 'setItem'>,
  id: string,
  key = PLAYER_SKIN_STORAGE_KEY,
): PlayerSkinId {
  const skin = resolvePlayerSkin(id);
  storage.setItem(key, skin.id);
  return skin.id;
}
