import { validatePrefab, type Prefab } from '../core/Prefab';
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
import {
  alpineBed,
  alpineCounter,
  alpineHearth,
  alpineLanternPost,
  alpineTableSet,
  crateStack,
} from '../worldgen/furniturePrefabs';

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

/** A curated structure (everything except the player's own `Saved` blueprints). */
export type CuratedCategory = Exclude<BlueprintCategory, 'Saved'>;

/**
 * One curated structure with its metadata. This is the single source of truth for the built-in
 * catalog: the id/category maps and the `() => Prefab` builder table are all derived from it, so
 * a structure's category, display name, tags and geometry can never drift apart.
 */
export interface PrefabCatalogEntry {
  /** Stable id used as the catalog key and blueprint name (kept verbatim for existing saves). */
  id: string;
  /** Human-facing label for the catalog UI. */
  name: string;
  category: CuratedCategory;
  /** Free-form tags for search/filtering (material, theme, size, function). */
  tags: readonly string[];
  /** One-line description for tooltips/manifests. */
  description: string;
  /** Stable family id for interchangeable size/material/style alternatives. */
  variantFamily?: string;
  /** Human-facing choice inside `variantFamily` (for example "Small" or "Large"). */
  variant?: string;
  /** Builds the prefab geometry on demand (builders are cheap and position-independent). */
  build: () => Prefab;
}

/**
 * The built-in structure catalog. Order is the catalog display order. Adding a structure here is
 * all that's needed — the derived tables below pick it up automatically.
 */
