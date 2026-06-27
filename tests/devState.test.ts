import { describe, it, expect } from 'vitest';
import { collectDevState } from '../src/app/DevState';
import { STONE } from '../src/blocks/blocks';
import type { BlockId } from '../src/core/types';

describe('collectDevState', () => {
  it('returns the shared dev snapshot used by __vr.state and DevHud', () => {
    const state = collectDevState({
      player: {
        position: { x: 34.8, y: 91.2, z: -17.4 },
        flying: true,
      },
      rig: {
        yaw: Math.PI / 2,
        pitch: -Math.PI / 4,
      },
      manager: {
        loadedChunkCount: () => 42,
      },
      inventory: {
        selectedBlock: STONE as BlockId,
      },
      registry: {
        get: (id: BlockId) => ({ id, name: id === STONE ? 'stone' : 'unknown' }),
      },
      preset: 'amplified',
      worldName: 'village',
    });

    expect(state).toEqual({
      pos: { x: 34.8, y: 91.2, z: -17.4 },
      chunk: { cx: 2, cz: -2 },
      yaw: Math.PI / 2,
      pitch: -Math.PI / 4,
      selectedBlock: 'stone',
      preset: 'amplified',
      worldName: 'village',
      loadedChunkCount: 42,
      flyMode: 'fly',
    });
  });
});
