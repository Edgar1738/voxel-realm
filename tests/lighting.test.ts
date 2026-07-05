import { describe, it, expect } from 'vitest';
import { CHUNK_SIZE_X, CHUNK_SIZE_Z, WORLD_HEIGHT } from '../src/core/constants';
import { voxelIndex } from '../src/core/coords';
import {
  computeChunkLight,
  applyBorderBlockLight,
  borderLightExport,
  type LightInput,
  type NeighborBlockLight,
} from '../src/world/Lighting';

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

  /** Assert a maxSolidY-capped compute equals a full compute at EVERY cell. */
  function expectCappedEqualsFull(input: LightInput, maxSolidY: number): void {
    const full = computeChunkLight(input);
    const capped = computeChunkLight(input, maxSolidY);
    for (let i = 0; i < full.sky.length; i++) {
      expect(capped.sky[i]).toBe(full.sky[i]);
      expect(capped.block[i]).toBe(full.block[i]);
    }
  }

  it('capping at maxSolidY is byte-identical to a full compute at every cell', () => {
    // Terrain-like input: a solid floor 0..40, a pillar to y=60 at (8,*,8) with a lantern on top.
    const opaque = new Set<string>();
    const emission = new Map<string, number>();
    for (let y = 0; y <= 40; y++) {
      for (let x = 0; x < CHUNK_SIZE_X; x++) {
        for (let z = 0; z < CHUNK_SIZE_Z; z++) opaque.add(key(x, y, z));
      }
    }
    for (let y = 41; y <= 60; y++) opaque.add(key(8, y, 8));
    emission.set(key(8, 60, 8), 14); // emitter is the topmost solid voxel
    expectCappedEqualsFull(makeInput(opaque, emission), 60);
  });

  it('capping is byte-identical even for a high floating emitter (block light climbs above maxSolidY)', () => {
    // A single floating lantern high above an all-air chunk floor: maxSolidY is the lantern's y,
    // and its block light spreads up to MAX_LIGHT cells ABOVE it — the +MAX_LIGHT flood margin
    // must capture that so the capped result still matches full.
    const emission = new Map<string, number>();
    emission.set(key(8, 120, 8), 15); // max-emission emitter, floating
    expectCappedEqualsFull(makeInput(new Set(), emission), 120);
  });

  it('capping an all-air chunk (maxSolidY -1) still lights fully to sky 15', () => {
    const capped = computeChunkLight(makeInput(new Set()), -1);
    for (let i = 0; i < capped.sky.length; i++) expect(capped.sky[i]).toBe(15);
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

// ---------------------------------------------------------------------------
// applyBorderBlockLight — cross-chunk border-seed pass
// ---------------------------------------------------------------------------

/** Build a zero block-light array seeded from an all-air chunk, then return it. */
function emptyBlockLight(): Uint8Array {
  return new Uint8Array(CHUNK_SIZE_X * WORLD_HEIGHT * CHUNK_SIZE_Z);
}

/** All-air (non-opaque), zero emission — used as the local LightInput for neighbor tests. */
const airInput: LightInput = {
  isOpaque: () => false,
  emission: () => 0,
};

describe('applyBorderBlockLight', () => {
  it('seeds light arriving from the west neighbor and propagates inward', () => {
    // The west neighbor has block light 10 at its east face (x=CHUNK_SIZE_X-1) column y=64, z=0.
    // applyBorderBlockLight should seed our x=0, y=64, z=0 with value 9 and propagate.
    const block = emptyBlockLight();
    const y = 64;
    const getNeighborLight: NeighborBlockLight = (dcx, _dcz, _lx, ly, _lz) => {
      if (dcx === -1 && ly === y) return 10;
      return 0;
    };
    applyBorderBlockLight(block, airInput, getNeighborLight);

    // Border cell (x=0) should get 9, one step in gets 8, etc.
    expect(block[voxelIndex(0, y, 0)]).toBe(9);
    expect(block[voxelIndex(1, y, 0)]).toBe(8);
    expect(block[voxelIndex(2, y, 0)]).toBe(7);
  });

  it('seeds light arriving from the east neighbor', () => {
    const block = emptyBlockLight();
    const y = 64;
    const getNeighborLight: NeighborBlockLight = (dcx, _dcz, _lx, ly, _lz) => {
      if (dcx === 1 && ly === y) return 8;
      return 0;
    };
    applyBorderBlockLight(block, airInput, getNeighborLight);

    const eastFace = CHUNK_SIZE_X - 1;
    expect(block[voxelIndex(eastFace, y, 0)]).toBe(7);
    expect(block[voxelIndex(eastFace - 1, y, 0)]).toBe(6);
  });

  it('seeds light arriving from the south neighbor (dcz=+1)', () => {
    const block = emptyBlockLight();
    const y = 64;
    const getNeighborLight: NeighborBlockLight = (_dcx, dcz, _lx, ly, _lz) => {
      if (dcz === 1 && ly === y) return 6;
      return 0;
    };
    applyBorderBlockLight(block, airInput, getNeighborLight);

    const southFace = CHUNK_SIZE_Z - 1;
    expect(block[voxelIndex(0, y, southFace)]).toBe(5);
    expect(block[voxelIndex(0, y, southFace - 1)]).toBe(4);
  });

  it('does not overwrite a locally-higher value with a lower border seed', () => {
    const block = emptyBlockLight();
    const y = 64;
    // Pre-set a local value of 12 at the border cell.
    block[voxelIndex(0, y, 0)] = 12;
    const getNeighborLight: NeighborBlockLight = (dcx, _dcz, _lx, ly, _lz) => {
      if (dcx === -1 && ly === y) return 8; // would arrive as 7 — less than 12
      return 0;
    };
    applyBorderBlockLight(block, airInput, getNeighborLight);

    // Local value should be unchanged.
    expect(block[voxelIndex(0, y, 0)]).toBe(12);
  });

  it('respects opaque voxels — border seed does not penetrate an opaque wall', () => {
    const block = emptyBlockLight();
    const y = 64;
    // An opaque column at x=0 (the border itself).
    const opaqueInput: LightInput = {
      isOpaque: (x, _y, _z) => x === 0,
      emission: () => 0,
    };
    const getNeighborLight: NeighborBlockLight = (dcx, _dcz, _lx, ly, _lz) => {
      if (dcx === -1 && ly === y) return 14;
      return 0;
    };
    applyBorderBlockLight(block, opaqueInput, getNeighborLight);

    // The opaque border cell stays 0; the cell behind it (x=1) also stays 0.
    expect(block[voxelIndex(0, y, 0)]).toBe(0);
    expect(block[voxelIndex(1, y, 0)]).toBe(0);
  });

  it('returns true when at least one cell was raised, false when nothing changed', () => {
    const block = emptyBlockLight();
    const y = 64;
    const noLight: NeighborBlockLight = () => 0;
    expect(applyBorderBlockLight(block, airInput, noLight)).toBe(false);

    const withLight: NeighborBlockLight = (dcx, _dcz, _lx, ly, _lz) =>
      dcx === -1 && ly === y ? 10 : 0;
    expect(applyBorderBlockLight(block, airInput, withLight)).toBe(true);
  });

  it('returns false when neighbor light is ≤1 (would arrive as 0 — nothing to seed)', () => {
    const block = emptyBlockLight();
    // Neighbor light of 1 would arrive as 0 — should not seed anything.
    const getNeighborLight: NeighborBlockLight = (dcx) => (dcx === -1 ? 1 : 0);
    expect(applyBorderBlockLight(block, airInput, getNeighborLight)).toBe(false);
    // No cell should have been raised.
    for (let i = 0; i < block.length; i++) {
      expect(block[i]).toBe(0);
    }
  });
});

// ---------------------------------------------------------------------------
// borderLightExport
// ---------------------------------------------------------------------------

describe('borderLightExport', () => {
  it('returns all zeros for a zero block-light array', () => {
    const block = new Uint8Array(CHUNK_SIZE_X * WORLD_HEIGHT * CHUNK_SIZE_Z);
    expect(borderLightExport(block)).toEqual([0, 0, 0, 0]);
  });

  it('detects a lit west face (x=0)', () => {
    const block = new Uint8Array(CHUNK_SIZE_X * WORLD_HEIGHT * CHUNK_SIZE_Z);
    // Use z=8 (interior, not on north or south border) to isolate the west-face reading.
    block[voxelIndex(0, 64, 8)] = 12;
    const exp = borderLightExport(block);
    expect(exp[0]).toBe(12); // west
    expect(exp[1]).toBe(0); // east
    expect(exp[2]).toBe(0); // north (z=0 column is 0; the lit cell is at z=8)
    expect(exp[3]).toBe(0); // south
  });

  it('detects a lit east face (x=CHUNK_SIZE_X-1)', () => {
    const block = new Uint8Array(CHUNK_SIZE_X * WORLD_HEIGHT * CHUNK_SIZE_Z);
    block[voxelIndex(CHUNK_SIZE_X - 1, 64, 0)] = 7;
    const exp = borderLightExport(block);
    expect(exp[1]).toBe(7); // east
  });

  it('detects a lit south face (z=CHUNK_SIZE_Z-1)', () => {
    const block = new Uint8Array(CHUNK_SIZE_X * WORLD_HEIGHT * CHUNK_SIZE_Z);
    block[voxelIndex(0, 64, CHUNK_SIZE_Z - 1)] = 5;
    const exp = borderLightExport(block);
    expect(exp[3]).toBe(5); // south
  });
});
