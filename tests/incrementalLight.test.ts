import { describe, it, expect } from 'vitest';
import { CHUNK_SIZE_X, CHUNK_SIZE_Z, WORLD_HEIGHT } from '../src/core/constants';
import { chunkKey, voxelIndex, worldToChunkCoord, worldToLocal } from '../src/core/coords';
import { ChunkData } from '../src/world/ChunkData';
import { BlockRegistry } from '../src/blocks/BlockRegistry';
import { AIR, STONE, GLASS, LANTERN, CRYSTAL, GLOWSTONE } from '../src/blocks/blocks';
import { computeChunkLight, applyBorderBlockLight, type LightInput } from '../src/world/Lighting';
import {
  updateBlockLight,
  updateSkyLight,
  type LightWorld,
  type SkyChunk,
  type VoxelLightProps,
} from '../src/world/IncrementalLight';
import type { BlockId } from '../src/core/types';

/**
 * A small multi-chunk voxel world used to check that {@link updateBlockLight} /
 * {@link updateSkyLight} (incremental relight of one edit) produce a light field
 * byte-identical to a full {@link computeChunkLight} recompute of the whole region.
 *
 * `fullRelight()` is the oracle: recompute every chunk locally, then iterate the cross-chunk
 * block-light border seed to a fixpoint — exactly the production full-recompute semantics.
 */
class TestWorld {
  readonly registry = new BlockRegistry();
  readonly chunks = new Map<string, ChunkData>();

  constructor(
    private readonly cx0: number,
    private readonly cz0: number,
    private readonly cx1: number,
    private readonly cz1: number,
  ) {
    for (let cz = cz0; cz <= cz1; cz++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        this.chunks.set(chunkKey(cx, cz), new ChunkData(cx, cz));
      }
    }
  }

  private chunkAt(wx: number, wz: number): ChunkData | undefined {
    return this.chunks.get(chunkKey(worldToChunkCoord(wx), worldToChunkCoord(wz)));
  }

  /** Bulk voxel write during setup (does not relight). */
  set(wx: number, wy: number, wz: number, id: BlockId): void {
    const c = this.chunkAt(wx, wz);
    if (!c) throw new Error(`set outside world at ${wx},${wz}`);
    c.set(worldToLocal(wx), wy, worldToLocal(wz), id);
  }

  getBlock(wx: number, wy: number, wz: number): BlockId {
    const c = this.chunkAt(wx, wz);
    if (!c || wy < 0 || wy >= WORLD_HEIGHT) return AIR;
    return c.get(worldToLocal(wx), wy, worldToLocal(wz));
  }

  private inputFor(data: ChunkData): LightInput {
    return {
      isOpaque: (x, y, z) => this.registry.isOpaque(data.get(x, y, z)),
      emission: (x, y, z) => this.registry.emission(data.get(x, y, z)),
    };
  }

  /** Oracle: full recompute of every chunk, then border-seed block light to a fixpoint. */
  fullRelight(): void {
    for (const data of this.chunks.values()) {
      data.recomputeMaxSolidY();
      const field = computeChunkLight(this.inputFor(data), data.maxSolidY);
      data.skyLight.set(field.sky);
      data.blockLight.set(field.block);
    }
    let changed = true;
    let guard = 0;
    while (changed && guard++ < 128) {
      changed = false;
      for (const data of this.chunks.values()) {
        const raised = applyBorderBlockLight(
          data.blockLight,
          this.inputFor(data),
          (dcx, dcz, lx, y, lz) => {
            const nb = this.chunks.get(chunkKey(data.cx + dcx, data.cz + dcz));
            return nb ? nb.getBlockLight(lx, y, lz) : 0;
          },
        );
        if (raised) changed = true;
      }
    }
  }

  /** Cross-chunk block-light grid for the incremental relighter. */
  private lightWorld(dirty: Set<string>): LightWorld {
    return {
      isOpaque: (wx, wy, wz) => this.registry.isOpaque(this.getBlock(wx, wy, wz)),
      emission: (wx, wy, wz) => this.registry.emission(this.getBlock(wx, wy, wz)),
      isLoaded: (wx, wz) => this.chunkAt(wx, wz) !== undefined,
      getBlockLight: (wx, wy, wz) => {
        const c = this.chunkAt(wx, wz);
        if (!c || wy < 0 || wy >= WORLD_HEIGHT) return 0;
        return c.blockLight[voxelIndex(worldToLocal(wx), wy, worldToLocal(wz))];
      },
      setBlockLight: (wx, wy, wz, v) => {
        const c = this.chunkAt(wx, wz);
        if (!c) return;
        c.blockLight[voxelIndex(worldToLocal(wx), wy, worldToLocal(wz))] = v;
      },
      markDirty: (wx, wz) => dirty.add(chunkKey(worldToChunkCoord(wx), worldToChunkCoord(wz))),
    };
  }

  private skyChunk(data: ChunkData): SkyChunk {
    return {
      get maxSolidY() {
        return data.maxSolidY;
      },
      isOpaque: (x, y, z) => this.registry.isOpaque(data.get(x, y, z)),
      getSky: (x, y, z) => data.skyLight[voxelIndex(x, y, z)],
      setSky: (x, y, z, v) => {
        data.skyLight[voxelIndex(x, y, z)] = v;
      },
    };
  }

  private props(id: BlockId): VoxelLightProps {
    return { opaque: this.registry.isOpaque(id), emission: this.registry.emission(id) };
  }

  /** Apply a single voxel edit incrementally (mirrors ChunkManager.applyEdits' relight). */
  editIncremental(wx: number, wy: number, wz: number, id: BlockId): void {
    const before = this.props(this.getBlock(wx, wy, wz));
    this.set(wx, wy, wz, id); // ChunkData.set maintains maxSolidY, like production
    const after = this.props(id);
    const data = this.chunkAt(wx, wz);
    if (!data) return;
    const lx = worldToLocal(wx);
    const lz = worldToLocal(wz);
    updateSkyLight(this.skyChunk(data), lx, wy, lz, before, after);
    updateBlockLight(this.lightWorld(new Set()), wx, wy, wz, before, after);
  }

  clone(): TestWorld {
    const copy = new TestWorld(this.cx0, this.cz0, this.cx1, this.cz1);
    for (const [key, data] of this.chunks) {
      const c = copy.chunks.get(key)!;
      c.data.set(data.data);
      c.skyLight.set(data.skyLight);
      c.blockLight.set(data.blockLight);
      c.state.set(data.state);
      c.maxSolidY = data.maxSolidY;
      c.hasShaped = data.hasShaped;
    }
    return copy;
  }
}