export const PREFAB_CATALOG: readonly PrefabCatalogEntry[] = [
  // --- Village ---
  {
    id: 'cottage',
    name: 'Cottage',
    category: 'Village',
    tags: ['house', 'wood', 'thatch'],
    description: 'A small thatched-roof home.',
    build: cottage,
  },
  {
    id: 'well',
    name: 'Well',
    category: 'Village',
    tags: ['stone', 'water', 'decoration'],
    description: 'A stone village well.',
    build: well,
  },
  {
    id: 'lamp-post',
    name: 'Lamp Post',
    category: 'Village',
    tags: ['light', 'decoration'],
    description: 'A lantern on a wooden post.',
    build: lampPost,
  },
  {
    id: 'barn',
    name: 'Barn',
    category: 'Village',
    tags: ['wood', 'farm', 'storage'],
    description: 'A pitched-roof farm barn.',
    build: barn,
  },
  {
    id: 'market-stall',
    name: 'Market Stall',
    category: 'Village',
    tags: ['wood', 'market'],
    description: 'A covered market stall.',
    build: marketStall,
  },
  {
    id: 'farm-plot',
    name: 'Farm Plot',
    category: 'Village',
    tags: ['farm', 'crops'],
    description: 'A tilled crop plot.',
    build: farmPlot,
  },
  {
    id: 'stable',
    name: 'Stable',
    category: 'Village',
    tags: ['wood', 'farm', 'animals'],
    description: 'An open horse stable.',
    build: stable,
  },
  {
    id: 'blacksmith',
    name: 'Blacksmith',
    category: 'Village',
    tags: ['stone', 'forge', 'shop'],
    description: 'A blacksmith with a forge.',
    build: blacksmith,
  },
  {
    id: 'tavern',
    name: 'Tavern',
    category: 'Village',
    tags: ['wood', 'shop', 'large'],
    description: 'A two-storey village tavern.',
    build: tavern,
  },
  {
    id: 'town-gate',
    name: 'Town Gate',
    category: 'Village',
    tags: ['stone', 'gate', 'wall'],
    description: 'A fortified town gate.',
    build: townGate,
  },
  {
    id: 'watchtower',
    name: 'Watchtower',
    category: 'Village',
    tags: ['stone', 'tower', 'defense'],
    description: 'A stone lookout tower.',
    build: watchtower,
  },
  // --- Adventure ---
  {
    id: 'ruined-tower',
    name: 'Ruined Tower',
    category: 'Adventure',
    tags: ['ruin', 'stone', 'tower'],
    description: 'A crumbling stone tower.',
    build: ruinedTower,
  },
  {
    id: 'ruinedWatchtower',
    name: 'Ruined Watchtower',
    category: 'Adventure',
    tags: ['ruin', 'stone', 'tower'],
    description: 'A broken-topped watchtower.',
    build: ruinedWatchtower,
  },
  {
    id: 'ruinedCottage',
    name: 'Ruined Cottage',
    category: 'Adventure',
    tags: ['ruin', 'house'],
    description: 'A derelict, roofless cottage.',
    build: ruinedCottage,
  },
  {
    id: 'standingStones',
    name: 'Standing Stones',
    category: 'Adventure',
    tags: ['stone', 'monument', 'mystic'],
    description: 'A ring of standing stones.',
    build: standingStones,
  },
  {
    id: 'obelisk',
    name: 'Obelisk',
    category: 'Adventure',
    tags: ['stone', 'monument'],
    description: 'A tall carved obelisk.',
    build: obelisk,
  },
  {
    id: 'campShrine',
    name: 'Camp Shrine',
    category: 'Adventure',
    tags: ['shrine', 'mystic', 'small'],
    description: 'A small wayside shrine.',
    build: campShrine,
  },
  {
    id: 'brokenBridge',
    name: 'Broken Bridge',
    category: 'Adventure',
    tags: ['ruin', 'bridge'],
    description: 'A collapsed bridge span.',
    build: brokenBridge,
  },
  {
    id: 'statue',
    name: 'Statue',
    category: 'Adventure',
    tags: ['stone', 'monument'],
    description: 'A weathered stone statue.',
    build: statue,
  },
  {
    id: 'deadTree',
    name: 'Dead Tree',
    category: 'Adventure',
    tags: ['nature', 'tree', 'decoration'],
    description: 'A bare, gnarled dead tree.',
    build: deadTree,
  },
  // --- Utility ---
  {
    id: 'bridge',
    name: 'Bridge',
    category: 'Utility',
    tags: ['wood', 'bridge', 'path'],
    description: 'A railed plank bridge.',
    build: bridge,
  },
  {
    id: 'broken-wall',
    name: 'Broken Wall',
    category: 'Utility',
    tags: ['stone', 'wall', 'ruin'],
    description: 'A gapped wall segment.',
    build: brokenWall,
  },
  {
    id: 'road-straight',
    name: 'Straight Road',
    category: 'Utility',
    tags: ['path', 'road'],
    description: 'A straight paved road tile.',
    build: roadStraight,
  },
  {
    id: 'road-corner',
    name: 'Road Corner',
    category: 'Utility',
    tags: ['path', 'road'],
    description: 'A right-angle road tile.',
    build: roadCorner,
  },
  {
    id: 'wall-segment',
    name: 'Wall Segment',
    category: 'Utility',
    tags: ['stone', 'wall'],
    description: 'A straight wall run.',
    build: wallSegment,
  },
  {
    id: 'stairs-ramp',
    name: 'Stairs Ramp',
    category: 'Utility',
    tags: ['stairs', 'path'],
    description: 'A stepped access ramp.',
    build: stairsRamp,
  },
  {
    id: 'dock',
    name: 'Dock',
    category: 'Utility',
    tags: ['wood', 'water', 'path'],
    description: 'A wooden waterside dock.',
    build: dock,
  },
  {
    id: 'alpine-bed',
    name: 'Alpine Bed',
    category: 'Utility',
    tags: ['furniture', 'interior', 'bed', 'alpine'],
    description: 'A compact timber bed with a snow-white blanket.',
    build: alpineBed,
  },
  {
    id: 'alpine-counter',
    name: 'Alpine Counter',
    category: 'Utility',
    tags: ['furniture', 'interior', 'counter', 'alpine'],
    description: 'A two-wide plank counter with slab worktop.',
    build: alpineCounter,
  },
  {
    id: 'crate-stack',
    name: 'Crate Stack',
    category: 'Utility',
    tags: ['furniture', 'storage', 'crate'],
    description: 'A small irregular stack of wooden crates.',
    build: crateStack,
  },
  {
    id: 'alpine-hearth',
    name: 'Alpine Hearth',
    category: 'Utility',
    tags: ['furniture', 'interior', 'fireplace', 'alpine'],
    description: 'A broad masonry hearth with a brick firebox.',
    build: alpineHearth,
  },
  {
    id: 'alpine-lantern-post',
    name: 'Alpine Lantern Post',
    category: 'Utility',
    tags: ['furniture', 'light', 'lantern', 'alpine'],
    description: 'A compact fence-post lantern for paths or interiors.',
    build: alpineLanternPost,
  },
  {
    id: 'alpine-table-set',
    name: 'Alpine Table Set',
    category: 'Utility',
    tags: ['furniture', 'interior', 'table', 'chairs', 'alpine'],
    description: 'A dining table with two inward-facing stair chairs.',
    build: alpineTableSet,
  },
  // --- Nature ---
  {
    id: 'boulder-cluster',
    name: 'Boulder Cluster',
    category: 'Nature',
    tags: ['stone', 'nature', 'decoration'],
    description: 'A cluster of mossy boulders.',
    build: boulderCluster,
  },
  {
    id: 'rock-outcrop',
    name: 'Rock Outcrop',
    category: 'Nature',
    tags: ['stone', 'nature'],
    description: 'A jutting rock outcrop.',
    build: rockOutcrop,
  },
  {
    id: 'stone-shelf',
    name: 'Stone Shelf',
    category: 'Nature',
    tags: ['stone', 'nature'],
    description: 'A layered stone shelf.',
    build: stoneShelf,
  },
  {
    id: 'pond-small',
    name: 'Small Pond',
    category: 'Nature',
    tags: ['water', 'nature', 'small'],
    description: 'A small water pond.',
    variantFamily: 'pond',
    variant: 'Small',
    build: pondSmall,
  },
  {
    id: 'pond-large',
    name: 'Large Pond',
    category: 'Nature',
    tags: ['water', 'nature', 'large'],
    description: 'A large water pond.',
    variantFamily: 'pond',
    variant: 'Large',
    build: pondLarge,
  },
  // --- Coastal ---
  {
    id: 'lighthouse',
    name: 'Lighthouse',
    category: 'Coastal',
    tags: ['stone', 'tower', 'light', 'water'],
    description: 'A banded coastal lighthouse.',
    build: lighthouse,
  },
  {
    id: 'rowboat',
    name: 'Rowboat',
    category: 'Coastal',
    tags: ['wood', 'boat', 'water'],
    description: 'A small wooden rowboat.',
    build: rowboat,
  },
  {
    id: 'shipwreck',
    name: 'Shipwreck',
    category: 'Coastal',
    tags: ['wood', 'ruin', 'water'],
    description: 'A half-sunk wrecked hull.',
    build: shipwreck,
  },
  {
    id: 'fishing-hut',
    name: 'Fishing Hut',
    category: 'Coastal',
    tags: ['wood', 'house', 'water'],
    description: 'A hut on stilts over water.',
    build: fishingHut,
  },
  {
    id: 'buoy',
    name: 'Buoy',
    category: 'Coastal',
    tags: ['water', 'decoration', 'small'],
    description: 'A floating channel buoy.',
    build: buoy,
  },
  // --- Dungeon ---
  {
    id: 'crypt',
    name: 'Crypt',
    category: 'Dungeon',
    tags: ['stone', 'dungeon', 'tomb'],
    description: 'A sealed stone crypt.',
    build: crypt,
  },
  {
    id: 'dungeon-cell',
    name: 'Dungeon Cell',
    category: 'Dungeon',
    tags: ['stone', 'dungeon', 'prison'],
    description: 'A barred prison cell.',
    build: dungeonCell,
  },
  {
    id: 'collapsed-hall',
    name: 'Collapsed Hall',
    category: 'Dungeon',
    tags: ['stone', 'dungeon', 'ruin'],
    description: 'A caved-in dungeon hall.',
    build: collapsedHall,
  },
  {
    id: 'treasure-vault',
    name: 'Treasure Vault',
    category: 'Dungeon',
    tags: ['stone', 'dungeon', 'treasure'],
    description: 'A guarded treasure vault.',
    build: treasureVault,
  },
  {
    id: 'catacomb-nook',
    name: 'Catacomb Nook',
    category: 'Dungeon',
    tags: ['stone', 'dungeon', 'tomb', 'small'],
    description: 'A small catacomb alcove.',
    build: catacombNook,
  },
];

