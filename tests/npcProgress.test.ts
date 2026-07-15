import { describe, expect, it } from 'vitest';
import {
  clearNpcProgress,
  loadNpcProgress,
  npcProgressKey,
  saveNpcProgress,
} from '../src/npc/NpcProgress';

function storage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
    values,
  };
}

describe('NPC progress', () => {
  it('round-trips valid progress and clears it with the world', () => {
    const store = storage();
    saveNpcProgress(store, 'sunmeadow', { crownCircuit: 'active', piperBestSeconds: 42.5 });
    expect(loadNpcProgress(store, 'sunmeadow')).toEqual({
      crownCircuit: 'active',
      piperBestSeconds: 42.5,
    });
    clearNpcProgress(store, 'sunmeadow');
    expect(store.values.has(npcProgressKey('sunmeadow'))).toBe(false);
  });

  it('defensively repairs malformed or impossible values', () => {
    const store = storage();
    store.setItem(npcProgressKey('broken'), '{bad json');
    expect(loadNpcProgress(store, 'broken')).toEqual({ crownCircuit: 'inactive' });
    store.setItem(
      npcProgressKey('invalid'),
      JSON.stringify({ crownCircuit: 'wat', piperBestSeconds: -5 }),
    );
    expect(loadNpcProgress(store, 'invalid')).toEqual({ crownCircuit: 'inactive' });
  });
});
