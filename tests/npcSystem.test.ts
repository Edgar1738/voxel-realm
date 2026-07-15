import { describe, expect, it } from 'vitest';
import { NPC_CATALOG, npcDefinitionsForPreset } from '../src/npc/NpcCatalog';
import { NpcSystem } from '../src/npc/NpcSystem';

describe('NPC catalog and collision', () => {
  it('places the two characters only in their authored worlds', () => {
    expect(npcDefinitionsForPreset('cloudspire-citadel').map((npc) => npc.id)).toEqual([
      'lady-aurelia',
    ]);
    expect(npcDefinitionsForPreset('sunmeadow-trials').map((npc) => npc.id)).toEqual([
      'piper-green',
    ]);
    expect(npcDefinitionsForPreset('default')).toEqual([]);
  });

  it('exposes Piper’s collision box from every cell it overlaps', () => {
    const system = new NpcSystem([NPC_CATALOG.piper]);
    // Box spans y 63.0–64.8 within column (0, 18): both vertical cells report it.
    expect(system.collisionBoxesAt(0, 63, 18)).toHaveLength(1);
    expect(system.collisionBoxesAt(0, 64, 18)).toHaveLength(1);
    expect(system.collisionBoxesAt(-1, 63, 18)).toEqual([]);
    expect(system.collisionBoxesAt(0, 65, 18)).toEqual([]);
    expect(system.intersectsVoxel(0, 63, 18)).toBe(true);
    system.dispose();
  });

  it('reports a box straddling a column boundary from both columns', () => {
    const straddler = {
      ...NPC_CATALOG.piper,
      id: 'straddler',
      position: { x: 0, y: 63.9, z: 18.5 }, // box x spans -0.34..0.34 across columns -1 and 0
    };
    const system = new NpcSystem([straddler]);
    expect(system.collisionBoxesAt(0, 63, 18)).toHaveLength(1);
    expect(system.collisionBoxesAt(-1, 63, 18)).toHaveLength(1);
    expect(system.collisionBoxesAt(1, 63, 18)).toEqual([]);
    system.dispose();
  });

  it('shares wrist equipment state across NPC actors and system commands', () => {
    const system = new NpcSystem([NPC_CATALOG.piper, NPC_CATALOG.aurelia]);
    expect(system.equipmentState('piper-green')).toEqual({});
    expect(system.equipmentState('lady-aurelia')).toEqual({ main: 'sword' });
    expect(system.equip('piper-green', 'off', 'sword')).toBe(true);
    expect(system.equipmentState('piper-green')).toEqual({ off: 'sword' });
    expect(system.unequip('piper-green', 'main')).toBe(true);
    expect(system.equipmentState('piper-green')).toEqual({ off: 'sword' });
    expect(system.equip('missing', 'main', 'sword')).toBe(false);
    system.dispose();
  });
});
