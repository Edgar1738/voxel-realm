import type { EditService } from '../edit/EditService';
import type { EditOutcome, SetVoxel, WorldVoxel } from '../edit/EditTypes';
import type { CreativeInventory } from './CreativeInventory';
import type { CameraRig } from '../render/CameraRig';
import type { ChunkManager } from '../world/ChunkManager';
import { raycastVoxels, type VoxelRaycastHit } from '../edit/VoxelRaycast';
import { boxVoxels, sphereVoxels, tunnelConfigVoxels, type TunnelConfig } from '../edit/Brushes';
import { AIR } from '../blocks/blocks';
import type { BlockId } from '../core/types';
import type { BlockRegistry } from '../blocks/BlockRegistry';
import { MAX_EDIT_VOXELS } from './editCap';
import { gateToggleEdit } from './useAction';
import { resolveTarget, type PreviewDeps } from './targetPreview';
import type { InteractionRay } from './aim';
import { resolveBuilderIntent, type BuilderIntent } from './builderInput';
import type { BuilderMode } from './BuilderState';
import type { ExperienceMode } from './experienceMode';

export const DEFAULT_REACH = 6;
export const MIN_REACH = 4;
export const MAX_REACH = 64;
export const REACH_STEP = 2;
const REACH_STORAGE_KEY = 'vr.buildReach';
const SPHERE_RADIUS = 4;

/** Default tunnel shape: a walkable 3x3 bore, 8 blocks deep, straight ahead. */
export const DEFAULT_TUNNEL_CONFIG: TunnelConfig = { size: 3, length: 8, path: 'straight' };

/** Hold-to-repeat cadence per action (ms between edits while the button is held). */
export const SINGLE_REPEAT_MS = 100; // 10 digs/sec
export const PLACE_REPEAT_MS = 100; // 10 places/sec
export const TUNNEL_REPEAT_MS = 250; // 4 tunnel digs/sec — each dig moves many voxels

/** Clamps a reach value to the valid range, snapping to the step grid from MIN_REACH. */
export function clampReach(value: number): number {
  const steps = Math.round((value - MIN_REACH) / REACH_STEP);
  const snapped = MIN_REACH + steps * REACH_STEP;
  return Math.min(MAX_REACH, Math.max(MIN_REACH, snapped));
}

/** Reach adjustment from a shift+wheel delta: positive deltaY (scroll down) decreases reach. */
export function reachWheelDelta(deltaY: number): number {
  return deltaY > 0 ? -REACH_STEP : deltaY < 0 ? REACH_STEP : 0;
}

/** Minimal Storage surface, matching BlueprintStore's StringStore, for persisting reach. */
export interface ReachStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** Loads the persisted reach, or DEFAULT_REACH if absent/invalid. */
export function loadReach(storage: ReachStorage): number {
  const raw = storage.getItem(REACH_STORAGE_KEY);
  const n = raw === null ? NaN : Number(raw);
  return Number.isFinite(n) ? clampReach(n) : DEFAULT_REACH;
}

/** Persists the reach value. */
export function saveReach(storage: ReachStorage, value: number): void {
  storage.setItem(REACH_STORAGE_KEY, String(value));
}

/** Mutable current build reach, module-scoped so preview/paste/selection/click share one value. */
let currentReach = DEFAULT_REACH;

export function getReach(): number {
  return currentReach;
}

export function setReach(value: number): void {
  currentReach = clampReach(value);
}

/** Back-compat alias for call sites/tests expecting the old constant name. */
export const REACH = DEFAULT_REACH;

const HOLD_REPEAT_STORAGE_KEY = 'vr.holdRepeat';

/** Mutable hold-to-repeat switch; when off, a held button only ever edits once. */
let holdRepeatEnabled = true;

export function getHoldRepeat(): boolean {
  return holdRepeatEnabled;
}

export function setHoldRepeat(enabled: boolean): void {
  holdRepeatEnabled = enabled;
}

/** Loads the persisted hold-to-repeat setting; defaults to enabled. */
export function loadHoldRepeat(storage: ReachStorage): boolean {
  return storage.getItem(HOLD_REPEAT_STORAGE_KEY) !== 'off';
}

/** Persists the hold-to-repeat setting. */
export function saveHoldRepeat(storage: ReachStorage, enabled: boolean): void {
  storage.setItem(HOLD_REPEAT_STORAGE_KEY, enabled ? 'on' : 'off');
}

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

/**
 * Play-mode gate for creative inputs (edits, hotbar, tools, inventory, builder, undo/redo).
 * In `play` every world-changing input is inert; only movement/look/fly (CameraRig), sound,
 * the headlamp, and the B key (enter build mode) pass through.
 */
