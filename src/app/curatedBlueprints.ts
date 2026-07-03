import type { Prefab } from '../core/Prefab';
import {
  cottage,
  well,
  lampPost,
  ruinedTower,
  barn,
  watchtower,
  marketStall,
  brokenWall,
  bridge,
  farmPlot,
  stable,
  blacksmith,
  tavern,
  townGate,
  roadStraight,
  roadCorner,
  wallSegment,
  stairsRamp,
  dock,
} from '../worldgen/prefabs';
import {
  ruinedWatchtower,
  standingStones,
  obelisk,
  ruinedCottage,
  deadTree,
  campShrine,
  brokenBridge,
  statue,
  boulderCluster,
  rockOutcrop,
  stoneShelf,
  pondSmall,
  pondLarge,
} from '../worldgen/wildsPrefabs';
import {
  crypt,
  dungeonCell,
  collapsedHall,
  treasureVault,
  catacombNook,
} from '../worldgen/dungeonPrefabs';
import { lighthouse, rowboat, shipwreck, fishingHut, buoy } from '../worldgen/coastalPrefabs';

/** Built-in structures offered read-only in the blueprint dialog alongside saved blueprints. */
export const CURATED_BLUEPRINTS: Record<string, () => Prefab> = {
  cottage,
  well,
  'lamp-post': lampPost,
  barn,
  'market-stall': marketStall,
  'farm-plot': farmPlot,
  stable,
  blacksmith,
  tavern,
  'town-gate': townGate,
  watchtower,
  'ruined-tower': ruinedTower,
  ruinedWatchtower,
  ruinedCottage,
  standingStones,
  obelisk,
  campShrine,
  brokenBridge,
  statue,
  deadTree,
  bridge,
  'broken-wall': brokenWall,
  'road-straight': roadStraight,
  'road-corner': roadCorner,
  'wall-segment': wallSegment,
  'stairs-ramp': stairsRamp,
  dock,
  'boulder-cluster': boulderCluster,
  'rock-outcrop': rockOutcrop,
  'stone-shelf': stoneShelf,
  'pond-small': pondSmall,
  'pond-large': pondLarge,
  lighthouse,
  rowboat,
  shipwreck,
  'fishing-hut': fishingHut,
  buoy,
  crypt,
  'dungeon-cell': dungeonCell,
  'collapsed-hall': collapsedHall,
  'treasure-vault': treasureVault,
  'catacomb-nook': catacombNook,
};

/** The blueprint catalog tabs; `Saved` holds only user blueprints. */
export type BlueprintCategory =
  | 'Saved'
  | 'Village'
  | 'Adventure'
  | 'Utility'
  | 'Nature'
  | 'Coastal'
  | 'Dungeon';
export const BLUEPRINT_CATEGORIES: BlueprintCategory[] = [
  'Saved',
  'Village',
  'Adventure',
  'Utility',
  'Nature',
  'Coastal',
  'Dungeon',
];

/** Curated-name → category, per the spec's fixed assignment. */
const CATEGORY_BY_NAME: Record<string, Exclude<BlueprintCategory, 'Saved'>> = {
  cottage: 'Village',
  well: 'Village',
  'lamp-post': 'Village',
  barn: 'Village',
  'market-stall': 'Village',
  'farm-plot': 'Village',
  stable: 'Village',
  blacksmith: 'Village',
  tavern: 'Village',
  'town-gate': 'Village',
  watchtower: 'Village',
  'ruined-tower': 'Adventure',
  ruinedWatchtower: 'Adventure',
  ruinedCottage: 'Adventure',
  standingStones: 'Adventure',
  obelisk: 'Adventure',
  campShrine: 'Adventure',
  brokenBridge: 'Adventure',
  statue: 'Adventure',
  deadTree: 'Adventure',
  bridge: 'Utility',
  'broken-wall': 'Utility',
  'road-straight': 'Utility',
  'road-corner': 'Utility',
  'wall-segment': 'Utility',
  'stairs-ramp': 'Utility',
  dock: 'Utility',
  'boulder-cluster': 'Nature',
  'rock-outcrop': 'Nature',
  'stone-shelf': 'Nature',
  'pond-small': 'Nature',
  'pond-large': 'Nature',
  lighthouse: 'Coastal',
  rowboat: 'Coastal',
  shipwreck: 'Coastal',
  'fishing-hut': 'Coastal',
  buoy: 'Coastal',
  crypt: 'Dungeon',
  'dungeon-cell': 'Dungeon',
  'collapsed-hall': 'Dungeon',
  'treasure-vault': 'Dungeon',
  'catacomb-nook': 'Dungeon',
};

/** The category a curated blueprint belongs to (defaults to Utility for anything unlisted). */
export function curatedCategory(name: string): Exclude<BlueprintCategory, 'Saved'> {
  return CATEGORY_BY_NAME[name] ?? 'Utility';
}
