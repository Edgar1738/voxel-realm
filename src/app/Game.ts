import { Renderer } from '../render/Renderer';
import { createTextureArray } from '../render/TextureArray';
import { createChunkMaterial, createTransparentMaterial } from '../render/ChunkMaterial';
import { DayNight } from '../render/DayNight';
import { CelestialSky } from '../render/CelestialSky';
import { ChunkMeshRegistry } from '../render/ChunkMeshRegistry';
import { CameraRig } from '../render/CameraRig';
import { ChunkManager } from '../world/ChunkManager';
import { createGenerator, isWorldPreset, type WorldPreset } from '../worldgen/Presets';
import { GreedyMesher } from '../mesh/GreedyMesher';
import { BlockRegistry } from '../blocks/BlockRegistry';
import { PlayerController } from '../player/PlayerController';
import { EditService } from '../edit/EditService';
import { raycastVoxels } from '../edit/VoxelRaycast';
import { boxVoxels, sphereVoxels, tunnelVoxels } from '../edit/Brushes';
import { CreativeInventory } from './CreativeInventory';
import { createCreativeUi } from './CreativeUi';
import { IndexedDbSaveStore } from '../persistence/IndexedDbSaveStore';
import { resolveSaveAction } from '../persistence/SaveGuard';
import { SAVE_VERSION, type WorldDeltas } from '../persistence/SaveTypes';
import { worldToChunkCoord } from '../core/coords';
import { AIR } from '../blocks/blocks';
import type { Vec3, WorldSeed, BlockId } from '../core/types';
import type { WorldVoxel, SetVoxel, EditOutcome } from '../edit/EditTypes';

const REACH = 6; // block-edit reach in world units
const SAVE_DEBOUNCE_MS = 250; // coalesce rapid edits into one write per chunk
const MAX_EDIT_VOXELS = 8192; // guard against runaway box selections
const TUNNEL_LENGTH = 8;
const SPHERE_RADIUS = 4;

const SEED: WorldSeed = 1337;
const SPAWN: Vec3 = { x: 8, y: 100, z: 8 }; // start flying above origin while chunks load
const MAX_DT = 0.05; // clamp to keep collision substeps sane on frame drops

type Tool = 'single' | 'tunnel' | 'sphere' | 'box-clear' | 'fill' | 'replace';
const TOOLS: Tool[] = ['single', 'tunnel', 'sphere', 'box-clear', 'fill', 'replace'];

function toolLabel(tool: string): string {
  return tool
    .split('-')
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(' ');
}

function editMessage(action: 'undo' | 'redo', outcome: EditOutcome): string {
  if (outcome === 'ok') return action === 'undo' ? 'Undid' : 'Redid';
  if (outcome === 'blocked') return `Can't ${action} here — return to that area`;
  return `Nothing to ${action}`;
}