const CATALOG_BY_ID = new Map<string, PrefabCatalogEntry>(PREFAB_CATALOG.map((e) => [e.id, e]));

/** Built-in structures offered read-only in the blueprint dialog. Derived from {@link PREFAB_CATALOG}. */
export const CURATED_BLUEPRINTS: Record<string, () => Prefab> = Object.fromEntries(
  PREFAB_CATALOG.map((e) => [e.id, e.build]),
);

/** The category a curated blueprint belongs to (defaults to Utility for anything unlisted). */
export function curatedCategory(name: string): CuratedCategory {
  return CATALOG_BY_ID.get(name)?.category ?? 'Utility';
}

/** Look up a full catalog entry by id, or undefined if there is no such curated structure. */
export function catalogEntry(id: string): PrefabCatalogEntry | undefined {
  return CATALOG_BY_ID.get(id);
}

/** All catalog entries in a category, in catalog order. */
export function catalogByCategory(category: CuratedCategory): PrefabCatalogEntry[] {
  return PREFAB_CATALOG.filter((e) => e.category === category);
}

/** Interchangeable entries in a named family, in catalog order. */
export function catalogVariantFamily(family: string): PrefabCatalogEntry[] {
  return PREFAB_CATALOG.filter((entry) => entry.variantFamily === family);
}

