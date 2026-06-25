import { Renderer } from '../render/Renderer';
import { createTextureArray } from '../render/TextureArray';
import { createChunkMaterial } from '../render/ChunkMaterial';
import { buildChunkMesh } from '../render/buildChunkMesh';
import { HeightmapGenerator } from '../worldgen/HeightmapGenerator';
import { applyOverlays, type Overlay } from '../worldgen/Generator';
import { BlockRegistry } from '../blocks/BlockRegistry';
import { BasicMesher } from '../mesh/BasicMesher';
import type { WorldSeed } from '../core/types';

const SEED: WorldSeed = 1337;
const OVERLAYS: Overlay[] = []; // M1: empty (castle is a P4 overlay)

/** Composition root: generate one chunk, mesh it, upload it, render it. */
export class Game {
  static boot(canvas: HTMLCanvasElement): void {
    const registry = new BlockRegistry();
    const generator = new HeightmapGenerator();
    const mesher = new BasicMesher(registry);

    const chunk = generator.generateBaseChunk(SEED, 0, 0);
    applyOverlays(chunk, 0, 0, SEED, OVERLAYS);
    const meshData = mesher.mesh(chunk);

    const renderer = new Renderer(canvas);
    const texture = createTextureArray();
    const material = createChunkMaterial(texture);
    const mesh = buildChunkMesh(meshData, material);
    renderer.add(mesh);
    renderer.start();
  }
}
