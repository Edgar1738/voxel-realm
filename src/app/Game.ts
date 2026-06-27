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
import { IndexedDbSaveStore } from '../persistence/IndexedDbSaveStore';
import { SAVE_VERSION, type WorldDeltas } from '../persistence/SaveTypes';
import { worldToChunkCoord } from '../core/coords';
import { AIR, GRASS, DIRT, STONE, SAND, WOOD, LEAVES, SNOW } from '../blocks/blocks';
import type { Overlay } from '../worldgen/Generator';
import type { Vec3, WorldSeed } from '../core/types';

const REACH = 6; // block-edit reach in world units
const SAVE_DEBOUNCE_MS = 250; // coalesce rapid edits into one write per chunk

const SEED: WorldSeed = 1337;
const OVERLAYS: Overlay[] = [scatterTrees]; // trees; castle is a later P4 overlay
const SPAWN: Vec3 = { x: 8, y: 100, z: 8 }; // start flying above origin while chunks load
const MAX_DT = 0.05; // clamp to keep collision substeps sane on frame drops

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
    const hud = document.getElementById('hud');
    const setCurrent = (id: number): void => {
      current = id;
      if (hud) hud.textContent = registry.get(id).name;
    };
    setCurrent(current);

    window.addEventListener('keydown', (e) => {
      const n = Number(e.key);
      if (n >= 1 && n <= palette.length) setCurrent(palette[n - 1]);
    });

    window.addEventListener('keydown', (e) => {
      if (!e.ctrlKey) return;
      if (e.code === 'KeyZ' && !e.shiftKey) {
        e.preventDefault();
        edit.undo();
      } else if (e.code === 'KeyY' || (e.code === 'KeyZ' && e.shiftKey)) {
        e.preventDefault();
        edit.redo();
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
      if (e.button === 0)
        edit.apply([{ ...hit.block, id: AIR }]); // break
      else if (e.button === 2)
        edit.apply([{ ...hit.adjacent, id: current }]); // place
      else if (e.button === 1 && hit.id !== AIR) setCurrent(hit.id); // pick
    });

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
