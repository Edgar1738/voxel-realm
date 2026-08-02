import { describe, expect, it } from 'vitest';
import { validatePrefab } from '../src/core/Prefab';
import {
  FORTIFICATION_KIT,
  FURNITURE_KIT,
  SETTLEMENT_KIT,
  kitPrefabs,
  validatePrefabKit,
  type PrefabKit,
} from '../src/worldgen/PrefabKits';

describe('PrefabKits', () => {
  it('ships structurally valid named kits whose pieces build valid prefabs', () => {
    for (const kit of [SETTLEMENT_KIT, FORTIFICATION_KIT, FURNITURE_KIT]) {
      expect(validatePrefabKit(kit)).toEqual([]);
      for (const prefab of kitPrefabs(kit)) expect(validatePrefab(prefab)).toBeNull();
    }
  });

  it('promotes the complete Frostvale furniture set into typed reusable pieces', () => {
    expect(FURNITURE_KIT.pieces.map((piece) => piece.id)).toEqual([
      'alpine-bed',
      'alpine-counter',
      'crate-stack',
      'alpine-hearth',
      'alpine-lantern-post',
      'alpine-table-set',
    ]);
    expect(kitPrefabs(FURNITURE_KIT)).toHaveLength(6);
  });

  it('selects roles in kit order and expands integer weights', () => {
    const village = kitPrefabs(SETTLEMENT_KIT, ['dwelling', 'civic', 'light']);
    expect(village).toHaveLength(4); // cottage x2, well, lamp
    expect(village[0]).toEqual(village[1]);
    expect(kitPrefabs(FORTIFICATION_KIT, ['ruin-tower', 'ruin-wall'])).toHaveLength(3);
  });

  it('returns an empty pool for unknown roles', () => {
    expect(kitPrefabs(SETTLEMENT_KIT, ['unknown'])).toEqual([]);
  });

  it('reports duplicate ids and invalid weights', () => {
    const invalid: PrefabKit = {
      id: 'bad',
      name: 'Bad',
      pieces: [
        { id: 'same', role: 'x', build: () => ({ dims: [1, 1, 1], blocks: [] }) },
        { id: 'same', role: '', weight: 0, build: () => ({ dims: [1, 1, 1], blocks: [] }) },
      ],
    };
    expect(validatePrefabKit(invalid).join(' ')).toMatch(/duplicate.*role.*weight/i);
  });
});
