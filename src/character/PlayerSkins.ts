import type { EquipmentLoadout } from './Equipment';

export type PlayerSkinId =
  | 'realm-scout'
  | 'castle-mason'
  | 'dawn-guard'
  | 'keep-mage'
  | 'shadow-wanderer'
  | 'forest-ranger'
  | 'ember-smith'
  | 'frost-knight'
  | 'night-rogue';

export type PlayerSkinSlot =
  | 'skin'
  | 'hair'
  | 'eye'
  | 'pupil'
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
  | 'brow'
  | 'hood'
  | 'helmet'
  | 'wizard-hat'
  | 'satchel'
  | 'tool-belt'
  | 'backpack'
  | 'quiver'
  | 'pauldrons'
  | 'cloak'
  | 'mantle'
  | 'scout-kit';

export type PlayerSkinPalette = Record<PlayerSkinSlot, number>;

export interface PlayerSkin {
  id: PlayerSkinId;
  name: string;
  description: string;
  palette: PlayerSkinPalette;
  accessories: readonly PlayerAccessoryId[];
  /** Optional play-mode wrist equipment authored as part of this skin. */
  equipment?: Readonly<EquipmentLoadout>;
}

export const DEFAULT_PLAYER_SKIN_ID: PlayerSkinId = 'realm-scout';
export const PLAYER_SKIN_STORAGE_KEY = 'vr.playerSkin';

/** Warm off-white sclera shared by most faces; pupils vary per skin. */
const EYE_WHITE = 0xf1ece1;

export const BUILT_IN_PLAYER_SKINS: readonly PlayerSkin[] = [
  {
    id: 'realm-scout',
    name: 'Realm Scout',
    description: 'A practical explorer with travel gear and muted field colors.',
    palette: {
      skin: 0xd9a066,
      hair: 0x5a3824,
      eye: EYE_WHITE,
      pupil: 0x35271a,
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
    accessories: ['hair', 'brow', 'satchel', 'backpack', 'scout-kit'],
    equipment: { main: 'sword', off: 'baguette' },
  },
  {
    id: 'castle-mason',
    name: 'Castle Mason',
    description: 'A builder outfit with stone cloth, work gloves, and a tool belt.',
    palette: {
      skin: 0xc88f62,
      hair: 0x3f3029,
      eye: EYE_WHITE,
      pupil: 0x2c2420,
      tunic: 0x7d8176,
      sleeves: 0x646a62,
      pants: 0x4b4b44,
      boots: 0x4a3628,
      gloves: 0x8a6a45,
      belt: 0x5d3d25,
      trim: 0xd29a45,
      metal: 0x9aa0a0,
      leather: 0x7a5533,
      cloak: 0x625b4d,
      hood: 0x7d8176,
    },
    accessories: ['hair', 'brow', 'tool-belt'],
  },
  {
    id: 'dawn-guard',
    name: 'Dawn Guard',
    description: 'A castle guard tabard with plated shoulders and sunrise trim.',
    palette: {
      skin: 0xb77954,
      hair: 0x2d2522,
      eye: EYE_WHITE,
      pupil: 0x27354a,
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
    accessories: ['helmet', 'pauldrons', 'cloak'],
  },
  {
    id: 'keep-mage',
    name: 'Mage of the Keep',
    description: 'A castle scholar in a deep robe with a proper pointed hat.',
    palette: {
      skin: 0xd2a079,
      hair: 0x4a3b53,
      eye: EYE_WHITE,
      pupil: 0x6b4a8c,
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
    accessories: ['hair', 'brow', 'wizard-hat', 'mantle', 'cloak'],
  },
  {
    id: 'shadow-wanderer',
    name: 'Shadow Wanderer',
    description: 'A cloaked figure of pure shadow — the all-black silhouette, now by choice.',
    // Uniform near-black across every slot (eyes included): reads as a solid black silhouette
    // even under scene lighting (an almost-zero Lambert color stays black), so the classic
    // all-black look is a deliberate, selectable skin rather than an accident of missing lights.
    palette: {
      skin: 0x0a0a0f,
      hair: 0x0a0a0f,
      eye: 0x0a0a0f,
      pupil: 0x0a0a0f,
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
  {
    id: 'forest-ranger',
    name: 'Forest Ranger',
    description: 'A hooded woodland tracker with a quiver and mossy greens.',
    palette: {
      skin: 0xcf9a6a,
      hair: 0x6b4a26,
      eye: EYE_WHITE,
      pupil: 0x2f4a2c,
      tunic: 0x4a6b35,
      sleeves: 0x3c5a2b,
      pants: 0x4f4636,
      boots: 0x3d2f20,
      gloves: 0x5c4630,
      belt: 0x4e3520,
      trim: 0x9aa257,
      metal: 0x7d8a70,
      leather: 0x6e5233,
      cloak: 0x2e4425,
      hood: 0x3c5a2b,
    },
    accessories: ['hood', 'quiver', 'cloak', 'satchel'],
  },
  {
    id: 'ember-smith',
    name: 'Ember Smith',
    description: 'A soot-dark forge worker with heavy leather and warm ember trim.',
    palette: {
      skin: 0xb5825a,
      hair: 0x201b18,
      eye: EYE_WHITE,
      pupil: 0x241d18,
      tunic: 0x453d38,
      sleeves: 0x38312c,
      pants: 0x2f2a26,
      boots: 0x241f1b,
      gloves: 0x7a5936,
      belt: 0x503722,
      trim: 0xd96f2e,
      metal: 0x6f7276,
      leather: 0x59422b,
      cloak: 0x3a332e,
      hood: 0x453d38,
    },
    accessories: ['hair', 'brow', 'tool-belt', 'satchel'],
  },
  {
    id: 'frost-knight',
    name: 'Frost Knight',
    description: 'A pale-armored northern knight in ice blue and silver plate.',
    palette: {
      skin: 0xdcb18d,
      hair: 0xd8dde2,
      eye: EYE_WHITE,
      pupil: 0x3a5a74,
      tunic: 0x7fa6c4,
      sleeves: 0x5f83a0,
      pants: 0x46586b,
      boots: 0x39434e,
      gloves: 0x8b98a5,
      belt: 0x4a545e,
      trim: 0xe8f0f6,
      metal: 0xc3ccd4,
      leather: 0x5d6a77,
      cloak: 0x9db9d1,
      hood: 0x7fa6c4,
    },
    accessories: ['helmet', 'pauldrons', 'cloak'],
  },
  {
    id: 'night-rogue',
    name: 'Night Rogue',
    description: 'A dusk-purple cutpurse — hooded, quick, and hard to spot after sundown.',
    palette: {
      skin: 0xc08d63,
      hair: 0x1e1a24,
      eye: EYE_WHITE,
      pupil: 0x1c1622,
      tunic: 0x3a2f4d,
      sleeves: 0x2e2540,
      pants: 0x241f30,
      boots: 0x1c1824,
      gloves: 0x3f3352,
      belt: 0x33283f,
      trim: 0x7f6a9e,
      metal: 0x5d5470,
      leather: 0x4a3a2a,
      cloak: 0x241d33,
      hood: 0x2e2540,
    },
    accessories: ['hood', 'satchel', 'quiver'],
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
