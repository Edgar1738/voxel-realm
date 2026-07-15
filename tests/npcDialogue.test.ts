import { describe, expect, it } from 'vitest';
import { NPC_CATALOG } from '../src/npc/NpcCatalog';
import { resolveNpcDialogue } from '../src/npc/NpcDialogue';
import type { NpcDialogueContext } from '../src/npc/NpcTypes';

const base: NpcDialogueContext = {
  challengeRunning: false,
  crownCircuitState: 'inactive',
  crownFound: 0,
  crownTotal: 3,
};

describe('NPC dialogue resolution', () => {
  it('offers Piper start or restart according to the live run', () => {
    const idle = resolveNpcDialogue(NPC_CATALOG.piper, 'root', base)!;
    expect(idle.actions.map((action) => action.id)).toContain('start');
    expect(idle.actions.map((action) => action.id)).not.toContain('restart');

    const running = resolveNpcDialogue(NPC_CATALOG.piper, 'root', {
      ...base,
      challengeRunning: true,
    })!;
    expect(running.actions.map((action) => action.id)).toContain('restart');
    expect(running.actions.map((action) => action.id)).not.toContain('start');
  });

  it('reflects Piper best time and Aurelia circuit progress in dynamic copy', () => {
    expect(
      resolveNpcDialogue(NPC_CATALOG.piper, 'root', {
        ...base,
        challengeBestSeconds: 65,
      })?.message,
    ).toContain('1:05.0');
    expect(
      resolveNpcDialogue(NPC_CATALOG.aurelia, 'root', {
        ...base,
        crownCircuitState: 'active',
        crownFound: 2,
      })?.message,
    ).toContain('2 of 3');
  });
});