/** Composition root: a player flying/walking and sculpting the streamed voxel world. */
export class Game {
  static async boot(canvas: HTMLCanvasElement): Promise<void> {
    const registry = new BlockRegistry();
    const renderer = new Renderer(canvas);
    const texture = createTextureArray();
    const material = createChunkMaterial(texture);
    const transparentMaterial = createTransparentMaterial(texture);
    const daynight = new DayNight(renderer.scene, [material, transparentMaterial]);
    const celestial = new CelestialSky(renderer.scene);

    // Pick the world environment (?world=flat|void|arena|default).
    const requested = new URLSearchParams(window.location.search).get('world');
    const preset: WorldPreset = isWorldPreset(requested) ? requested : 'default';
    const { generator, overlays } = createGenerator(preset);

    // Load the durable save (or start fresh / discard an incompatible one).
    const store = new IndexedDbSaveStore();
    let savedDeltas: WorldDeltas = new Map();
    const action = resolveSaveAction(await store.loadMeta(), SEED, SAVE_VERSION, preset);
    if (action.kind === 'load') {
      savedDeltas = await store.loadDeltas();
    } else {
      if (action.reason === 'incompatible') {
        console.warn('Voxel Realm: incompatible save — discarding stored edits.');
      }
      await store.clearDeltas(); // mismatch or no meta => stored deltas are orphans
      await store.saveMeta({ seed: SEED, version: SAVE_VERSION, preset });
    }

    const sink = new ChunkMeshRegistry(renderer.scene, material, transparentMaterial);
    const manager = new ChunkManager(
      generator,
      new GreedyMesher(registry),
      registry,
      sink,
      SEED,
      overlays,
      undefined,
      savedDeltas,
    );

    // Debounced per-chunk persistence: a touched chunk is flushed once after a short idle.
    const dirty = new Set<string>();
    let flushTimer: number | undefined;
    let savesSuppressed = false; // set during reset so pending edits aren't re-written
    const flush = (): void => {
      flushTimer = undefined;
      if (savesSuppressed) {
        dirty.clear();
        return;
      }
      for (const key of dirty) {
        void store
          .saveChunkDelta(key, manager.getChunkDelta(key))
          .catch((err) => console.error('Voxel Realm: save failed', err));
      }
      dirty.clear();
    };
    manager.onChunkDeltaChanged = (key) => {
      dirty.add(key);
      if (flushTimer === undefined) flushTimer = window.setTimeout(flush, SAVE_DEBOUNCE_MS);
    };
    // Best-effort flush of any pending edits when the tab is hidden/closed.
    window.addEventListener('pagehide', () => {
      if (flushTimer !== undefined) window.clearTimeout(flushTimer);
      flush();
    });

    const overlay = document.getElementById('overlay') ?? undefined;
    const rig = new CameraRig(renderer.camera, canvas, overlay as HTMLElement | undefined);
    const player = new PlayerController(SPAWN, true);
    const sampler = {
      isSolid: (x: number, y: number, z: number) => manager.isSolid(x, y, z),
      isWater: (x: number, y: number, z: number) => manager.isWater(x, y, z),
    };

    const edit = new EditService(manager);
    const inventory = new CreativeInventory();
    let tool: Tool = 'single';
    let anchor: WorldVoxel | undefined;

    const ui = createCreativeUi(registry, inventory, TOOLS, toolLabel, (t) => setTool(t as Tool));
    const setStatus = (text: string): void => {
      ui.setStatus(text);
    };
    const setTool = (next: Tool): void => {
      tool = next;
      anchor = undefined;
      ui.setActiveTool(next);
      setStatus(`Tool: ${toolLabel(next)}`);
    };
    setTool('single');

    ui.picker.addEventListener('click', (event) => {
      const btn = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-block]');
      if (!btn) return;
      inventory.pickBlock(Number(btn.dataset.block) as BlockId);
      ui.renderHotbar();
      setStatus(`Selected ${registry.get(inventory.selectedBlock).name}`);
      ui.setInventoryOpen(false);
    });
    ui.hotbar.addEventListener('click', (event) => {
      const btn = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-slot]');
      if (!btn) return;
      inventory.selectSlot(Number(btn.dataset.slot));
      ui.renderHotbar();
    });
    ui.reset.addEventListener('click', () => {
      if (!window.confirm('Reset the world back to generated terrain? Your edits will be lost.')) {
        return;
      }
      // Drop any pending writes so the pagehide flush can't resurrect them after the clear.
      savesSuppressed = true;
      if (flushTimer !== undefined) window.clearTimeout(flushTimer);
      dirty.clear();
      void store.clearDeltas().then(() => window.location.reload());
    });

    /** Applies an edit set (capped), reports the result, and clears any pending selection. */
    const run = (voxels: SetVoxel[], verb: string): void => {
      if (voxels.length > MAX_EDIT_VOXELS) {
        setStatus(`Selection too large (${voxels.length} > ${MAX_EDIT_VOXELS})`);
        return;
      }
      const batch = edit.apply(voxels);
      setStatus(batch ? `${verb} ${batch.changes.length} voxel(s)` : 'No editable voxels');
    };

    window.addEventListener('keydown', (e) => {
      const n = Number(e.key);
      if (n >= 1 && n <= inventory.hotbar.length) {
        inventory.selectSlot(n - 1);
        ui.renderHotbar();
      } else if (e.code === 'KeyT') {
        setTool(TOOLS[(TOOLS.indexOf(tool) + 1) % TOOLS.length]);
      } else if (e.code === 'KeyE') {
        const open = !ui.isInventoryOpen();
        // Free the cursor on open so the tiles are clickable; the click-to-play overlay re-locks.
        if (open && rig.locked) document.exitPointerLock();
        ui.setInventoryOpen(open);
      } else if (e.code === 'Escape' && ui.isInventoryOpen()) {
        ui.setInventoryOpen(false);
      }
    });

    window.addEventListener('keydown', (e) => {
      if (!e.ctrlKey) return;
      if (e.code === 'KeyZ' && !e.shiftKey) {
        e.preventDefault();
        setStatus(editMessage('undo', edit.undo()));
      } else if (e.code === 'KeyY' || (e.code === 'KeyZ' && e.shiftKey)) {
        e.preventDefault();
        setStatus(editMessage('redo', edit.redo()));
      }
    });

    document.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('mousedown', (e) => {
      if (!rig.locked) return;
      const hit = raycastVoxels(
        { getBlock: (x, y, z) => manager.getBlock(x, y, z) },
        renderer.camera.position,
        rig.forward(),
        REACH,
      );
      if (!hit) return;
      const selected = inventory.selectedBlock;

      if (e.button === 1) {
        if (hit.id !== AIR) inventory.pickBlock(hit.id); // pick into the selected slot
        ui.renderHotbar();
        return;
      }
      if (e.button === 2) {
        run([{ ...hit.adjacent, id: selected }], 'Placed'); // right-click always places one block
        return;
      }
      if (e.button !== 0) return;

      if (tool === 'single') {
        run([{ ...hit.block, id: AIR }], 'Broke');
      } else if (tool === 'tunnel') {
        const dir = { x: -hit.normal.x, y: -hit.normal.y, z: -hit.normal.z };
        run(asAir(tunnelVoxels(hit.adjacent, dir, TUNNEL_LENGTH, 1)), 'Tunneled');
      } else if (tool === 'sphere') {
        run(asAir(sphereVoxels(hit.block, SPHERE_RADIUS)), 'Dug');
      } else {
        handleSelection(hit.block, selected);
      }
    });

    function handleSelection(target: WorldVoxel, selected: BlockId): void {
      if (!anchor) {
        anchor = target;
        setStatus('Selection started — click the opposite corner');
        return;
      }
      // Reject oversized selections BEFORE generating the (potentially huge) voxel array.
      const volume =
        (Math.abs(target.x - anchor.x) + 1) *
        (Math.abs(target.y - anchor.y) + 1) *
        (Math.abs(target.z - anchor.z) + 1);
      if (volume > MAX_EDIT_VOXELS) {
        anchor = undefined;
        setStatus(`Selection too large (${volume} > ${MAX_EDIT_VOXELS})`);
        return;
      }
      const region = boxVoxels(anchor, target);
      anchor = undefined;
      if (tool === 'box-clear') {
        run(asAir(region), 'Cleared');
      } else if (tool === 'fill') {
        run(asId(region, selected), 'Filled');
      } else {
        const replaceId = manager.getBlock(target.x, target.y, target.z);
        const matches = region.filter((v) => manager.getBlock(v.x, v.y, v.z) === replaceId);
        run(asId(matches, selected), `Replaced ${registry.get(replaceId).name}`);
      }
    }

    renderer.start((dt) => {
      const cdt = Math.min(dt, MAX_DT);
      daynight.advance(cdt);
      celestial.update(daynight.time, renderer.camera.position);
      player.update(cdt, rig.getInput(), rig.yaw, sampler);
      const eye = player.eye();
      rig.applyEye(eye.x, eye.y, eye.z);
      manager.update(
        worldToChunkCoord(Math.floor(player.position.x)),
        worldToChunkCoord(Math.floor(player.position.z)),
      );
    });

    // Dev-only frame capture: the live WebGL surface hangs CDP/Playwright screenshots, so expose
    // a hook that renders one frame and returns a downscaled JPEG data URL (read in-tick, so no
    // preserveDrawingBuffer needed). Tree-shaken out of production builds.
    // Dev-only roam/capture controls (window.__vr). Dynamically imported so the whole module —
    // and its html2canvas dependency — is excluded from production builds.
    if (import.meta.env.DEV) {
      void import('./DevControls').then((m) =>
        m.installDevControls({
          renderer,
          player,
          rig,
          manager,
          edit,
          inventory,
          registry,
          daynight,
          celestial,
        }),
      );
    }
  }
}

function asAir(voxels: WorldVoxel[]): SetVoxel[] {
  return voxels.map((v) => ({ ...v, id: AIR }));
}

function asId(voxels: WorldVoxel[], id: BlockId): SetVoxel[] {
  return voxels.map((v) => ({ ...v, id }));
}