export function creativeInputAllowed(mode: ExperienceMode): boolean {
  return mode === 'build';
}

/** The hint shown when a build-only key is pressed while exploring in play mode. */
export const PLAY_MODE_BUILD_HINT = 'Play mode — press B to build';

/**
 * Message to show when a key is pressed in play (explore) mode that would only do something
 * in build mode, or `undefined` to stay silent. Deliberately narrow: it fires only for the
 * keys a player would press *expecting to build right now* — the hotbar digits (matched on
 * `key`, since slot selection reads the typed digit, not the physical `code`), the inventory
 * (I), and the placement-ghost toggle (V). It skips modifier combos (Ctrl+Z/Y undo/redo) and
 * the selection/paste sub-mode keys (X/G/R/C/[/]/arrows/…), because those need more than a
 * single B press to become usable, so "press B to build" would be misleading. Pure; the caller
 * is responsible for only invoking it while actually in-game (pointer locked, no dialog open).
 */
export function playModeGatedMessage(code: string, key: string, ctrl: boolean): string | undefined {
  if (ctrl) return undefined;
  if (/^[1-9]$/.test(key)) return PLAY_MODE_BUILD_HINT;
  if (code === 'KeyI' || code === 'KeyV') return PLAY_MODE_BUILD_HINT;
  return undefined;
}

/** Wheel-to-hotbar-step mapping. Returns 0 when editing is blocked or there is no scroll delta. */
export function hotbarWheelDelta(deltaY: number, canEditNow: boolean): number {
  if (!canEditNow) return 0;
  return deltaY > 0 ? 1 : deltaY < 0 ? -1 : 0;
}

/**
 * True when the unit voxel at (x,y,z) overlaps a player AABB of `half` extents centered
 * at `center`. Used to refuse placements that would embed the player in a block.
 */
export function voxelIntersectsPlayer(
  x: number,
  y: number,
  z: number,
  center: { x: number; y: number; z: number },
  half: { x: number; y: number; z: number },
): boolean {
  return (
    x < center.x + half.x &&
    x + 1 > center.x - half.x &&
    y < center.y + half.y &&
    y + 1 > center.y - half.y &&
    z < center.z + half.z &&
    z + 1 > center.z - half.z
  );
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
  /** Current tunnel shape settings (size/length/path), owned by the game state. */
  getTunnelConfig: () => TunnelConfig;
  /** True when placing a block at this voxel would embed the player (placement refused). */
  intersectsPlayer: (x: number, y: number, z: number) => boolean;
  getBuildMode: () => BuilderMode;
  /** Current experience mode; `play` gates every creative input below. */
  getExperienceMode: () => ExperienceMode;
  /** Invoked when B is pressed in play mode (switch to build). */
  onEnterBuild: () => void;
  /** Invoked when T is pressed in play mode — toggles the world tour (start if idle, else end). */
  onToggleTour: () => void;
  onBuilderIntent: (intent: BuilderIntent) => void;
  onBuilderClick: (hit: import('../edit/VoxelRaycast').VoxelRaycastHit) => void;
  onToggleGhost: () => void;
  onToggleHeadlamp: () => void;
  /** Invoked when H is pressed (both modes) — cycles the first-person hand mode. */
  onCycleHand: () => void;
  /** Invoked when M is pressed (both modes) — toggles the world map. Mirror moved to U. */
  onToggleMap: () => void;
  /** Invoked when F1 is pressed — toggles first/third-person (works in play and build modes). */
  onToggleView: () => void;
  /** Invoked after a Shift+wheel reach change, with the new reach value. */
  onReachChange: (reach: number) => void;
}

export interface InputContext {
  canvas: HTMLCanvasElement;
  rig: CameraRig;
  manager: ChunkManager;
  inventory: CreativeInventory;
  registry: BlockRegistry;
  edit: EditService;
  previewDeps: PreviewDeps;
  /** Interaction ray (eye origin + yaw/pitch look), independent of the render camera's transform. */
  aim: () => InteractionRay;
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
  const { canvas, rig, manager, inventory, registry, edit, previewDeps, aim, callbacks } = ctx;

