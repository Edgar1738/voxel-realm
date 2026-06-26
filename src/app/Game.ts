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
import { worldToChunkCoord } from '../core/coords';
import type { Overlay } from '../worldgen/Generator';
import type { Vec3, WorldSeed } from '../core/types';

const SEED: WorldSeed = 1337;
const OVERLAYS: Overlay[] = [scatterTrees]; // trees; castle is a later P4 overlay
const SPAWN: Vec3 = { x: 8, y: 100, z: 8 }; // start flying above origin while chunks load
const MAX_DT = 0.05; // clamp to keep collision substeps sane on frame drops

/** Composition root: a player flying/walking through the streamed voxel world. */
export class Game {
  static boot(canvas: HTMLCanvasElement): void {
    const registry = new BlockRegistry();
    const renderer = new Renderer(canvas);
    const texture = createTextureArray();
    const material = createChunkMaterial(texture);
    const waterMaterial = createWaterMaterial(texture);

    const sink = new ChunkMeshRegistry(renderer.scene, material, waterMaterial);
    const manager = new ChunkManager(
      createWorldGenerator(),
      new GreedyMesher(registry),
      registry,
      sink,
      SEED,
      OVERLAYS,
    );

    const overlay = document.getElementById('overlay') ?? undefined;
    const rig = new CameraRig(renderer.camera, canvas, overlay as HTMLElement | undefined);
    const player = new PlayerController(SPAWN, true);
    const sampler = { isSolid: (x: number, y: number, z: number) => manager.isSolid(x, y, z) };

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
