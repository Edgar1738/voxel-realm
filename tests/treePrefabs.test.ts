import { describe, it, expect } from 'vitest';
import {
  oakVariants,
  oakScatterOptions,
  scatterOaks,
  OAK_FOOTPRINT,
  OAK_TRUNK_OFFSET,
} from '../src/worldgen/treePrefabs';
import { scatterStructures, placementAt, type PlacementContext } from '../src/worldgen/Structures';
import { validatePrefab } from '../src/core/Prefab';
import { ChunkData } from '../src/world/ChunkData';
import { CHUNK_SIZE_X, CHUNK_SIZE_Z, SEA_LEVEL, WORLD_HEIGHT } from '../src/core/constants';
import { WOOD, LEAVES } from '../src/blocks/blocks';

const variants = oakVariants();

describe('oakVariants', () => {
  it('produces a library of several variants', () => {
    expect(variants.length).toBeGreaterThanOrEqual(6);
  });

  it('is a deterministic, pure factory', () => {
    expect(oakVariants()).toEqual(oakVariants());
  });

  it('every variant is a structurally valid prefab', () => {
    for (const v of variants) expect(validatePrefab(v)).toBeNull();
  });

  it('shares one uniform footprint so a single anchorOffset fits every variant', () => {
    const [cx, cz] = OAK_TRUNK_OFFSET;
    for (const v of variants) {
      expect(v.dims[0]).toBe(OAK_FOOTPRINT);
      expect(v.dims[2]).toBe(OAK_FOOTPRINT);
      expect(cx).toBe(Math.floor(OAK_FOOTPRINT / 2)); // trunk centered
      expect(cz).toBe(Math.floor(OAK_FOOTPRINT / 2));
    }
  });

  it('roots a centered, contiguous wood trunk starting at dy=0', () => {
    const [cx, cz] = OAK_TRUNK_OFFSET;
    for (const v of variants) {
      const ys = v.blocks
        .filter(([x, , z, id]) => x === cx && z === cz && id === WOOD)
        .map((b) => b[1])
        .sort((a, b) => a - b);
      expect(ys[0]).toBe(0); // base sits on the ground plane
      for (let i = 1; i < ys.length; i++) expect(ys[i]).toBe(ys[i - 1] + 1); // no gaps
      expect(ys.length).toBeGreaterThanOrEqual(4); // a real trunk, not a stump
    }
  });

  it('caps each trunk with a rounded leaf canopy, not a solid cube', () => {
    for (const v of variants) {
      const leaves = v.blocks.filter((b) => b[3] === LEAVES);
      expect(leaves.length).toBeGreaterThan(0);
      const xs = leaves.map((b) => b[0]);
      const ys = leaves.map((b) => b[1]);
      const zs = leaves.map((b) => b[2]);
      const spanX = Math.max(...xs) - Math.min(...xs) + 1;
      const spanY = Math.max(...ys) - Math.min(...ys) + 1;
      const spanZ = Math.max(...zs) - Math.min(...zs) + 1;
      expect(spanX).toBeGreaterThan(1); // canopy is wider than the 1-wide trunk
      expect(spanZ).toBeGreaterThan(1);
      // a filled cube would have leaves === spanX*spanY*spanZ; gaps prove a rounded silhouette
      expect(leaves.length).toBeLessThan(spanX * spanY * spanZ);
    }
  });

  it('offers real shape variety (variants are not all identical)', () => {
    const shapes = new Set(variants.map((v) => JSON.stringify(v.blocks)));
    expect(shapes.size).toBeGreaterThan(1);
  });
});

const flatAt = (): number => 64;

describe('oakScatterOptions', () => {
  it('seats oaks by the trunk column and leaves cell room for the footprint', () => {
    const o = oakScatterOptions(flatAt);
    expect(o.anchorOffset).toEqual(OAK_TRUNK_OFFSET);
    expect(o.cellSize).toBeGreaterThanOrEqual(OAK_FOOTPRINT);
    expect(o.surfaceAt).toBe(flatAt);
  });

  it('merges caller overrides but still enforces the trunk anchor', () => {
    const canPlace = (): boolean => true;
    const o = oakScatterOptions(flatAt, { density: 0.2, salt: 7, canPlace });
    expect(o.density).toBe(0.2);
    expect(o.salt).toBe(7);
    expect(o.canPlace).toBe(canPlace);
    expect(o.anchorOffset).toEqual(OAK_TRUNK_OFFSET);
  });
});

