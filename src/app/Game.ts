import { Renderer } from '../render/Renderer';
import { createTextureArray } from '../render/TextureArray';
import { createChunkMaterial, createTransparentMaterial } from '../render/ChunkMaterial';
import { DayNight } from '../render/DayNight';
import { CelestialSky } from '../render/CelestialSky';
import { ChunkMeshRegistry } from '../render/ChunkMeshRegistry';
import { CameraRig } from '../render/CameraRig';
import { ChunkManager } from '../world/ChunkManager';
import { createGenerator, resolveBootPreset, type WorldPreset } from '../worldgen/Presets';
import { GreedyMesher } from '../mesh/GreedyMesher';
import { BlockRegistry } from '../blocks/BlockRegistry';
import { PlayerController } from '../player/PlayerController';
import { EditService } from '../edit/EditService';
import { CreativeInventory } from './CreativeInventory';
import { createCreativeUi } from './CreativeUi';
import { IndexedDbSaveStore } from '../persistence/IndexedDbSaveStore';
import { ServerSaveStore } from '../persistence/ServerSaveStore';
import { worldNameFromSearch } from '../persistence/worldName';
import type { SaveStore } from '../persistence/SaveStore';
import { resolveSaveAction } from '../persistence/SaveGuard';
import { SAVE_VERSION, type WorldDeltas } from '../persistence/SaveTypes';
import { worldToChunkCoord } from '../core/coords';
import type { Vec3, WorldSeed, BlockId } from '../core/types';
import type { SetVoxel } from '../edit/EditTypes';
import { createPersistence } from './persistence';
import { withinEditCap, MAX_EDIT_VOXELS } from './editCap';
import { registerInputListeners, TOOLS, toolLabel, type Tool } from './input';

const SEED: WorldSeed = 1337;
const SPAWN: Vec3 = { x: 8, y: 100, z: 8 }; // start flying above origin while chunks load
const MAX_DT = 0.05; // clamp to keep collision substeps sane on frame drops