/** Assert two worlds have byte-identical sky+block light in every chunk. */
function expectSameLight(a: TestWorld, b: TestWorld): void {
  for (const [key, ca] of a.chunks) {
    const cb = b.chunks.get(key)!;
    for (let i = 0; i < ca.skyLight.length; i++) {
      if (ca.skyLight[i] !== cb.skyLight[i]) {
        const x = i % CHUNK_SIZE_X;
        const rest = (i - x) / CHUNK_SIZE_X;
        const z = rest % CHUNK_SIZE_Z;
        const y = (rest - z) / CHUNK_SIZE_Z;
        expect(
          ca.skyLight[i],
          `sky mismatch in chunk ${key} at local (${x},${y},${z}): incremental=${ca.skyLight[i]} full=${cb.skyLight[i]}`,
        ).toBe(cb.skyLight[i]);
      }
    }
    for (let i = 0; i < ca.blockLight.length; i++) {
      if (ca.blockLight[i] !== cb.blockLight[i]) {
        const x = i % CHUNK_SIZE_X;
        const rest = (i - x) / CHUNK_SIZE_X;
        const z = rest % CHUNK_SIZE_Z;
        const y = (rest - z) / CHUNK_SIZE_Z;
        expect(
          ca.blockLight[i],
          `block mismatch in chunk ${key} at local (${x},${y},${z}): incremental=${ca.blockLight[i]} full=${cb.blockLight[i]}`,
        ).toBe(cb.blockLight[i]);
      }
    }
  }
}

/**
 * Run one edit both ways from the same converged start state and assert they match:
 *   - incremental relight of the edit, vs
 *   - a full from-scratch recompute of the post-edit voxels.
 */
function checkEdit(
  build: (w: TestWorld) => void,
  wx: number,
  wy: number,
  wz: number,
  id: BlockId,
  bounds: [number, number, number, number] = [-1, -1, 1, 1],
): void {
  const base = new TestWorld(...bounds);
  build(base);
  base.fullRelight(); // converge the pre-edit state

  const inc = base.clone();
  inc.editIncremental(wx, wy, wz, id);

  const full = base.clone();
  full.set(wx, wy, wz, id);
  full.fullRelight();

  expectSameLight(inc, full);
}

