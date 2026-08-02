import type { Prefab } from '../core/Prefab';
import {
  barn,
  bridge,
  brokenWall,
  cottage,
  farmPlot,
  lampPost,
  marketStall,
  ruinedTower,
  stairsRamp,
  townGate,
  wallSegment,
  watchtower,
  well,
} from './prefabs';
import {
  alpineBed,
  alpineCounter,
  alpineHearth,
  alpineLanternPost,
  alpineTableSet,
  crateStack,
} from './furniturePrefabs';

export interface PrefabKitPiece {
  /** Stable piece id within the kit. */
  id: string;
  /** Functional slot used by generators to request a coherent subset. */
  role: string;
  build: () => Prefab;
  /** Selection weight, represented as repeated entries for the existing deterministic scatterer. */
  weight?: number;
}

export interface PrefabKit {
  id: string;
  name: string;
  pieces: readonly PrefabKitPiece[];
}

/** Village/frontier pieces sharing the engine's established medieval material language. */
export const SETTLEMENT_KIT: PrefabKit = {
  id: 'settlement',
  name: 'Settlement',
  pieces: [
    { id: 'cottage', role: 'dwelling', build: cottage, weight: 2 },
    { id: 'well', role: 'civic', build: well },
    { id: 'lamp-post', role: 'light', build: lampPost },
    { id: 'barn', role: 'outbuilding', build: barn },
    { id: 'market-stall', role: 'commerce', build: marketStall },
    { id: 'farm-plot', role: 'agriculture', build: farmPlot },
    { id: 'bridge', role: 'crossing', build: bridge },
    { id: 'watchtower', role: 'defense', build: watchtower },
  ],
};

/** Defensive and ruined boundary pieces for walls, approaches, and plateau landmarks. */
export const FORTIFICATION_KIT: PrefabKit = {
  id: 'fortification',
  name: 'Fortification',
  pieces: [
    { id: 'town-gate', role: 'gate', build: townGate },
    { id: 'wall-segment', role: 'wall', build: wallSegment, weight: 2 },
    { id: 'stairs-ramp', role: 'vertical', build: stairsRamp },
    { id: 'watchtower', role: 'tower', build: watchtower },
    { id: 'ruined-tower', role: 'ruin-tower', build: ruinedTower },
    { id: 'broken-wall', role: 'ruin-wall', build: brokenWall, weight: 2 },
  ],
};

/** Small-scale interior and dressing pieces promoted from the Frostvale authoring set. */
export const FURNITURE_KIT: PrefabKit = {
  id: 'furniture',
  name: 'Alpine Furniture',
  pieces: [
    { id: 'alpine-bed', role: 'sleeping', build: alpineBed },
    { id: 'alpine-counter', role: 'worktop', build: alpineCounter },
    { id: 'crate-stack', role: 'storage', build: crateStack },
    { id: 'alpine-hearth', role: 'hearth', build: alpineHearth },
    { id: 'alpine-lantern-post', role: 'light', build: alpineLanternPost },
    { id: 'alpine-table-set', role: 'dining', build: alpineTableSet },
  ],
};

/** Build the weighted prefab pool for selected roles (all roles when omitted). */
export function kitPrefabs(kit: PrefabKit, roles?: readonly string[]): Prefab[] {
  const selected = roles ? new Set(roles) : undefined;
  const prefabs: Prefab[] = [];
  for (const piece of kit.pieces) {
    if (selected && !selected.has(piece.role)) continue;
    const weight = Math.max(1, Math.floor(piece.weight ?? 1));
    for (let i = 0; i < weight; i++) prefabs.push(piece.build());
  }
  return prefabs;
}

/** Structural kit validation for tests and future external kit loading. */
export function validatePrefabKit(kit: PrefabKit): string[] {
  const problems: string[] = [];
  if (!kit.id.trim()) problems.push('kit id is empty');
  if (!kit.name.trim()) problems.push('kit name is empty');
  const ids = new Set<string>();
  for (const piece of kit.pieces) {
    if (!piece.id.trim()) problems.push('piece id is empty');
    else if (ids.has(piece.id)) problems.push(`duplicate piece id "${piece.id}"`);
    ids.add(piece.id);
    if (!piece.role.trim()) problems.push(`"${piece.id}": role is empty`);
    if (piece.weight !== undefined && (!Number.isInteger(piece.weight) || piece.weight < 1))
      problems.push(`"${piece.id}": weight must be a positive integer`);
  }
  return problems;
}