/** Composition root: a player flying/walking and sculpting the streamed voxel world. */
export class Game {
  /**
   * Boots the game and returns a cleanup function.
   * The returned cleanup disposes all resources: render loop, listeners, persistence, HUD.
   */
  static async boot(canvas: HTMLCanvasElement): Promise<() => void> {
    const registry = new BlockRegistry();
    const renderer = new Renderer(canvas);
    const texture = createTextureArray();
    const material = createChunkMaterial(texture);
    const transparentMaterial = createTransparentMaterial(texture);
    const daynight = new DayNight(renderer.scene, [material, transparentMaterial]);
    const celestial = new CelestialSky(renderer.scene);

    // Load the durable save (or start fresh / discard an incompatible one).
    // Shared storage in dev (server-owned, named worlds via ?save=); IndexedDB in production.
    const worldName = worldNameFromSearch(window.location.search);
    const store: SaveStore = import.meta.env.DEV
      ? new ServerSaveStore(worldName, (id) => registry.has(id))
      : new IndexedDbSaveStore();
    const meta = await store.loadMeta();

    // Pick the world environment. An explicit `?world=` wins; otherwise an existing save keeps its
    // own stored preset, so a bare `?save=<name>` can't mismatch the generator and wipe the world.
    const requested = new URLSearchParams(window.location.search).get('world');
    const preset: WorldPreset = resolveBootPreset(requested, meta);
    const { generator, overlays } = createGenerator(preset);

    let savedDeltas: WorldDeltas = new Map();
    const action = resolveSaveAction(meta, SEED, SAVE_VERSION, preset);
    if (action.kind === 'load') {
      savedDeltas = await store.loadDeltas();
    } else {
      if (action.reason === 'incompatible') {
        console.warn('Voxel Realm: incompatible save — discarding stored edits.');
      }
      // Non-fatal: if the dev server is unreachable, boot an in-memory world rather than crash.
      try {
        await store.clearDeltas(); // mismatch or no meta => stored deltas are orphans
        await store.saveMeta({ seed: SEED, version: SAVE_VERSION, preset });
      } catch (err) {
        console.error('Voxel Realm: could not initialise save metadata', err);
      }
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

    // Debounced per-chunk persistence.
    const persistence = createPersistence(store, manager);
    manager.onChunkDeltaChanged = (key) => persistence.scheduleFlush(key);

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
    let anchorVoxel: { x: number; y: number; z: number } | undefined;

    const ui = createCreativeUi(registry, inventory, TOOLS, toolLabel, (t) => setTool(t as Tool));

    if (import.meta.env.DEV) {
      const { listWorlds, copyWorld } = await import('../persistence/ServerWorldCatalog');
      ui.worldButton.textContent = `World: ${worldName}`;
      ui.worldButton.addEventListener('click', () => {
        void (async () => {
          const worlds = await listWorlds();
          const choice = window.prompt(
            `Worlds: ${worlds.join(', ') || '(none yet)'}\n` +
              `Type a name to switch/create, or "save:NEW" to copy "${worldName}" to NEW:`,
            worldName,
          );
          if (!choice) return;
          const u = new URL(window.location.href);
          if (choice.startsWith('save:')) {
            const target = choice.slice('save:'.length).trim();
            if (!target) return;
            await copyWorld(worldName, target);
            u.searchParams.set('save', target);
          } else {
            u.searchParams.set('save', choice.trim());
          }
          window.location.href = u.toString();
        })();
      });
    } else {
      ui.worldButton.style.display = 'none';
    }

    const setStatus = (text: string): void => {
      ui.setStatus(text);
    };
    const setTool = (next: Tool): void => {
      tool = next;
      anchorVoxel = undefined;
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
      // suppressAndClear cancels the debounce, clears dirty set, and drains in-flight writes
      // so the pagehide flush can't resurrect stale deltas after clearDeltas().
      void persistence
        .suppressAndClear()
        .then(() => store.clearDeltas())
        .then(() => window.location.reload())
        .catch((err) => {
          console.error('Voxel Realm: reset failed', err);
          window.location.reload();
        });
    });

    /** Applies an edit set (capped), reports the result, and clears any pending selection. */
    const run = (voxels: SetVoxel[], verb: string): void => {
      if (!withinEditCap(voxels.length, MAX_EDIT_VOXELS)) {
        setStatus(`Selection too large (${voxels.length} > ${MAX_EDIT_VOXELS})`);
        return;
      }
      const batch = edit.apply(voxels);
      setStatus(batch ? `${verb} ${batch.changes.length} voxel(s)` : 'No editable voxels');
    };

    // Register all input listeners through a single AbortController.
    const abortInput = registerInputListeners({
      canvas,
      rig,
      renderer,
      manager,
      inventory,
      registry,
      edit,
      callbacks: {
        onStatusChange: setStatus,
        onToolChange: setTool,
        onHotbarRender: () => ui.renderHotbar(),
        onInventoryToggle: (open) => ui.setInventoryOpen(open),
        isInventoryOpen: () => ui.isInventoryOpen(),
        onRun: run,
        getAnchor: () => anchorVoxel,
        setAnchor: (v) => {
          anchorVoxel = v;
        },
        getTool: () => tool,
      },
    });

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

    // Dev-only frame capture + roam/capture controls (window.__vr).
    // Dynamically imported so the whole module — and its html2canvas dependency —
    // is excluded from production builds.
    let hudTeardown: (() => void) | undefined;
    if (import.meta.env.DEV) {
      const devContext = {
        renderer,
        player,
        rig,
        manager,
        edit,
        inventory,
        registry,
        daynight,
        celestial,
        preset,
        worldName,
      };
      void import('./DevControls').then((m) => m.installDevControls(devContext));
      void import('./DevHud').then((m) => {
        hudTeardown = m.installDevHud({
          player,
          rig,
          manager,
          inventory,
          registry,
          preset,
          worldName,
        });
      });
    }

    /** Releases all resources acquired during boot. */
    function cleanup(): void {
      abortInput();
      persistence.dispose();
      hudTeardown?.();
      renderer.dispose();
      celestial.dispose();
      sink.disposeAll();
      rig.dispose();
    }

    return cleanup;
  }
}
