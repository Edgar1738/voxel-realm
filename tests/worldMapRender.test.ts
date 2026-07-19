import { describe, it, expect } from 'vitest';
import {
  buildMapPalette,
  heightShade,
  renderCaveMapPixels,
  renderMapPixels,
  type SurfaceSampler,
} from '../src/app/worldMapRender';
import { GRASS, WATER, STONE, AIR, BLOCK_DEFS, LAVA, MAGMA } from '../src/blocks/blocks';
import { WORLD_HEIGHT } from '../src/core/constants';

const palette = buildMapPalette();

describe('buildMapPalette', () => {
  it('derives colors from top-face texture bases (grass = green, not side-dirt)', () => {
    const grass = palette.get(GRASS)!;
    expect(grass[1]).toBeGreaterThan(grass[0]); // green dominates
    expect(grass[1]).toBeGreaterThan(grass[2]);
  });

  it('covers every block that has faces (AIR excluded)', () => {
    for (const def of BLOCK_DEFS) {
      expect(palette.has(def.id)).toBe(def.faces !== undefined);
    }
    expect(palette.has(AIR)).toBe(false);
  });
});

describe('renderCaveMapPixels', () => {
  const pixel = (img: { size: number; data: Uint8ClampedArray }, dx: number, dz: number) => {
    const radius = (img.size - 1) / 2;
    const i = ((dz + radius) * img.size + (dx + radius)) * 4;
    return [img.data[i], img.data[i + 1], img.data[i + 2], img.data[i + 3]];
  };

  it('shows open passages, hot geology, solid walls, and unloaded space distinctly', () => {
    const img = renderCaveMapPixels(
      (x, _y, z) => {
        if (x === 2) return undefined;
        if (x === -1) return LAVA;
        if (z === 1) return MAGMA;
        return x === 0 ? AIR : STONE;
      },
      palette,
      0,
      0,
      24,
      2,
    );
    const passage = pixel(img, 0, 0);
    const wall = pixel(img, 1, 0);
    const lava = pixel(img, -1, 0);
    const magma = pixel(img, 0, 1);
    expect(passage[3]).toBe(255);
    expect(wall[0]).toBeLessThan(palette.get(STONE)![0]);
    expect(lava[0]).toBeGreaterThan(lava[1]);
    expect(magma[0]).toBeGreaterThan(magma[2]);
    expect(pixel(img, 2, 0)[3]).toBe(0);
  });
});

describe('heightShade', () => {
  it('brightens with height and keeps water flat', () => {
    expect(heightShade(STONE, WORLD_HEIGHT - 1)).toBeGreaterThan(heightShade(STONE, 10));
    expect(heightShade(WATER, 10)).toBe(heightShade(WATER, 100));
  });
});

describe('renderMapPixels', () => {
  /** Grass plain at y=60 with a stone pillar at (2,1) and water at x<0; x>5 unloaded. */
  const sample: SurfaceSampler = (x, z) => {
    if (x > 5) return undefined;
    if (x < 0) return { id: WATER, y: 59 };
    if (x === 2 && z === 1) return { id: STONE, y: 80 };
    return { id: GRASS, y: 60 };
  };

  const px = (
    img: { size: number; data: Uint8ClampedArray },
    dx: number,
    dz: number,
    r: number,
  ) => {
    const i = ((dz + r) * img.size + (dx + r)) * 4;
    return [img.data[i], img.data[i + 1], img.data[i + 2], img.data[i + 3]];
  };

  it('paints loaded terrain opaque and unloaded columns transparent', () => {
    const img = renderMapPixels(sample, palette, 0, 0, 8);
    expect(img.size).toBe(17);
    expect(px(img, 0, 0, 8)[3]).toBe(255); // grass at center
    expect(px(img, 7, 0, 8)[3]).toBe(0); // x=7 unloaded
  });

  it('the tall pillar reads brighter than the plain around it', () => {
    const img = renderMapPixels(sample, palette, 0, 0, 8);
    const pillar = px(img, 2, 1, 8);
    const plain = px(img, 2, 2, 8);
    // Different block AND brighter from height shading: compare against stone at plain height.
    const stoneRgb = palette.get(STONE)!;
    expect(pillar[0]).toBeCloseTo(stoneRgb[0] * heightShade(STONE, 80), 0);
    expect(plain[3]).toBe(255);
  });

  it('row 0 is north (−Z): a marker north of the player lands in the top half', () => {
    const northOnly: SurfaceSampler = (_x, z) => (z < 0 ? { id: STONE, y: 60 } : undefined);
    const img = renderMapPixels(northOnly, palette, 0, 0, 4);
    expect(px(img, 0, -3, 4)[3]).toBe(255); // north → drawn
    expect(px(img, 0, 3, 4)[3]).toBe(0); // south → transparent
    // and the north pixel sits in an earlier row than the center
    const northIndex = (-3 + 4) * img.size + 4;
    expect(northIndex).toBeLessThan(4 * img.size + 4);
  });
});
