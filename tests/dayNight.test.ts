import { describe, it, expect } from 'vitest';
import { Color, DataArrayTexture, Scene, SRGBColorSpace, Vector3 } from 'three';
import { DayNight } from '../src/render/DayNight';
import { skyState } from '../src/render/Sky';
import { createChunkMaterial } from '../src/render/ChunkMaterial';

// Regression for the slate-night-sky capture bug: skyState colors are display-sRGB, so the
// color-managed scene.background must declare that space or the renderer's working→sRGB clear
// conversion brightens the sky (night 16,20,44 rendered as 71,79,115) and it no longer matches
// the fog, which receives the same components raw (the chunk shader has no output transform).
describe('DayNight', () => {
  const tex = new DataArrayTexture(new Uint8Array(4), 1, 1, 1);

  it('scene background displays exactly the authored sky color', () => {
    const scene = new Scene();
    new DayNight(scene, [], 0); // midnight
    const s = skyState(0);
    const shown = new Color();
    (scene.background as Color).getRGB(shown, SRGBColorSpace);
    expect(Math.round(shown.r * 255)).toBe(s.sky[0]);
    expect(Math.round(shown.g * 255)).toBe(s.sky[1]);
    expect(Math.round(shown.b * 255)).toBe(s.sky[2]);
  });

  it('sky uniform gets the raw sRGB components; fog sits slightly below the sky in value', () => {
    const material = createChunkMaterial(tex);
    const scene = new Scene();
    new DayNight(scene, [material], 0);
    const s = skyState(0);
    const fog = material.uniforms.uFogColor.value as Vector3;
    const sky = material.uniforms.uSkyColor.value as Vector3;
    // Sky-tint ambient still reads the exact authored sky color.
    expect(sky.x).toBeCloseTo(s.sky[0] / 255);
    expect(sky.y).toBeCloseTo(s.sky[1] / 255);
    expect(sky.z).toBeCloseTo(s.sky[2] / 255);
    // Fog is deliberately a ~7% darker, slightly desaturated haze so distant terrain
    // keeps a readable silhouette against the horizon instead of dissolving into it.
    const lumaSky = 0.299 * sky.x + 0.587 * sky.y + 0.114 * sky.z;
    const lumaFog = 0.299 * fog.x + 0.587 * fog.y + 0.114 * fog.z;
    expect(lumaFog).toBeLessThan(lumaSky);
    expect(lumaFog).toBeGreaterThan(lumaSky * 0.85);
    // Same hue family: each channel derives from the sky's channel.
    expect(fog.x).toBeCloseTo((sky.x + (lumaSky - sky.x) * 0.15) * 0.93, 5);
    expect(fog.z).toBeCloseTo((sky.z + (lumaSky - sky.z) * 0.15) * 0.93, 5);
  });

  it('set() retargets the background for the new time of day', () => {
    const scene = new Scene();
    const dayNight = new DayNight(scene, [], 0);
    dayNight.set(0.5); // noon
    const s = skyState(0.5);
    const shown = new Color();
    (scene.background as Color).getRGB(shown, SRGBColorSpace);
    expect(Math.round(shown.r * 255)).toBe(s.sky[0]);
    expect(Math.round(shown.b * 255)).toBe(s.sky[2]);
  });
});