  // Single merged keydown handler covering both tool shortcuts and undo/redo.
  window.addEventListener(
    'keydown',
    (e) => {
      // Perspective toggle works in both play and build modes (default browser F1 opens help).
      if (e.code === 'F1') {
        e.preventDefault();
        callbacks.onToggleView();
        return;
      }

      // Play mode: creative shortcuts are inert. B enters build mode; L (headlamp) passes
      // through below; movement/look/fly live in CameraRig and are untouched.
      if (!creativeInputAllowed(callbacks.getExperienceMode())) {
        if (e.code === 'KeyB') callbacks.onEnterBuild();
        else if (e.code === 'KeyL') callbacks.onToggleHeadlamp();
        else if (e.code === 'KeyM') callbacks.onToggleMap();
        else if (e.code === 'KeyH') callbacks.onCycleHand();
        // Tour toggle and the build hints only make sense while actually in-game: gate them on
        // pointer lock so keys don't fire behind the pause menu / an open dialog.
        else if (rig.locked && !callbacks.isInventoryOpen()) {
          if (e.code === 'KeyT') callbacks.onToggleTour();
          else {
            const hint = playModeGatedMessage(e.code, e.key, e.ctrlKey);
            if (hint) callbacks.onStatusChange(hint);
          }
        }
        return;
      }

      // Inventory / tool shortcuts
      const n = Number(e.key);
      if (n >= 1 && n <= inventory.hotbar.length) {
        if (!canEdit(rig.locked, callbacks.isInventoryOpen())) return;
        inventory.selectSlot(n - 1);
        callbacks.onHotbarRender();
        return;
      }
      if (e.code === 'KeyT') {
        stopRepeat();
        const next = TOOLS[(TOOLS.indexOf(callbacks.getTool()) + 1) % TOOLS.length];
        callbacks.onToolChange(next);
        return;
      }
      if (e.code === 'KeyI') {
        stopRepeat();
        const open = !callbacks.isInventoryOpen();
        if (open && rig.locked) document.exitPointerLock();
        callbacks.onInventoryToggle(open);
        return;
      }
      // KeyE is intentionally reserved for a future interact/use action — no binding today.
      if (e.code === 'Escape' && callbacks.isInventoryOpen()) {
        callbacks.onInventoryToggle(false);
        return;
      }
      if (e.code === 'KeyV') {
        callbacks.onToggleGhost();
        return;
      }
      if (e.code === 'KeyL') {
        callbacks.onToggleHeadlamp();
        return;
      }
      if (e.code === 'KeyH') {
        callbacks.onCycleHand();
        return;
      }

      const intent = resolveBuilderIntent(e.code, callbacks.getBuildMode());
      if (intent !== 'none') {
        if (intent !== 'toggleMode' && !canEdit(rig.locked, callbacks.isInventoryOpen())) return;
        stopRepeat();
        callbacks.onBuilderIntent(intent);
        return;
      }
      // M is always the world map now (mirror moved to U); checked after builder intents
      // only because resolveBuilderIntent runs first for every key.
      if (e.code === 'KeyM') {
        callbacks.onToggleMap();
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

  // ---- Hold-to-repeat engine ----
  // Holding LMB (Single/Tunnel) or RMB (place) re-fires at a capped, action-specific rate.
  // A held stroke groups its edits into one undo batch via EditService.beginGroup/endGroup,
  // and targets are deduped so holding still never re-edits the same voxel.
  let repeatTimer: number | undefined;
  let repeatButton: 0 | 2 | undefined;
  let lastTargetKey = '';
  let strokeOpen = false;

  const stopRepeat = (): void => {
    if (repeatTimer !== undefined) {
      window.clearInterval(repeatTimer);
      repeatTimer = undefined;
    }
    repeatButton = undefined;
    lastTargetKey = '';
    if (strokeOpen) {
      strokeOpen = false;
      edit.endGroup();
    }
  };

  const targetKey = (v: { x: number; y: number; z: number }): string => `${v.x},${v.y},${v.z}`;

  const raycastHit = (): VoxelRaycastHit | undefined => {
    const { origin, dir } = aim();
    return raycastVoxels(
      { getBlock: (x, y, z) => manager.getBlock(x, y, z) },
      origin,
      dir,
      getReach(),
    );
  };

  /** Digs with the active primary tool (single break or configured tunnel). */
  const performDig = (hit: VoxelRaycastHit): void => {
    if (callbacks.getTool() === 'single') {
      callbacks.onRun([{ ...hit.block, id: AIR }], 'Broke');
      return;
    }
    const dir = { x: -hit.normal.x, y: -hit.normal.y, z: -hit.normal.z };
    const voxels = tunnelConfigVoxels(hit.adjacent, dir, callbacks.getTunnelConfig());
    callbacks.onRun(asAir(voxels), 'Tunneled');
  };

  /**
   * Places (or toggles) at the resolved target. Returns the target's dedupe key; when
   * `skipKey` matches the resolved target, the edit is skipped (repeat dedupe).
   */
  const performPlace = (hit: VoxelRaycastHit, skipKey?: string): string => {
    const resolved = resolveTarget(hit, inventory.selectedBlock, rig.yaw, previewDeps);
    const key = targetKey(resolved.kind === 'toggle' ? hit.block : resolved.ghost);
    if (skipKey !== undefined && key === skipKey) return key;
    if (resolved.kind === 'toggle') {
      const state = manager.getState(hit.block.x, hit.block.y, hit.block.z);
      callbacks.onRun([gateToggleEdit(hit.block, hit.id, state)], 'Toggled');
      return key;
    }
    // Never place a block that would embed the player — a held RMB otherwise walls the
    // camera in (the column marches back into your head and the screen goes dark).
    // Returning the previous key keeps the repeat retrying once the player moves clear.
    if (callbacks.intersectsPlayer(resolved.ghost.x, resolved.ghost.y, resolved.ghost.z)) {
      return skipKey ?? '';
    }
    const voxel: SetVoxel = {
      x: resolved.ghost.x,
      y: resolved.ghost.y,
      z: resolved.ghost.z,
      id: resolved.ghost.id,
      state: resolved.ghost.state,
    };
    callbacks.onRun([voxel], 'Placed');
    return key;
  };

  const repeatTick = (): void => {
    if (repeatButton === undefined) return;
    if (
      !creativeInputAllowed(callbacks.getExperienceMode()) ||
      !canEdit(rig.locked, callbacks.isInventoryOpen()) ||
      callbacks.getBuildMode() !== 'off'
    ) {
      stopRepeat();
      return;
    }
    const tool = callbacks.getTool();
    if (repeatButton === 0 && tool !== 'single' && tool !== 'tunnel') {
      stopRepeat();
      return;
    }
    const hit = raycastHit();
    if (!hit) return; // keep holding — the aim may sweep back onto blocks
    if (repeatButton === 0) {
      const key = targetKey(hit.block);
      if (key === lastTargetKey) return;
      lastTargetKey = key;
      performDig(hit);
    } else {
      lastTargetKey = performPlace(hit, lastTargetKey);
    }
  };

  /** Opens a one-undo-batch stroke and starts the repeat clock for the held button. */
  const startRepeat = (button: 0 | 2, intervalMs: number): void => {
    stopRepeat();
    repeatButton = button;
    strokeOpen = true;
    edit.beginGroup();
    repeatTimer = window.setInterval(repeatTick, intervalMs);
  };

  document.addEventListener(
    'mouseup',
    (e) => {
      if (e.button === repeatButton) stopRepeat();
    },
    { signal },
  );
  document.addEventListener(
    'pointerlockchange',
    () => {
      if (!document.pointerLockElement) stopRepeat();
    },
    { signal },
  );

  // Right-click context menu suppressed only for the canvas (not globally).
  canvas.addEventListener('contextmenu', (e) => e.preventDefault(), { signal });

  canvas.addEventListener(
    'wheel',
    (e) => {
      if (!creativeInputAllowed(callbacks.getExperienceMode())) return;
      if (!canEdit(rig.locked, callbacks.isInventoryOpen())) return;
      if (e.shiftKey) {
        const delta = reachWheelDelta(e.deltaY);
        if (delta === 0) return;
        setReach(getReach() + delta);
        callbacks.onReachChange(getReach());
        return;
      }
      const delta = hotbarWheelDelta(e.deltaY, true);
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
      // Play mode: no click edits at all — break/place/pick/builder are all world-mutating.
      if (!creativeInputAllowed(callbacks.getExperienceMode())) return;
      if (!canEdit(rig.locked, callbacks.isInventoryOpen())) return;
      const hit = raycastHit();
      if (!hit) return;

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
        if (getHoldRepeat()) {
          startRepeat(2, PLACE_REPEAT_MS);
          lastTargetKey = performPlace(hit);
        } else {
          performPlace(hit);
        }
        return;
      }
      if (e.button !== 0) return;

      const tool = callbacks.getTool();
      if (tool === 'single' || tool === 'tunnel') {
        if (getHoldRepeat()) {
          startRepeat(0, tool === 'single' ? SINGLE_REPEAT_MS : TUNNEL_REPEAT_MS);
          lastTargetKey = targetKey(hit.block);
        }
        performDig(hit);
      } else if (tool === 'sphere') {
        callbacks.onRun(asAir(sphereVoxels(hit.block, SPHERE_RADIUS)), 'Dug');
      } else {
        handleSelection(hit.block, inventory.selectedBlock, tool, manager, registry, callbacks);
      }
    },
    { signal },
  );

  return () => {
    stopRepeat();
    controller.abort();
  };
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
