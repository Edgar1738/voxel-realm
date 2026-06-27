import { describe, it, expect } from 'vitest';
import { formatDevHudRows } from '../src/app/DevHud';
import type { DevState } from '../src/app/DevState';

describe('formatDevHudRows', () => {
  it('formats the shared dev state into stable HUD rows', () => {
    const state: DevState = {
      pos: { x: 34.84, y: 91.2, z: -17.44 },
      chunk: { cx: 2, cz: -2 },
      yaw: Math.PI / 2,
      pitch: -Math.PI / 4,
      selectedBlock: 'stone',
      preset: 'amplified',
      worldName: 'village',
      loadedChunkCount: 42,
      flyMode: 'fly',
    };

    expect(formatDevHudRows(state)).toEqual([
      { label: 'Pos', value: '34.8 91.2 -17.4' },
      { label: 'Chunk', value: '2 -2' },
      { label: 'Look', value: '90.0 -45.0' },
      { label: 'Block', value: 'stone' },
      { label: 'World', value: 'village' },
      { label: 'Preset', value: 'amplified' },
      { label: 'Chunks', value: '42' },
      { label: 'Mode', value: 'fly' },
    ]);
  });
});
