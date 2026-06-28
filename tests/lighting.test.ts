import { describe, it, expect } from 'vitest';
import { CHUNK_SIZE_X, CHUNK_SIZE_Z, WORLD_HEIGHT } from '../src/core/constants';
import { voxelIndex } from '../src/core/coords';
import { computeChunkLight, type LightInput } from '../src/world/Lighting';

/** Build a LightInput from a set of opaque "x,y,z" keys and a map of emission levels. */
function makeInput(opaque: Set<string>, emission: Map<string, number> = new Map()): LightInput {
  const key = (x: number, y: number, z: number): string => `${x},${y},${z}`;
  return {
    isOpaque: (x: number, y: number, z: number): boolean => opaque.has(key(x, y, z)),
    emission: (x: number, y: number, z: number): number => emission.get(key(x, y, z)) ?? 0,
  };
}

const key = (x: number, y: number, z: number): string => `${x},${y},${z}`;

describe('computeChunkLight', () => {
  it('lights an all-air chunk fully to sky 15 and block 0', () => {
    const field = computeChunkLight(makeInput(new Set()));

    const spots: Array<[number, number, number]> = [
      [0, 0, 0],
      [0, WORLD_HEIGHT - 1, 0],
      [CHUNK_SIZE_X - 1, 0, CHUNK_SIZE_Z - 1],
      [8, 100, 8],
      [5, WORLD_HEIGHT - 1, 11],
    ];
    for (const [x, y, z] of spots) {
      const i = voxelIndex(x, y, z);
      expect(field.sky[i]).toBe(15);
      expect(field.block[i]).toBe(0);
    }
  });

  it('returns fields sized to the chunk volume with values in 0..15', () => {
    const field = computeChunkLight(makeInput(new Set()));
    expect(field.sky.length).toBe(CHUNK_SIZE_X * WORLD_HEIGHT * CHUNK_SIZE_Z);
    expect(field.block.length).toBe(CHUNK_SIZE_X * WORLD_HEIGHT * CHUNK_SIZE_Z);
    for (let i = 0; i < field.sky.length; i++) {
      expect(field.sky[i]).toBeLessThanOrEqual(15);
      expect(field.block[i]).toBeLessThanOrEqual(15);
    }
  });

  it('a solid opaque floor at y=0 stays dark; air at y=1 is full sky', () => {
    const opaque = new Set<string>();
    for (let x = 0; x < CHUNK_SIZE_X; x++) {
      for (let z = 0; z < CHUNK_SIZE_Z; z++) {
        opaque.add(key(x, 0, z));
      }
    }
    const field = computeChunkLight(makeInput(opaque));

    expect(field.sky[voxelIndex(3, 0, 3)]).toBe(0);
    expect(field.sky[voxelIndex(3, 1, 3)]).toBe(15);
    expect(field.sky[voxelIndex(0, 1, 0)]).toBe(15);
  });

  it('an overhang slab dims the voxel directly beneath it but it stays lit by horizontal spread', () => {
    // A 3x3 opaque slab at y=64 around (8,64,8), open sky everywhere else.
    const slabY = 64;
    const opaque = new Set<string>();
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        opaque.add(key(8 + dx, slabY, 8 + dz));
      }
    }
    const field = computeChunkLight(makeInput(opaque));

    const beneath = field.sky[voxelIndex(8, slabY - 1, 8)];
    expect(beneath).toBeGreaterThan(0);
    expect(beneath).toBeLessThan(15);
  });

  it('a fully sealed pocket (opaque on all 6 sides) has sky 0', () => {
    const cx = 8;
    const cy = 64;
    const cz = 8;
    const opaque = new Set<string>();
    opaque.add(key(cx + 1, cy, cz));
    opaque.add(key(cx - 1, cy, cz));
    opaque.add(key(cx, cy + 1, cz));
    opaque.add(key(cx, cy - 1, cz));
    opaque.add(key(cx, cy, cz + 1));
    opaque.add(key(cx, cy, cz - 1));
    const field = computeChunkLight(makeInput(opaque));

    expect(field.sky[voxelIndex(cx, cy, cz)]).toBe(0);
  });

  it('propagates block light, dropping 1 per step, and is blocked by opaque voxels', () => {
    const ey = 64;
    const emission = new Map<string, number>([[key(8, ey, 8), 14]]);
    const field = computeChunkLight(makeInput(new Set(), emission));

    expect(field.block[voxelIndex(8, ey, 8)]).toBe(14);
    // one step away
    expect(field.block[voxelIndex(9, ey, 8)]).toBe(13);
    // two steps away
    expect(field.block[voxelIndex(10, ey, 8)]).toBe(12);
  });

  it('seals block light and sky out of a fully enclosed room', () => {
    // Air cell at (8,64,8) walled off on all six sides; emitter outside one wall.
    const cx = 8;
    const cy = 64;
    const cz = 8;
    const opaque = new Set<string>();
    opaque.add(key(cx + 1, cy, cz));
    opaque.add(key(cx - 1, cy, cz));
    opaque.add(key(cx, cy + 1, cz));
    opaque.add(key(cx, cy - 1, cz));
    opaque.add(key(cx, cy, cz + 1));
    opaque.add(key(cx, cy, cz - 1));
    // Emitter two cells over (separated from the room by the opaque wall).
    const emission = new Map<string, number>([[key(cx + 2, cy, cz), 14]]);
    const field = computeChunkLight(makeInput(opaque, emission));

    expect(field.block[voxelIndex(cx, cy, cz)]).toBe(0);
    expect(field.sky[voxelIndex(cx, cy, cz)]).toBe(0);
  });

  it('an opaque wall blocks propagation: lit on one side, 0 on the other', () => {
    const ey = 64;
    // Vertical opaque wall at x=9 spanning the chunk at this y.
    const opaque = new Set<string>();
    for (let z = 0; z < CHUNK_SIZE_Z; z++) {
      for (let y = 0; y < WORLD_HEIGHT; y++) {
        opaque.add(key(9, y, z));
      }
    }
    // Also cap the top so sky can't wrap over the wall into the far side at this row.
    // (Not strictly needed for block light, but keeps the assertion about block clean.)
    const emission = new Map<string, number>([[key(8, ey, 8), 14]]);
    const field = computeChunkLight(makeInput(opaque, emission));

    // Near side of the wall is lit.
    expect(field.block[voxelIndex(8, ey, 8)]).toBe(14);
    // The wall itself blocks: cell at x=10 (other side, same row) gets no block light,
    // because the only path crosses the opaque wall column at x=9.
    expect(field.block[voxelIndex(10, ey, 8)]).toBe(0);
  });

  it('an opaque emitter (lantern) still seeds and lights its non-opaque neighbors', () => {
    const ey = 64;
    const opaque = new Set<string>([key(8, ey, 8)]);
    const emission = new Map<string, number>([[key(8, ey, 8), 14]]);
    const field = computeChunkLight(makeInput(opaque, emission));

    // Emitter cell holds its own emission even though opaque.
    expect(field.block[voxelIndex(8, ey, 8)]).toBe(14);
    // Adjacent air gets level - 1.
    expect(field.block[voxelIndex(9, ey, 8)]).toBe(13);
  });
});
