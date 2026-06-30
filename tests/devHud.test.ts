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

  it('appends roam perf rows when perf is present', () => {
    const state: DevState = {
      pos: { x: 0, y: 80, z: 0 },
      chunk: { cx: 0, cz: 0 },
      yaw: 0,
      pitch: 0,
      selectedBlock: 'stone',
      preset: 'default',
      worldName: 'default',
      loadedChunkCount: 9,
      flyMode: 'fly',
      perf: { fps: 59.6, updMsP50: 1.2, updMsMax: 4.5, meshPeak: 3, genPeak: 2 },
    };

    expect(formatDevHudRows(state)).toEqual([
      { label: 'Pos', value: '0.0 80.0 0.0' },
      { label: 'Chunk', value: '0 0' },
      { label: 'Look', value: '0.0 0.0' },
      { label: 'Block', value: 'stone' },
      { label: 'World', value: 'default' },
      { label: 'Preset', value: 'default' },
      { label: 'Chunks', value: '9' },
      { label: 'Mode', value: 'fly' },
      { label: 'FPS', value: '60' },
      { label: 'Upd ms', value: '1.2 / 4.5' },
      { label: 'Mesh/f', value: '3' },
      { label: 'Gen/f', value: '2' },
    ]);
  });
});
