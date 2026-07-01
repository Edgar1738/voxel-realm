import type { EditService } from '../edit/EditService';
import type { EditOutcome, SetVoxel, WorldVoxel } from '../edit/EditTypes';
import type { CreativeInventory } from './CreativeInventory';
import type { CameraRig } from '../render/CameraRig';
import type { Renderer } from '../render/Renderer';
import type { ChunkManager } from '../world/ChunkManager';
import { raycastVoxels } from '../edit/VoxelRaycast';
import { boxVoxels, sphereVoxels, tunnelVoxels } from '../edit/Brushes';
import { AIR } from '../blocks/blocks';
import type { BlockId } from '../core/types';
import type { BlockRegistry } from '../blocks/BlockRegistry';
import { MAX_EDIT_VOXELS } from './editCap';
import { gateToggleEdit } from './useAction';
import { resolveTarget, type PreviewDeps } from './targetPreview';
import { resolveBuilderIntent, type BuilderIntent } from './builderInput';
import type { BuilderMode } from './BuilderState';

export const REACH = 6;
const TUNNEL_LENGTH = 8;
const SPHERE_RADIUS = 4;

export type Tool = 'single' | 'tunnel' | 'sphere' | 'box-clear' | 'fill' | 'replace';
export const TOOLS: Tool[] = ['single', 'tunnel', 'sphere', 'box-clear', 'fill', 'replace'];

/**
 * Block-edits gate. Edits are blocked while the inventory modal is open even if pointer
 * lock somehow persists — explicit defense-in-depth rather than relying on the open-inventory
 * → pointer-unlock coupling.
 */
export function canEdit(pointerLocked: boolean, inventoryOpen: boolean): boolean {
  return pointerLocked && !inventoryOpen;
}

/** Wheel-to-hotbar-step mapping. Returns 0 when editing is blocked or there is no scroll delta. */
export function hotbarWheelDelta(deltaY: number, canEditNow: boolean): number {
  if (!canEditNow) return 0;
  return deltaY > 0 ? 1 : deltaY < 0 ? -1 : 0;
}

export function toolLabel(tool: string): string {
  return tool
    .split('-')
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');
}

export interface InputCallbacks {
  onStatusChange: (text: string) => void;
  onToolChange: (tool: Tool) => void;
  onHotbarRender: () => void;
  onInventoryToggle: (open: boolean) => void;
  isInventoryOpen: () => boolean;
  onRun: (voxels: SetVoxel[], verb: string) => void;
  getAnchor: () => WorldVoxel | undefined;
  setAnchor: (v: WorldVoxel | undefined) => void;
  getTool: () => Tool;
  getBuildMode: () => BuilderMode;
  onBuilderIntent: (intent: BuilderIntent) => void;
  onBuilderClick: (hit: import('../edit/VoxelRaycast').VoxelRaycastHit) => void;
  onToggleGhost: () => void;
}

export interface InputContext {
  canvas: HTMLCanvasElement;
  rig: CameraRig;
  renderer: Renderer;
  manager: ChunkManager;
  inventory: CreativeInventory;
  registry: BlockRegistry;
  edit: EditService;
  previewDeps: PreviewDeps;
  callbacks: InputCallbacks;
}

export function editMessage(action: 'undo' | 'redo', outcome: EditOutcome): string {
  if (outcome === 'ok') return action === 'undo' ? 'Undid' : 'Redid';
  if (outcome === 'blocked') return `Can't ${action} here — return to that area`;
  return `Nothing to ${action}`;
}

/**
 * Registers all user-input event listeners through a single AbortController.
 * The two keydown handlers are merged into one. contextmenu is scoped to the canvas.
 * Returns `abort` — call it to remove all registered listeners.
 */
