import { describe, it, expect } from 'vitest';
import { ChunkManager } from '../src/world/ChunkManager';
import { GreedyMesher } from '../src/mesh/GreedyMesher';
import { BlockRegistry } from '../src/blocks/BlockRegistry';
import { buildBlockTextures, type BlockDef } from '../src/blocks/blocks';
import { ChunkData } from '../src/world/ChunkData';
import type { ChunkMeshes } from '../src/mesh/MeshTypes';
import type { Generator } from '../src/worldgen/Generator';

const stoneFaces = {
  pattern: 'stone' as const,
  colors: [[128, 128, 132]] as [number, number, number][],
};
const DEFS: BlockDef[] = [
  { id: 0, name: 'air', opaque: false, transparent: true },
  { id: 1, name: 'slab', opaque: true, transparent: false, shape: 'slab', faces: stoneFaces },
  {
    id: 2,
    name: 'plant',
    opaque: false,
    transparent: false,
    shape: 'cross',
    faces: { pattern: 'tallGrass' as const, colors: [[60, 140, 60] as [number, number, number]] },
  },
];
const SLAB = 1;
const PLANT = 2;
const registry = new BlockRegistry(DEFS, buildBlockTextures(DEFS));

class OneBlock implements Generator {
  constructor(
    private readonly id: number,
    private readonly y: number,
  ) {}
  generateBaseChunk(_s: number, cx: number, cz: number): ChunkData {
    const d = new ChunkData(cx, cz);
    if (cx === 0 && cz === 0) d.set(0, this.y, 0, this.id);
    return d;
  }
}

function capture(): {
  sink: { upload: (k: string, m: ChunkMeshes) => void; dispose: () => void };
  meshes: Map<string, ChunkMeshes>;
} {
  const meshes = new Map<string, ChunkMeshes>();
  return { sink: { upload: (k, m) => meshes.set(k, m), dispose: () => {} }, meshes };
}

describe('ChunkManager shaped meshing + solidBox', () => {
  it('routes a cross plant into the cutout mesh, not opaque', () => {
    const { sink, meshes } = capture();
    const mgr = new ChunkManager(
      new OneBlock(PLANT, 40),
      new GreedyMesher(registry),
      registry,
      sink,
      1,
      [],
    );
    mgr.preload(0, 0, 0);
    const m = meshes.get('0,0')!;
    expect(m.cutout.indices.length).toBeGreaterThan(0);
    expect(m.opaque.indices.length).toBe(0);
  });

  it('routes a slab into the opaque mesh and reports a lowerHalf collision box', () => {
    const { sink, meshes } = capture();
    const mgr = new ChunkManager(
      new OneBlock(SLAB, 40),
      new GreedyMesher(registry),
      registry,
      sink,
      1,
      [],
    );
    mgr.preload(0, 0, 0);
    expect(meshes.get('0,0')!.opaque.indices.length).toBeGreaterThan(0);
    expect(mgr.solidBox(0, 40, 0)).toBe('lowerHalf');
    expect(mgr.solidBox(0, 41, 0)).toBe('none'); // air above
  });
});
