import { describe, it, expect } from 'vitest';
import { cloudCoverFor } from '../src/render/Clouds';
import { wetnessTarget, stepWetness } from '../src/render/wetness';
import { createTextureMetaLUT } from '../src/render/TextureArray';
import { BlockRegistry } from '../src/blocks/BlockRegistry';
import { SNOW, BLUE_ICE, LANTERN, GLOWSTONE, GRASS, Face } from '../src/blocks/blocks';

describe('cloudCoverFor', () => {
  it('scales cover with weather severity, keeping fair-weather clouds when clear', () => {
    expect(cloudCoverFor('clear')).toBeGreaterThan(0.2); // never an empty sky
    expect(cloudCoverFor('snow')).toBeGreaterThan(cloudCoverFor('clear'));
    expect(cloudCoverFor('rain')).toBeGreaterThan(cloudCoverFor('snow'));
    expect(cloudCoverFor('storm')).toBeGreaterThan(cloudCoverFor('rain'));
  });
});

describe('wetness', () => {
  it('targets follow weather severity', () => {
    expect(wetnessTarget('clear')).toBe(0);
    expect(wetnessTarget('storm')).toBe(1);
    expect(wetnessTarget('rain')).toBeGreaterThan(wetnessTarget('snow'));
  });

  it('soaks much faster than it dries and never overshoots', () => {
    let w = 0;
    for (let i = 0; i < 60; i++) w = stepWetness(w, 1, 1 / 6); // 10s of storm
    expect(w).toBe(1);
    const soaked10 = stepWetness(0, 1, 10);
    expect(soaked10).toBe(1); // clamped, no overshoot
    let d = 1;
    for (let i = 0; i < 60; i++) d = stepWetness(d, 0, 1 / 6); // 10s after it clears
    expect(d).toBeGreaterThan(0.3); // still glistening — drying is slow
    expect(d).toBeLessThan(1);
  });
});

describe('meta LUT sparkle/flicker flags (row 1)', () => {
  const reg = new BlockRegistry();
  const data = createTextureMetaLUT().image.data as Uint8Array;
  const row1 = (id: number, channel: number): number => {
    const layer = reg.faceLayer(id, Face.PosY);
    return data[256 * 4 + layer * 4 + channel];
  };

  it('snow and blue ice sparkle; grass does not', () => {
    expect(row1(SNOW, 1)).toBe(1);
    expect(row1(BLUE_ICE, 1)).toBe(1);
    expect(row1(GRASS, 1)).toBe(0);
  });

  it('lanterns flicker; glowstone burns steady', () => {
    expect(row1(LANTERN, 2)).toBe(1);
    expect(row1(GLOWSTONE, 2)).toBe(0);
  });
});