export function registerInputListeners(ctx: InputContext): () => void {
  const controller = new AbortController();
  const { signal } = controller;
  const { canvas, rig, renderer, manager, inventory, registry, edit, previewDeps, callbacks } = ctx;

  // Single merged keydown handler covering both tool shortcuts and undo/redo.
  window.addEventListener(
    'keydown',
    (e) => {
      // Inventory / tool shortcuts
      const n = Number(e.key);
      if (n >= 1 && n <= inventory.hotbar.length) {
        if (!canEdit(rig.locked, callbacks.isInventoryOpen())) return;
        inventory.selectSlot(n - 1);
        callbacks.onHotbarRender();
        return;
      }
      if (e.code === 'KeyT') {
        const next = TOOLS[(TOOLS.indexOf(callbacks.getTool()) + 1) % TOOLS.length];
        callbacks.onToolChange(next);
        return;
      }
      if (e.code === 'KeyE') {
        const open = !callbacks.isInventoryOpen();
        if (open && rig.locked) document.exitPointerLock();
        callbacks.onInventoryToggle(open);
        return;
      }
      if (e.code === 'Escape' && callbacks.isInventoryOpen()) {
        callbacks.onInventoryToggle(false);
        return;
      }
      if (e.code === 'KeyV') {
        callbacks.onToggleGhost();
        return;
      }

      const intent = resolveBuilderIntent(e.code, callbacks.getBuildMode());
      if (intent !== 'none') {
        if (intent !== 'toggleMode' && !canEdit(rig.locked, callbacks.isInventoryOpen())) return;
        callbacks.onBuilderIntent(intent);
        return;
      }

      // Undo/redo
      if (!e.ctrlKey) return;
      if (e.code === 'KeyZ' && !e.shiftKey) {
        e.preventDefault();
        callbacks.onStatusChange(editMessage('undo', edit.undo()));
      } else if (e.code === 'KeyY' || (e.code === 'KeyZ' && e.shiftKey)) {
        e.preventDefault();
        callbacks.onStatusChange(editMessage('redo', edit.redo()));
      }
    },
    { signal },
  );

  // Right-click context menu suppressed only for the canvas (not globally).
  canvas.addEventListener('contextmenu', (e) => e.preventDefault(), { signal });

  canvas.addEventListener(
    'wheel',
    (e) => {
      const delta = hotbarWheelDelta(e.deltaY, canEdit(rig.locked, callbacks.isInventoryOpen()));
      if (delta === 0) return;
      inventory.cycleSlot(delta);
      callbacks.onHotbarRender();
    },
    { signal, passive: true },
  );

  // Mouse editing (placed on document so it fires while pointer is locked).
  document.addEventListener(
    'mousedown',
    (e) => {
      if (!canEdit(rig.locked, callbacks.isInventoryOpen())) return;
      const hit = raycastVoxels(
        { getBlock: (x, y, z) => manager.getBlock(x, y, z) },
        renderer.camera.position,
        rig.forward(),
        REACH,
      );
      if (!hit) return;
      const selected = inventory.selectedBlock;

      if (callbacks.getBuildMode() !== 'off') {
        if (e.button === 0) callbacks.onBuilderClick(hit);
        else if (e.button === 2) callbacks.onBuilderIntent('cancel');
        return; // Build mode suspends normal break/place/pick
      }

      if (e.button === 1) {
        if (hit.id !== AIR) inventory.pickBlock(hit.id);
        callbacks.onHotbarRender();
        return;
      }
      if (e.button === 2) {
        const resolved = resolveTarget(hit, selected, rig.yaw, previewDeps);
        if (resolved.kind === 'toggle') {
          const state = manager.getState(hit.block.x, hit.block.y, hit.block.z);
          callbacks.onRun([gateToggleEdit(hit.block, hit.id, state)], 'Toggled');
          return;
        }
        const voxel: SetVoxel = {
          x: resolved.ghost.x,
          y: resolved.ghost.y,
          z: resolved.ghost.z,
          id: resolved.ghost.id,
          state: resolved.ghost.state,
        };
        callbacks.onRun([voxel], 'Placed');
        return;
      }
      if (e.button !== 0) return;

      const tool = callbacks.getTool();
      if (tool === 'single') {
        callbacks.onRun([{ ...hit.block, id: AIR }], 'Broke');
      } else if (tool === 'tunnel') {
        const dir = { x: -hit.normal.x, y: -hit.normal.y, z: -hit.normal.z };
        callbacks.onRun(asAir(tunnelVoxels(hit.adjacent, dir, TUNNEL_LENGTH, 1)), 'Tunneled');
      } else if (tool === 'sphere') {
        callbacks.onRun(asAir(sphereVoxels(hit.block, SPHERE_RADIUS)), 'Dug');
      } else {
        handleSelection(hit.block, selected, tool, manager, registry, callbacks);
      }
    },
    { signal },
  );

  return () => controller.abort();
}

function handleSelection(
  target: WorldVoxel,
  selected: BlockId,
  tool: Tool,
  manager: ChunkManager,
  registry: BlockRegistry,
  callbacks: InputCallbacks,
): void {
  const anchor = callbacks.getAnchor();
  if (!anchor) {
    callbacks.setAnchor(target);
    callbacks.onStatusChange('Selection started — click the opposite corner');
    return;
  }
  callbacks.setAnchor(undefined);

  const volume =
    (Math.abs(target.x - anchor.x) + 1) *
    (Math.abs(target.y - anchor.y) + 1) *
    (Math.abs(target.z - anchor.z) + 1);

  // The volume check here is a pre-generation guard; withinEditCap handles the
  // post-generation brush check in run().
  if (volume > MAX_EDIT_VOXELS) {
    callbacks.onStatusChange(`Selection too large (${volume} > ${MAX_EDIT_VOXELS})`);
    return;
  }

  const region = boxVoxels(anchor, target);

  if (tool === 'box-clear') {
    callbacks.onRun(asAir(region), 'Cleared');
  } else if (tool === 'fill') {
    callbacks.onRun(asId(region, selected), 'Filled');
  } else {
    const replaceId = manager.getBlock(target.x, target.y, target.z);
    const matches = region.filter((v) => manager.getBlock(v.x, v.y, v.z) === replaceId);
    callbacks.onRun(asId(matches, selected), `Replaced ${registry.get(replaceId).name}`);
  }
}

function asAir(voxels: WorldVoxel[]): SetVoxel[] {
  return voxels.map((v) => ({ ...v, id: AIR }));
}

function asId(voxels: WorldVoxel[], id: BlockId): SetVoxel[] {
  return voxels.map((v) => ({ ...v, id }));
}
