import { Renderer } from '../render/Renderer';
import { createTextureArray } from '../render/TextureArray';
import { createChunkMaterial, createWaterMaterial } from '../render/ChunkMaterial';
import { ChunkMeshRegistry } from '../render/ChunkMeshRegistry';
import { CameraRig } from '../render/CameraRig';
import { ChunkManager } from '../world/ChunkManager';
import { createWorldGenerator } from '../worldgen/LayeredGenerator';
import { GreedyMesher } from '../mesh/GreedyMesher';
import { BlockRegistry } from '../blocks/BlockRegistry';
import { PlayerController } from '../player/PlayerController';
import { scatterTrees } from '../worldgen/TreeScatterer';
import { EditService } from '../edit/EditService';
import { raycastVoxels } from '../edit/VoxelRaycast';
import { boxVoxels, sphereVoxels, tunnelVoxels } from '../edit/Brushes';
import { IndexedDbSaveStore } from '../persistence/IndexedDbSaveStore';
import { SAVE_VERSION, type WorldDeltas } from '../persistence/SaveTypes';
import { worldToChunkCoord } from '../core/coords';
import { AIR, GRASS, DIRT, STONE, SAND, WOOD, LEAVES, SNOW } from '../blocks/blocks';
import type { Overlay } from '../worldgen/Generator';
import type { Vec3, WorldSeed, BlockId } from '../core/types';
import type { WorldVoxel, SetVoxel } from '../edit/EditTypes';

const REACH = 6; // block-edit reach in world units
const SAVE_DEBOUNCE_MS = 250; // coalesce rapid edits into one write per chunk
const MAX_EDIT_VOXELS = 8192; // guard against runaway box selections
const TUNNEL_LENGTH = 8;
const SPHERE_RADIUS = 4;

const SEED: WorldSeed = 1337;
const OVERLAYS: Overlay[] = [scatterTrees]; // trees; castle is a later P4 overlay
const SPAWN: Vec3 = { x: 8, y: 100, z: 8 }; // start flying above origin while chunks load
const MAX_DT = 0.05; // clamp to keep collision substeps sane on frame drops

type Tool = 'single' | 'tunnel' | 'sphere' | 'box-clear' | 'fill' | 'replace';
const TOOLS: Tool[] = ['single', 'tunnel', 'sphere', 'box-clear', 'fill', 'replace'];

function toolLabel(tool: Tool): string {
  return tool
    .split('-')
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(' ');
}

