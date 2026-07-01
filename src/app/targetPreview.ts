import type { VoxelRaycastHit } from '../edit/VoxelRaycast';
import type { BlockId } from '../core/types';

/** Runtime dependencies the pure resolver needs, injected so it stays testable. */
export interface PreviewDeps {
  /** Right-clicking this block id resolves to a toggle/use, not a placement. */
  isToggleable(id: BlockId): boolean;
  /** Shape name of a block id ('cube' | 'slab' | 'stair' | 'gate' | 'cross' | ...). */
  shapeOf(id: BlockId): string;
  /** Orientation/open state derived from the player yaw (for stairs/gates). */
  stateFromYaw(yaw: number): number;
  /** Whether an edit at (x,y,z) would land in a loaded, in-range chunk (mirrors the edit path). */
  canPlaceAt(x: number, y: number, z: number): boolean;
}

/** The interaction a hit resolves to, shared by the click path and the live preview. */
export type ResolvedTarget =
  | { kind: 'toggle'; outline: { x: number; y: number; z: number }; targetId: BlockId }
  | {
      kind: 'place';
      outline: { x: number; y: number; z: number };
      ghost: { x: number; y: number; z: number; id: BlockId; state: number; valid: boolean };
    };

/**
 * Decides what a hit means: right-clicking a toggleable block is a use/toggle (outline only),
 * otherwise it is a placement at the adjacent cell (outline + ghost). The ghost carries the
 * yaw-derived state for stairs/gates and a `valid` flag from `canPlaceAt`. Pure and deterministic.
 */
export function resolveTarget(
  hit: VoxelRaycastHit,
  selected: BlockId,
  yaw: number,
  deps: PreviewDeps,
): ResolvedTarget {
  const outline = { x: hit.block.x, y: hit.block.y, z: hit.block.z };
  if (deps.isToggleable(hit.id)) {
    return { kind: 'toggle', outline, targetId: hit.id };
  }
  const shape = deps.shapeOf(selected);
  const state = shape === 'stair' || shape === 'gate' ? deps.stateFromYaw(yaw) : 0;
  const g = hit.adjacent;
  return {
    kind: 'place',
    outline,
    ghost: { x: g.x, y: g.y, z: g.z, id: selected, state, valid: deps.canPlaceAt(g.x, g.y, g.z) },
  };
}
