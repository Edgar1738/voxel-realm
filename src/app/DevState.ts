import { worldToChunkCoord } from '../core/coords';
import type { BlockId, Vec3 } from '../core/types';
import type { WorldPreset } from '../worldgen/Presets';

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
}

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
}

export function collectDevState(ctx: DevStateContext): DevState {
  return {
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
}
