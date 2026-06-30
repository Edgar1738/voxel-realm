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

  it('attaches roam perf rows when a profiler is supplied', () => {
    const summary = {
      framesSampled: 120,
      meanFps: 60,
      frameMs: { p50: 16, p95: 20, p99: 25, max: 30 },
      updateMs: { p50: 1.2, p95: 3, p99: 4, max: 4.5 },
      totalGens: 10,
      totalMeshes: 40,
      peakGensPerFrame: 2,
      peakMeshesPerFrame: 3,
      longFrames16: 5,
      longFrames33: 1,
    };
    const state = collectDevState({
      player: { position: { x: 0, y: 80, z: 0 }, flying: true },
      rig: { yaw: 0, pitch: 0 },
      manager: { loadedChunkCount: () => 9 },
      inventory: { selectedBlock: STONE as BlockId },
      registry: { get: (id: BlockId) => ({ id, name: 'stone' }) },
      preset: 'default',
      worldName: 'default',
      profiler: { recentSummary: () => summary },
    });

    expect(state.perf).toEqual({ fps: 60, updMsP50: 1.2, updMsMax: 4.5, meshPeak: 3, genPeak: 2 });
  });

  it('omits perf when no profiler is supplied', () => {
    const state = collectDevState({
      player: { position: { x: 0, y: 80, z: 0 }, flying: false },
      rig: { yaw: 0, pitch: 0 },
      manager: { loadedChunkCount: () => 0 },
      inventory: { selectedBlock: STONE as BlockId },
      registry: { get: (id: BlockId) => ({ id, name: 'stone' }) },
      preset: 'default',
      worldName: 'default',
    });
    expect(state.perf).toBeUndefined();
  });
});
