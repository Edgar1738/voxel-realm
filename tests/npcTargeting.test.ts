import { describe, expect, it } from 'vitest';
import type { NpcDefinition } from '../src/npc/NpcTypes';
import { findNpcTarget, rayAabbDistance } from '../src/npc/NpcTargeting';

function npc(id: string, z: number): NpcDefinition {
  return {
    id,
    name: id,
    role: 'tester',
    position: { x: 0.5, y: 0.9, z },
    yaw: 0,
    palette: {},
    parts: [],
    dialogue: { start: 'root', nodes: [{ id: 'root', message: '', actions: [] }] },
  };
}

describe('NPC targeting', () => {
  const origin = { x: 0.5, y: 1.6, z: 0.5 };
  const forward = { x: 0, y: 0, z: -1 };

  it('finds the nearest aimed NPC', () => {
    expect(findNpcTarget([npc('far', -4.5), npc('near', -2.5)], origin, forward)?.id).toBe('near');
  });

  it('does not target through an earlier solid voxel', () => {
    expect(findNpcTarget([npc('hidden', -3.5)], origin, forward, 5, 2)).toBeUndefined();
  });

  it('rejects misses and zero-length rays', () => {
    expect(findNpcTarget([npc('off-axis', -2.5)], origin, { x: 1, y: 0, z: 0 })).toBeUndefined();
    expect(rayAabbDistance(origin, { x: 0, y: 0, z: 0 }, [0, 0, 0, 1, 1, 1])).toBeUndefined();
  });
});
