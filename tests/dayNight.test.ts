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

  it('fog and sky uniforms get the same raw sRGB components the background displays', () => {
    const material = createChunkMaterial(tex);
    const scene = new Scene();
    new DayNight(scene, [material], 0);
    const s = skyState(0);
    const fog = material.uniforms.uFogColor.value as Vector3;
    const sky = material.uniforms.uSkyColor.value as Vector3;
    expect(fog.x).toBeCloseTo(s.sky[0] / 255);
    expect(fog.y).toBeCloseTo(s.sky[1] / 255);
    expect(fog.z).toBeCloseTo(s.sky[2] / 255);
    expect(sky.x).toBeCloseTo(s.sky[0] / 255);
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
