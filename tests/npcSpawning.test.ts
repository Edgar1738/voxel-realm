import { describe, expect, it, vi } from 'vitest';
import { MemorySaveStore } from '../src/persistence/SaveStore';
import { parseWorldSnapshot } from '../src/persistence/WorldSnapshot';
import { NPC_CATALOG, npcCatalogEntries, npcCatalogEntry } from '../src/npc/NpcCatalog';
import {
  NPC_ROTATION_STEP,
  NpcPlacementState,
  resolveNpcPlacement,
  type NpcPlacementChecks,
} from '../src/npc/NpcPlacement';
import { NpcSystem } from '../src/npc/NpcSystem';

const GROUND_HIT = {
  block: { x: 4, y: 10, z: -3 },
  adjacent: { x: 4, y: 11, z: -3 },
  normal: { x: 0, y: 1, z: 0 },
  point: { x: 4.5, y: 11, z: -2.5 },
  id: 1,
};

const validChecks = (overrides: Partial<NpcPlacementChecks> = {}): NpcPlacementChecks => ({
  isLoaded: () => true,
  supportTopAt: () => 11,
  bodyClear: () => true,
  playerClear: () => true,
  npcClear: () => true,
  ...overrides,
});

describe('creative NPC spawning', () => {
  it('enumerates every spawnable definition directly from the catalog', () => {
    const entries = npcCatalogEntries();
    expect(entries.map(({ type }) => type).sort()).toEqual(Object.keys(NPC_CATALOG).sort());
    for (const entry of entries) {
      expect(entry.definition.name).toBeTruthy();
      expect(npcCatalogEntry(entry.type)).toEqual(entry);
      expect(npcCatalogEntry(entry.definition.id)).toEqual(entry);
    }
  });

  it('places a catalog NPC centered on valid walkable ground', () => {
    const placed = resolveNpcPlacement(GROUND_HIT, NPC_CATALOG.piper, Math.PI / 2, validChecks());
    expect(placed).toEqual({
      position: { x: 4.5, y: 11.9, z: -2.5 },
      yaw: Math.PI / 2,
      valid: true,
    });
  });

  it.each([
    ['unloaded terrain', { isLoaded: () => false }, 'Ground is not loaded'],
    ['non-walkable support', { supportTopAt: () => undefined }, 'Aim at solid walkable ground'],
    ['solid overlap', { bodyClear: () => false }, 'NPC would overlap solid blocks'],
    ['player overlap', { playerClear: () => false }, 'NPC would overlap the player'],
    ['NPC overlap', { npcClear: () => false }, 'NPC would overlap another NPC'],
  ])('rejects %s', (_label, override, reason) => {
    const placed = resolveNpcPlacement(GROUND_HIT, NPC_CATALOG.piper, 0, validChecks(override));
    expect(placed).toMatchObject({ valid: false, reason });
  });

  it('rotates in repeatable steps and cancels without losing catalog state elsewhere', () => {
    const placement = new NpcPlacementState();
    placement.select('piper', 'Piper Green');
    expect(placement.rotate(1)?.yaw).toBeCloseTo(NPC_ROTATION_STEP);
    expect(placement.rotate(-1)?.yaw).toBeCloseTo(0);
    expect(placement.cancel()).toBe(true);
    expect(placement.selection).toBeUndefined();
    expect(placement.cancel()).toBe(false);
  });

  it('generates stable unique IDs, removes spawned NPCs, and protects authored NPCs', () => {
    const changed = vi.fn();
    const system = new NpcSystem([NPC_CATALOG.piper], {
      idFactory: () => 'same-id',
      onSpawnedChange: changed,
    });
    const first = system.spawn('aurelia', { x: 10.5, y: 20.9, z: 10.5 }, 0);
    const second = system.spawn('aurelia', { x: 12.5, y: 20.9, z: 10.5 }, Math.PI);

    expect(first.id).toBe('spawned-aurelia-same-id');
    expect(second.id).toBe('spawned-aurelia-same-id-2');
    expect(system.remove('piper-green')).toBe(false);
    expect(system.remove(first.id)).toBe(true);
    expect(system.definitions.map(({ id }) => id)).toEqual(['piper-green', second.id]);
    expect(changed).toHaveBeenCalledTimes(3);
    system.dispose();
  });

  it('round-trips exactly one spawned NPC with transform, pose, animation, and equipment', async () => {
    const store = new MemorySaveStore();
    const original = new NpcSystem([], { idFactory: () => 'roundtrip' });
    const definition = original.spawn('piper', { x: 8.5, y: 42.9, z: -6.5 }, Math.PI / 4);
    expect(original.playAnimation(definition.id, 'wave-loop')).toBe(true);
    expect(original.equip(definition.id, 'off', 'sword')).toBe(true);
    const saved = original.spawnedStates();
    await store.saveMeta({ seed: 1337, version: 1, spawnedNpcs: saved });
    original.dispose();

    const loadedMeta = await store.loadMeta();
    const restored = new NpcSystem([], { spawned: loadedMeta?.spawnedNpcs ?? [] });
    expect(restored.spawnedStates()).toEqual(saved);
    expect(restored.definitions).toHaveLength(1);
    expect(restored.definitions[0]?.id).toBe(definition.id);
    restored.dispose();
  });

  it('drops malformed and duplicate saved NPC records before restoration', () => {
    const state = {
      id: 'spawned-piper-one',
      type: 'piper',
      position: { x: 1.5, y: 5.9, z: 2.5 },
      yaw: 0,
    };
    const { snapshot } = parseWorldSnapshot(
      {
        meta: {
          seed: 1337,
          version: 1,
          spawnedNpcs: [state, { ...state, yaw: 2 }, { ...state, id: '', yaw: 3 }],
        },
        chunks: {},
      },
      { isValidBlockId: () => true },
    );
    expect(snapshot.meta?.spawnedNpcs).toEqual([state]);

    const restored = new NpcSystem([], { spawned: snapshot.meta?.spawnedNpcs ?? [] });
    expect(restored.spawnedStates()).toHaveLength(1);
    restored.dispose();
  });
});
