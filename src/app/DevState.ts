import { worldToChunkCoord } from '../core/coords';
import type { BlockId, Vec3 } from '../core/types';
import type { WorldPreset } from '../worldgen/Presets';
import type { ProfilerSummary } from './FrameProfiler';

/** Rolling roam-performance readout (P0); present only when a profiler is wired in. */
export interface DevPerf {
  fps: number;
  updMsP50: number;
  updMsMax: number;
  meshPeak: number;
  genPeak: number;
}

export interface DevState {
  pos: Vec3;
  chunk: { cx: number; cz: number };
  yaw: number;
  pitch: number;
  selectedBlock: string;
  preset: WorldPreset;
  worldName: string;
  loadedChunkCount: number;
  flyMode: 'fly' | 'walk';
  perf?: DevPerf;
}

/** How many recent frames the HUD perf readout averages over (~2s at 60fps). */
const RECENT_FRAMES = 120;

export interface DevStateContext {
  player: {
    position: Vec3;
    flying: boolean;
  };
  rig: {
    yaw: number;
    pitch: number;
  };
  manager: {
    loadedChunkCount(): number;
  };
  inventory: {
    selectedBlock: BlockId;
  };
  registry: {
    get(id: BlockId): { name: string };
  };
  preset: WorldPreset;
  worldName: string;
  profiler?: { recentSummary(count: number): ProfilerSummary };
}

export function collectDevState(ctx: DevStateContext): DevState {
  const state: DevState = {
    pos: { ...ctx.player.position },
    chunk: {
      cx: worldToChunkCoord(ctx.player.position.x),
      cz: worldToChunkCoord(ctx.player.position.z),
    },
    yaw: ctx.rig.yaw,
    pitch: ctx.rig.pitch,
    selectedBlock: ctx.registry.get(ctx.inventory.selectedBlock).name,
    preset: ctx.preset,
    worldName: ctx.worldName,
    loadedChunkCount: ctx.manager.loadedChunkCount(),
    flyMode: ctx.player.flying ? 'fly' : 'walk',
  };
  if (ctx.profiler) {
    const s = ctx.profiler.recentSummary(RECENT_FRAMES);
    state.perf = {
      fps: s.meanFps,
      updMsP50: s.updateMs.p50,
      updMsMax: s.updateMs.max,
      meshPeak: s.peakMeshesPerFrame,
      genPeak: s.peakGensPerFrame,
    };
  }
  return state;
}