/** Every declared variant family and its entries. */
export function catalogVariantFamilies(): Map<string, PrefabCatalogEntry[]> {
  const families = new Map<string, PrefabCatalogEntry[]>();
  for (const entry of PREFAB_CATALOG) {
    if (!entry.variantFamily) continue;
    const entries = families.get(entry.variantFamily) ?? [];
    entries.push(entry);
    families.set(entry.variantFamily, entries);
  }
  return families;
}

/** Case-insensitive search across id, name, tags and description. Empty query returns all. */
export function searchCatalog(query: string): PrefabCatalogEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...PREFAB_CATALOG];
  return PREFAB_CATALOG.filter(
    (e) =>
      e.id.toLowerCase().includes(q) ||
      e.name.toLowerCase().includes(q) ||
      e.description.toLowerCase().includes(q) ||
      e.variantFamily?.toLowerCase().includes(q) ||
      e.variant?.toLowerCase().includes(q) ||
      e.tags.some((t) => t.toLowerCase().includes(q)),
  );
}

/** The built prefab's bounding dimensions `[x, y, z]` (builds the prefab to measure it). */
export function catalogEntrySize(entry: PrefabCatalogEntry): [number, number, number] {
  return entry.build().dims;
}

/**
 * Structural validation for the whole catalog. Returns a list of problems (empty = valid): unique
 * non-empty ids, a known category, a display name, at least one tag, and geometry that passes
 * {@link validatePrefab}. Exercised by the catalog test so a malformed entry fails CI.
 */
export function validatePrefabCatalog(): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  const seenVariants = new Set<string>();
  for (const e of PREFAB_CATALOG) {
    if (!e.id) problems.push('an entry has an empty id');
    else if (seen.has(e.id)) problems.push(`duplicate id "${e.id}"`);
    seen.add(e.id);
    if (!BLUEPRINT_CATEGORIES.includes(e.category)) problems.push(`"${e.id}": unknown category`);
    if (!e.name.trim()) problems.push(`"${e.id}": missing display name`);
    if (e.tags.length === 0) problems.push(`"${e.id}": needs at least one tag`);
    if (!e.description.trim()) problems.push(`"${e.id}": missing description`);
    if ((e.variantFamily === undefined) !== (e.variant === undefined))
      problems.push(`"${e.id}": variantFamily and variant must be declared together`);
    if (e.variantFamily && e.variant) {
      const key = `${e.variantFamily}\0${e.variant}`;
      if (seenVariants.has(key))
        problems.push(`duplicate variant "${e.variantFamily}/${e.variant}"`);
      seenVariants.add(key);
    }
    const reason = validatePrefab(e.build());
    if (reason) problems.push(`"${e.id}": invalid prefab (${reason})`);
  }
  return problems;
}