describe('incremental block light matches a full recompute', () => {
  const FLOOR = 40;
  const buildFloor = (w: TestWorld): void => {
    for (let wx = -CHUNK_SIZE_X; wx < 2 * CHUNK_SIZE_X; wx++) {
      for (let wz = -CHUNK_SIZE_Z; wz < 2 * CHUNK_SIZE_Z; wz++) {
        for (let y = 0; y <= FLOOR; y++) w.set(wx, y, wz, STONE);
      }
    }
  };

  it('places an emitter in open air above a floor', () => {
    checkEdit(buildFloor, 8, FLOOR + 3, 8, LANTERN);
  });

  it('removes an emitter (removal + refill)', () => {
    checkEdit(
      (w) => {
        buildFloor(w);
        w.set(8, FLOOR + 3, 8, LANTERN);
      },
      8,
      FLOOR + 3,
      8,
      AIR,
    );
  });

  it('replaces an emitter with a dimmer emitter', () => {
    checkEdit(
      (w) => {
        buildFloor(w);
        w.set(8, FLOOR + 3, 8, GLOWSTONE);
      },
      8,
      FLOOR + 3,
      8,
      CRYSTAL,
    );
  });

  it('replaces an emitter with opaque stone', () => {
    checkEdit(
      (w) => {
        buildFloor(w);
        w.set(8, FLOOR + 3, 8, LANTERN);
      },
      8,
      FLOOR + 3,
      8,
      STONE,
    );
  });

  it('replaces opaque stone with an emitter', () => {
    checkEdit(
      (w) => {
        buildFloor(w);
        w.set(8, FLOOR + 1, 8, STONE);
      },
      8,
      FLOOR + 1,
      8,
      LANTERN,
    );
  });

  for (const [name, lx, lz] of [
    ['west border (x=0)', 0, 8],
    ['east border (x=15)', CHUNK_SIZE_X - 1, 8],
    ['north border (z=0)', 8, 0],
    ['south border (z=15)', 8, CHUNK_SIZE_Z - 1],
    ['corner (0,0)', 0, 0],
    ['corner (15,15)', CHUNK_SIZE_X - 1, CHUNK_SIZE_Z - 1],
  ] as const) {
    it(`places an emitter at ${name} (cross-chunk propagation)`, () => {
      checkEdit(buildFloor, lx, FLOOR + 3, lz, GLOWSTONE);
    });

    it(`removes an emitter at ${name} (cross-chunk unwind)`, () => {
      checkEdit(
        (w) => {
          buildFloor(w);
          w.set(lx, FLOOR + 3, lz, GLOWSTONE);
        },
        lx,
        FLOOR + 3,
        lz,
        AIR,
      );
    });
  }

  it('places opaque stone that shadows an emitter across a seam', () => {
    // Emitter at east border of chunk (0,0); wall it off inside chunk (1,0).
    checkEdit(
      (w) => {
        buildFloor(w);
        w.set(CHUNK_SIZE_X - 1, FLOOR + 3, 8, GLOWSTONE);
      },
      CHUNK_SIZE_X, // world x=16 -> chunk (1,0) local x=0, right across the seam
      FLOOR + 3,
      8,
      STONE,
    );
  });

  it('opens an opaque wall between an emitter and a dark pocket', () => {
    checkEdit(
      (w) => {
        buildFloor(w);
        w.set(8, FLOOR + 3, 8, GLOWSTONE);
        // A wall of stone at x=10 sealing x>=11 from the emitter.
        for (let y = FLOOR + 1; y <= FLOOR + 5; y++) {
          for (let z = 5; z <= 11; z++) w.set(10, y, z, STONE);
        }
      },
      10,
      FLOOR + 3,
      8,
      AIR,
    );
  });
});

describe('incremental sky light matches a full recompute', () => {
  const SURFACE = 50;
  const buildSurface = (w: TestWorld): void => {
    for (let wx = -CHUNK_SIZE_X; wx < 2 * CHUNK_SIZE_X; wx++) {
      for (let wz = -CHUNK_SIZE_Z; wz < 2 * CHUNK_SIZE_Z; wz++) {
        for (let y = 0; y <= SURFACE; y++) w.set(wx, y, wz, STONE);
      }
    }
  };

  it('breaks the top surface voxel (opens the column to sky)', () => {
    checkEdit(buildSurface, 8, SURFACE, 8, AIR);
  });

  it('digs two voxels down (still open to sky)', () => {
    checkEdit(
      (w) => {
        buildSurface(w);
        w.set(8, SURFACE, 8, AIR);
      },
      8,
      SURFACE - 1,
      8,
      AIR,
    );
  });

  it('places an aerial opaque block over open terrain (1x1 shadow)', () => {
    checkEdit(buildSurface, 8, SURFACE + 20, 8, STONE);
  });

  it('places an aerial opaque block high over a tall column (moonspire/flat@y100 worst case)', () => {
    checkEdit(
      (w) => {
        // A tall solid pillar to y=140 in the center column, floor elsewhere.
        buildSurface(w);
        for (let y = SURFACE + 1; y <= 140; y++) w.set(7, y, 7, STONE);
      },
      8,
      150,
      8,
      STONE,
    );
  });

  it('removes a sky-blocking ceiling voxel (sky floods down)', () => {
    checkEdit(
      (w) => {
        buildSurface(w);
        // A ceiling slab at y=SURFACE+6 with a room of air beneath it.
        for (let x = 4; x <= 12; x++) {
          for (let z = 4; z <= 12; z++) w.set(x, SURFACE + 6, z, STONE);
        }
      },
      8,
      SURFACE + 6,
      8,
      AIR,
    );
  });

  it('places opaque under an overhang (shadowed cell becomes opaque)', () => {
    checkEdit(
      (w) => {
        buildSurface(w);
        // Overhang slab at y=SURFACE+5, air beneath.
        for (let x = 4; x <= 12; x++) {
          for (let z = 4; z <= 12; z++) w.set(x, SURFACE + 5, z, STONE);
        }
      },
      8,
      SURFACE + 2,
      8,
      STONE,
    );
  });

  it('breaks a wall under an overhang (transparent spread-receiver)', () => {
    checkEdit(
      (w) => {
        buildSurface(w);
        for (let x = 4; x <= 12; x++) {
          for (let z = 4; z <= 12; z++) w.set(x, SURFACE + 5, z, STONE); // ceiling
        }
        w.set(8, SURFACE + 2, 8, STONE); // a wall block under the ceiling
      },
      8,
      SURFACE + 2,
      8,
      AIR,
    );
  });

  it('glass placement (transparent, no emission) is a light no-op', () => {
    checkEdit(buildSurface, 8, SURFACE + 3, 8, GLASS);
  });

  it('dirt->stone style opaque swap is a light no-op', () => {
    // STONE already at the surface; re-place STONE (same opacity/emission) — nothing should move.
    checkEdit(buildSurface, 8, SURFACE, 8, STONE);
  });
});

