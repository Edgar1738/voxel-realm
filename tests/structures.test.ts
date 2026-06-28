import { describe, it, expect } from 'vitest';
import { scatterStructures, placementAt, type Structure } from '../src/worldgen/Structures';
import { ChunkData } from '../src/world/ChunkData';
import { CHUNK_SIZE_X, CHUNK_SIZE_Z, WORLD_HEIGHT } from '../src/core/constants';
import { AIR, COBBLESTONE } from '../src/blocks/blocks';
import type { BlockId } from '../src/core/types';

/** A simple 3x2x3 solid box prefab for predictable placement assertions. */
function box(): Structure {
  const blocks: Array<[number, number, number, BlockId]> = [];
  for (let y = 0; y < 2; y++)
    for (let z = 0; z < 3; z++) for (let x = 0; x < 3; x++) blocks.push([x, y, z, COBBLESTONE]);
  return { dims: [3, 2, 3], blocks };
}

const flatAt = (_seed: number, _x: number, _z: number): number => 64;

function nonAir(chunk: ChunkData): number {
  let n = 0;
  for (const v of chunk.data) if (v !== AIR) n++;
  return n;
}

describe('placementAt', () => {
  const opts = { cellSize: 8, surfaceAt: flatAt, density: 1, salt: 0 };

  it('is deterministic for the same (seed, cell)', () => {
    const a = placementAt([box()], opts, 1337, 2, -3);
    const b = placementAt([box()], opts, 1337, 2, -3);
    expect(a).toEqual(b);
  });

  it('returns null when density is 0 and a placement when density is 1', () => {
    expect(placementAt([box()], { ...opts, density: 0 }, 1337, 0, 0)).toBeNull();
    expect(placementAt([box()], { ...opts, density: 1 }, 1337, 0, 0)).not.toBeNull();
  });

  it('places the origin inside the cell, leaving room for the footprint', () => {
    for (let c = 0; c < 20; c++) {
      const p = placementAt([box()], opts, 99, c, 0);
      expect(p).not.toBeNull();
      const cellMinX = c * opts.cellSize;
      expect(p!.ox).toBeGreaterThanOrEqual(cellMinX);
      expect(p!.ox).toBeLessThanOrEqual(cellMinX + (opts.cellSize - 3)); // room for width 3
    }
  });

  it('snaps the origin Y to the surface', () => {
    const p = placementAt([box()], opts, 7, 1, 1)!;
    expect(p.oy).toBe(flatAt(7, p.ox, p.oz));
  });
});

describe('scatterStructures overlay', () => {
  const opts = { cellSize: 8, surfaceAt: flatAt, density: 1, salt: 0 };

  it('is deterministic: same seed/chunk -> identical voxels', () => {
    const a = new ChunkData(0, 0);
    const b = new ChunkData(0, 0);
    scatterStructures([box()], opts)(a, 0, 0, 1337);
    scatterStructures([box()], opts)(b, 0, 0, 1337);
    expect(Array.from(a.data)).toEqual(Array.from(b.data));
  });

  it('places nothing at density 0 and something at density 1', () => {
    const empty = new ChunkData(0, 0);
    scatterStructures([box()], { ...opts, density: 0 })(empty, 0, 0, 1337);
    expect(nonAir(empty)).toBe(0);
    const full = new ChunkData(0, 0);
    scatterStructures([box()], { ...opts, density: 1 })(full, 0, 0, 1337);
    expect(nonAir(full)).toBeGreaterThan(0);
  });

  it('only writes blocks at the snapped surface height band', () => {
    const c = new ChunkData(0, 0);
    scatterStructures([box()], opts)(c, 0, 0, 1337);
    for (let x = 0; x < CHUNK_SIZE_X; x++)
      for (let z = 0; z < CHUNK_SIZE_Z; z++)
        for (let y = 0; y < WORLD_HEIGHT; y++)
          if (c.get(x, y, z) !== AIR) expect(y === 64 || y === 65).toBe(true);
  });

  it('does not throw on structures near the world ceiling (clips out-of-range Y)', () => {
    const high = { ...opts, surfaceAt: () => WORLD_HEIGHT - 1 };
    const c = new ChunkData(0, 0);
    expect(() => scatterStructures([box()], high)(c, 0, 0, 1337)).not.toThrow();
  });

  it('stamps a border-straddling structure consistently across both chunks', () => {
    // cellSize 10 does not divide the 16-wide chunk, so cell x=1 (world 10..19) crosses the
    // x=16 border. Search seeds for a placement whose box (width 3) straddles it (ox in 14..15).
    const sOpts = { cellSize: 10, surfaceAt: flatAt, density: 1, salt: 0 };
    let seed = -1;
    let placed = null as ReturnType<typeof placementAt>;
    for (let s = 1; s <= 1000 && !placed; s++) {
      const p = placementAt([box()], sOpts, s, 1, 0);
      if (p && p.ox >= CHUNK_SIZE_X - 2 && p.ox <= CHUNK_SIZE_X - 1) {
        seed = s;
        placed = p;
      }
    }
    expect(placed, 'expected a border-straddling placement').not.toBeNull();
    const left = new ChunkData(0, 0);
    const right = new ChunkData(1, 0);
    scatterStructures([box()], sOpts)(left, 0, 0, seed);
    scatterStructures([box()], sOpts)(right, 1, 0, seed);
    // every structure block must appear in whichever chunk owns its world column
    let crossedBorder = false;
    for (const [dx, dy, dz, id] of placed!.structure.blocks) {
      const wx = placed!.ox + dx;
      const wy = placed!.oy + dy;
      const wz = placed!.oz + dz;
      if (wx >= CHUNK_SIZE_X) crossedBorder = true;
      const owner = wx < CHUNK_SIZE_X ? left : right;
      expect(owner.get(wx - owner.cx * CHUNK_SIZE_X, wy, wz)).toBe(id);
    }
    expect(crossedBorder, 'placement should span both chunks').toBe(true);
  });
});