describe('oaks routed through scatterStructures (cross-chunk canopy)', () => {
  const oaks = oakVariants();
  // Restrict to one target cell so no other placement can interfere with the assertions.
  const onlyTargetCell = (ctx: PlacementContext): boolean => ctx.cellX === 1 && ctx.cellZ === 0;
  // cellSize 10 => cell x=1 spans world 10..19, so a centered oak's canopy crosses the x=16 border.
  const opts = oakScatterOptions(flatAt, { cellSize: 10, density: 1, canPlace: onlyTargetCell });

  it('stamps a border-straddling canopy consistently across both chunks', () => {
    let seed = -1;
    let placed: ReturnType<typeof placementAt> = null;
    for (let s = 1; s <= 4000 && !placed; s++) {
      const p = placementAt(oaks, opts, s, 1, 0);
      if (!p) continue;
      const xs = p.structure.blocks.map(([dx]) => p.ox + dx);
      if (xs.some((wx) => wx < CHUNK_SIZE_X) && xs.some((wx) => wx >= CHUNK_SIZE_X)) {
        seed = s;
        placed = p;
      }
    }
    expect(placed, 'expected an oak whose canopy straddles the x=16 border').not.toBeNull();

    const left = new ChunkData(0, 0);
    const right = new ChunkData(1, 0);
    scatterStructures(oaks, opts)(left, 0, 0, seed);
    scatterStructures(oaks, opts)(right, 1, 0, seed);

    // Every oak voxel must land in whichever chunk owns its world column — no clipped canopy.
    for (const [dx, dy, dz, id] of placed!.structure.blocks) {
      const wx = placed!.ox + dx;
      const wy = placed!.oy + dy;
      const wz = placed!.oz + dz;
      const owner = wx < CHUNK_SIZE_X ? left : right;
      expect(owner.get(wx - owner.cx * CHUNK_SIZE_X, wy, wz)).toBe(id);
    }
  });
});

describe('scatterOaks (grass/snow-gated overlay for heightmap presets)', () => {
  const land = (): number => SEA_LEVEL + 10; // well above the beach line -> grass
  const beach = (): number => SEA_LEVEL; // at the shoreline -> sand

  /** Apply an overlay across a small region and return the grown chunks. */
  function plantRegion(overlay: ReturnType<typeof scatterOaks>): ChunkData[] {
    const out: ChunkData[] = [];
    for (let cx = -2; cx <= 2; cx++) {
      for (let cz = -2; cz <= 2; cz++) {
        const c = new ChunkData(cx, cz);
        overlay(c, cx, cz, 1337);
        out.push(c);
      }
    }
    return out;
  }

  function counts(chunks: ChunkData[]): { wood: number; leaves: number } {
    let wood = 0;
    let leaves = 0;
    for (const c of chunks)
      for (const v of c.data) {
        if (v === WOOD) wood++;
        else if (v === LEAVES) leaves++;
      }
    return { wood, leaves };
  }

  it('plants oaks (wood + leaves) on plantable ground', () => {
    const { wood, leaves } = counts(plantRegion(scatterOaks(land, SEA_LEVEL, { density: 1 })));
    expect(wood).toBeGreaterThan(0);
    expect(leaves).toBeGreaterThan(0);
  });

  it('seats every trunk one block above the surface height', () => {
    let lowestWood = Infinity;
    for (const c of plantRegion(scatterOaks(land, SEA_LEVEL, { density: 1 }))) {
      for (let x = 0; x < CHUNK_SIZE_X; x++)
        for (let z = 0; z < CHUNK_SIZE_Z; z++)
          for (let y = 0; y < WORLD_HEIGHT; y++)
            if (c.get(x, y, z) === WOOD) {
              lowestWood = Math.min(lowestWood, y);
              break;
            }
    }
    expect(lowestWood).toBe(SEA_LEVEL + 11); // round(SEA_LEVEL + 10) + 1
  });

  it('plants nothing on beaches/water (cap is sand)', () => {
    const { wood, leaves } = counts(plantRegion(scatterOaks(beach, SEA_LEVEL, { density: 1 })));
    expect(wood).toBe(0);
    expect(leaves).toBe(0);
  });

  it('is deterministic for the same seed and surface', () => {
    const a = new ChunkData(1, -1);
    const b = new ChunkData(1, -1);
    scatterOaks(land, SEA_LEVEL, { density: 1 })(a, 1, -1, 1337);
    scatterOaks(land, SEA_LEVEL, { density: 1 })(b, 1, -1, 1337);
    expect(Array.from(a.data)).toEqual(Array.from(b.data));
  });
});