describe('incremental relight — chained edits and fuzz', () => {
  const FLOOR = 40;

  it('matches after a chain of edits (dig a tunnel + place lanterns)', () => {
    const build = (w: TestWorld): void => {
      for (let wx = -CHUNK_SIZE_X; wx < 2 * CHUNK_SIZE_X; wx++) {
        for (let wz = -CHUNK_SIZE_Z; wz < 2 * CHUNK_SIZE_Z; wz++) {
          for (let y = 0; y <= FLOOR; y++) w.set(wx, y, wz, STONE);
        }
      }
    };
    const base = new TestWorld(-1, -1, 1, 1);
    build(base);
    base.fullRelight();

    const inc = base.clone();
    // Tunnel from x=2..29 at y=FLOOR (crosses the (0,0)->(1,0) seam), lantern every 6 blocks.
    for (let wx = 2; wx <= 29; wx++) {
      inc.editIncremental(wx, FLOOR, 8, AIR);
      if (wx % 6 === 0) inc.editIncremental(wx, FLOOR, 8, LANTERN);
    }

    const full = base.clone();
    for (let wx = 2; wx <= 29; wx++) {
      full.set(wx, FLOOR, 8, AIR);
      if (wx % 6 === 0) full.set(wx, FLOOR, 8, LANTERN);
    }
    full.fullRelight();

    expectSameLight(inc, full);
  });

  it('matches a full recompute after each of many random edits (seeded fuzz)', () => {
    // Deterministic PRNG (mulberry32).
    let s = 0x9e3779b9 >>> 0;
    const rnd = (): number => {
      s |= 0;
      s = (s + 0x6d2b79f5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const pick = <T>(arr: readonly T[]): T => arr[Math.floor(rnd() * arr.length)];
    const palette: BlockId[] = [AIR, AIR, STONE, STONE, GLASS, LANTERN, CRYSTAL, GLOWSTONE];

    const build = (w: TestWorld): void => {
      for (let wx = -CHUNK_SIZE_X; wx < 2 * CHUNK_SIZE_X; wx++) {
        for (let wz = -CHUNK_SIZE_Z; wz < 2 * CHUNK_SIZE_Z; wz++) {
          for (let y = 0; y <= FLOOR; y++) w.set(wx, y, wz, STONE);
        }
      }
    };
    const inc = new TestWorld(-1, -1, 1, 1);
    build(inc);
    inc.fullRelight();

    for (let n = 0; n < 120; n++) {
      // Edit anywhere in chunk (0,0) plus a 1-voxel margin so borders get exercised, at a
      // y-range spanning below and above the floor surface.
      const wx = Math.floor(rnd() * (CHUNK_SIZE_X + 2)) - 1; // -1..16
      const wz = Math.floor(rnd() * (CHUNK_SIZE_Z + 2)) - 1;
      const wy = FLOOR - 2 + Math.floor(rnd() * 12); // FLOOR-2 .. FLOOR+9
      const id = pick(palette);
      inc.editIncremental(wx, wy, wz, id);

      const full = inc.clone();
      full.fullRelight();
      expectSameLight(inc, full);
    }
  });
});
