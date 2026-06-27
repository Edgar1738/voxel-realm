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
import { ChunkDeltas } from '../persistence/ChunkDeltas';
import { IndexedDbSaveStore } from '../persistence/IndexedDbSaveStore';
import { SAVE_VERSION } from '../persistence/SaveTypes';
import { UndoRedo } from '../edit/UndoRedo';
import { WorldEdits } from '../edit/WorldEdits';
import { worldToChunkCoord } from '../core/coords';
import { AIR, GRASS, DIRT, STONE, SAND, WOOD, LEAVES, SNOW } from '../blocks/blocks';
import type { Overlay } from '../worldgen/Generator';
import type { Vec3, WorldSeed } from '../core/types';

const REACH = 6; // block-edit reach in world units

const SEED: WorldSeed = 1337;
const OVERLAYS: Overlay[] = [scatterTrees]; // trees; castle is a later P4 overlay
const SPAWN: Vec3 = { x: 8, y: 100, z: 8 }; // start flying above origin while chunks load
const MAX_DT = 0.05; // clamp to keep collision substeps sane on frame drops

/** Composition root: a player flying/walking through the streamed voxel world. */
export class Game {
  static async boot(canvas: HTMLCanvasElement): Promise<void> {
    const registry = new BlockRegistry();
    const renderer = new Renderer(canvas);
    const texture = createTextureArray();
    const material = createChunkMaterial(texture);
    const waterMaterial = createWaterMaterial(texture);

    // Load the durable save (or start fresh / discard an incompatible one).
    const store = new IndexedDbSaveStore();
    const deltas = new ChunkDeltas();
    const meta = await store.loadMeta();
    if (!meta) {
      await store.saveMeta({ seed: SEED, version: SAVE_VERSION });
    } else if (meta.seed !== SEED || meta.version !== SAVE_VERSION) {
      console.warn('Voxel Realm: incompatible save — discarding stored edits.');
      await store.clearDeltas();
      await store.saveMeta({ seed: SEED, version: SAVE_VERSION });
    } else {
      deltas.load(await store.loadDeltas());
    }

    const sink = new ChunkMeshRegistry(renderer.scene, material, waterMaterial);
    const manager = new ChunkManager(
      createWorldGenerator(),
      new GreedyMesher(registry),
      registry,
      sink,
      SEED,
      OVERLAYS,
      deltas,
    );

    const overlay = document.getElementById('overlay') ?? undefined;
    const rig = new CameraRig(renderer.camera, canvas, overlay as HTMLElement | undefined);
    const player = new PlayerController(SPAWN, true);
    const sampler = {
      isSolid: (x: number, y: number, z: number) => manager.isSolid(x, y, z),
      isWater: (x: number, y: number, z: number) => manager.isWater(x, y, z),
    };

    const worldEdits = new WorldEdits(manager, deltas, store, new UndoRedo());
    const edit = new EditService(worldEdits, registry, REACH);
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
        worldEdits.undoEdit();
      } else if (e.code === 'KeyY' || (e.code === 'KeyZ' && e.shiftKey)) {
        e.preventDefault();
        worldEdits.redoEdit();
      }
    });

    document.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('mousedown', (e) => {
      if (!rig.locked) return;
      const origin = player.eye();
      const dir = rig.forward();
      if (e.button === 0) edit.break(origin, dir);
      else if (e.button === 2) edit.place(origin, dir, current);
      else if (e.button === 1) {
        const id = edit.pick(origin, dir);
        if (id !== null && id !== AIR) setCurrent(id);
      }
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
