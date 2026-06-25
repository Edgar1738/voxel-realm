import { Renderer } from '../render/Renderer';
import { createTextureArray } from '../render/TextureArray';
import { createChunkMaterial } from '../render/ChunkMaterial';
import { ChunkMeshRegistry } from '../render/ChunkMeshRegistry';
import { ChunkManager } from '../world/ChunkManager';
import { HeightmapGenerator } from '../worldgen/HeightmapGenerator';
import { GreedyMesher } from '../mesh/GreedyMesher';
import { BlockRegistry } from '../blocks/BlockRegistry';
import { worldToChunkCoord } from '../core/coords';
import { setupTempPan } from './TempPan';
import type { Overlay } from '../worldgen/Generator';
import type { WorldSeed } from '../core/types';

const SEED: WorldSeed = 1337;
const OVERLAYS: Overlay[] = []; // M1: empty (castle is a P4 overlay)

/** Composition root: stream chunks around a (temporarily WASD-panned) camera. */
export class Game {
  static boot(canvas: HTMLCanvasElement): void {
    const registry = new BlockRegistry();
    const renderer = new Renderer(canvas);
    const texture = createTextureArray();
    const material = createChunkMaterial(texture);

    const sink = new ChunkMeshRegistry(renderer.scene, material);
    const manager = new ChunkManager(
      new HeightmapGenerator(),
      new GreedyMesher(registry),
      sink,
      SEED,
      OVERLAYS,
    );

    const pan = setupTempPan(renderer.camera, renderer.controls);

    renderer.start((dt) => {
      pan(dt);
      const cx = worldToChunkCoord(Math.floor(renderer.camera.position.x));
      const cz = worldToChunkCoord(Math.floor(renderer.camera.position.z));
      manager.update(cx, cz);
    });
  }
}