/** Composition root: a player flying/walking and sculpting the streamed voxel world. */
export class Game {
  static async boot(canvas: HTMLCanvasElement): Promise<void> {
    const registry = new BlockRegistry();
    const renderer = new Renderer(canvas);
    const texture = createTextureArray();
    const material = createChunkMaterial(texture);
    const waterMaterial = createWaterMaterial(texture);

    // Load the durable save (or start fresh / discard an incompatible one).
    const store = new IndexedDbSaveStore();
    let savedDeltas: WorldDeltas = new Map();
    const meta = await store.loadMeta();
    if (!meta) {
      await store.saveMeta({ seed: SEED, version: SAVE_VERSION });
    } else if (meta.seed !== SEED || meta.version !== SAVE_VERSION) {
      console.warn('Voxel Realm: incompatible save — discarding stored edits.');
      await store.clearDeltas();
      await store.saveMeta({ seed: SEED, version: SAVE_VERSION });
    } else {
      savedDeltas = await store.loadDeltas();
    }

    const sink = new ChunkMeshRegistry(renderer.scene, material, waterMaterial);
    const manager = new ChunkManager(
      createWorldGenerator(),
      new GreedyMesher(registry),
      registry,
      sink,
      SEED,
      OVERLAYS,
      undefined,
      savedDeltas,
    );

    // Debounced per-chunk persistence: a touched chunk is flushed once after a short idle.
    const dirty = new Set<string>();
    let flushTimer: number | undefined;
    const flush = (): void => {
      flushTimer = undefined;
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

    const overlay = document.getElementById('overlay') ?? undefined;
    const rig = new CameraRig(renderer.camera, canvas, overlay as HTMLElement | undefined);
    const player = new PlayerController(SPAWN, true);
    const sampler = {
      isSolid: (x: number, y: number, z: number) => manager.isSolid(x, y, z),
      isWater: (x: number, y: number, z: number) => manager.isWater(x, y, z),
    };

    const edit = new EditService(manager);
    const palette = [GRASS, DIRT, STONE, SAND, WOOD, LEAVES, SNOW];
    let current = STONE;
    let tool: Tool = 'single';
    let anchor: WorldVoxel | undefined;

    const hud = document.getElementById('hud');
    const setHud = (note?: string): void => {
      if (hud) {
        hud.textContent = `${toolLabel(tool)} · ${registry.get(current).name}${note ? ` — ${note}` : ''}`;
      }
    };
    setHud();

    /** Applies an edit set (capped), reports the result, and resets any pending selection. */
    const run = (voxels: SetVoxel[], verb: string): void => {
      if (voxels.length > MAX_EDIT_VOXELS) {
        setHud(`too large (${voxels.length} > ${MAX_EDIT_VOXELS})`);
        return;
      }
      const batch = edit.apply(voxels);
      setHud(batch ? `${verb} ${batch.changes.length}` : 'no change');
    };

    window.addEventListener('keydown', (e) => {
      const n = Number(e.key);
      if (n >= 1 && n <= palette.length) {
        current = palette[n - 1];
        setHud();
      } else if (e.code === 'KeyT') {
        tool = TOOLS[(TOOLS.indexOf(tool) + 1) % TOOLS.length];
        anchor = undefined;
        setHud();
      }
    });

    window.addEventListener('keydown', (e) => {
      if (!e.ctrlKey) return;
      if (e.code === 'KeyZ' && !e.shiftKey) {
        e.preventDefault();
        setHud(edit.undo() ? 'undo' : 'nothing to undo');
      } else if (e.code === 'KeyY' || (e.code === 'KeyZ' && e.shiftKey)) {
        e.preventDefault();
        setHud(edit.redo() ? 'redo' : 'nothing to redo');
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

      if (e.button === 1) {
        if (hit.id !== AIR) current = hit.id; // pick
        setHud();
        return;
      }
      if (e.button === 2) {
        run([{ ...hit.adjacent, id: current }], 'placed'); // right-click always places one block
        return;
      }
      if (e.button !== 0) return;

      // Left-click: the active tool.
      if (tool === 'single') {
        run([{ ...hit.block, id: AIR }], 'broke');
      } else if (tool === 'tunnel') {
        const dir = { x: -hit.normal.x, y: -hit.normal.y, z: -hit.normal.z };
        run(asAir(tunnelVoxels(hit.adjacent, dir, TUNNEL_LENGTH, 1)), 'tunneled');
      } else if (tool === 'sphere') {
        run(asAir(sphereVoxels(hit.block, SPHERE_RADIUS)), 'dug');
      } else {
        handleSelection(hit.block);
      }
    });

    function handleSelection(target: WorldVoxel): void {
      if (!anchor) {
        anchor = target;
        setHud('select opposite corner');
        return;
      }
      const region = boxVoxels(anchor, target);
      anchor = undefined;
      if (tool === 'box-clear') {
        run(asAir(region), 'cleared');
      } else if (tool === 'fill') {
        run(asId(region, current), 'filled');
      } else {
        // replace: swap the block the player clicked for the current block within the box.
        const replaceId = manager.getBlock(target.x, target.y, target.z);
        const matches = region.filter((v) => manager.getBlock(v.x, v.y, v.z) === replaceId);
        run(asId(matches, current), `replaced ${registry.get(replaceId).name}`);
      }
    }

    renderer.start((dt) => {
      const cdt = Math.min(dt, MAX_DT);
      player.update(cdt, rig.getInput(), rig.yaw, sampler);
      const eye = player.eye();
      rig.applyEye(eye.x, eye.y, eye.z);
      manager.update(
        worldToChunkCoord(Math.floor(player.position.x)),
        worldToChunkCoord(Math.floor(player.position.z)),
      );
    });
  }
}

function asAir(voxels: WorldVoxel[]): SetVoxel[] {
  return voxels.map((v) => ({ ...v, id: AIR }));
}

function asId(voxels: WorldVoxel[], id: BlockId): SetVoxel[] {
  return voxels.map((v) => ({ ...v, id }));
}
