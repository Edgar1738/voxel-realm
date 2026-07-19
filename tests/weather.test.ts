import { describe, it, expect } from 'vitest';
import { DataArrayTexture, Matrix4, Vector3 } from 'three';
import { Weather } from '../src/render/Weather';
import {
  createChunkMaterial,
  createCutoutMaterial,
  createTransparentMaterial,
  createWaterMaterial,
  createLavaMaterial,
  applyTime,
  PLANT_SWAY_AMP,
  WATER_WAVE_AMP,
} from '../src/render/ChunkMaterial';

const CAM = { x: 0, y: 64, z: 0 };
const noSolid = (): boolean => false;

describe('Weather precipitation', () => {
  it('clear renders nothing; rain fills its drop budget', () => {
    const weather = new Weather(
      () => {},
      () => 0.5,
    );
    weather.update(0.016, CAM, noSolid);
    expect(weather.kind).toBe('clear');

    weather.setKind('rain');
    weather.update(0.016, CAM, noSolid);
    // Access the instanced mesh through the scene-attach hook.
    let count = 0;
    weather.attach((o) => {
      count = (o as { count: number }).count;
    });
    expect(count).toBeGreaterThan(300);
  });

  it('switching kinds clears the old drops', () => {
    const weather = new Weather(
      () => {},
      () => 0.5,
    );
    weather.setKind('rain');
    weather.update(0.016, CAM, noSolid);
    weather.setKind('snow');
    weather.update(0.016, CAM, noSolid);
    let count = 0;
    weather.attach((o) => {
      count = (o as { count: number }).count;
    });
    expect(count).toBeGreaterThan(0);
    expect(count).toBeLessThan(300); // snow budget, not rain's
  });

  it('drops die on solid cells (roofs shelter) instead of accumulating below them', () => {
    const weather = new Weather(
      () => {},
      () => 0.5,
    );
    weather.setKind('rain');
    // Everything below y=60 is solid; after many frames no drop should sit below it.
    const roof = (_x: number, y: number, _z: number): boolean => y < 60;
    for (let i = 0; i < 60; i++) weather.update(0.05, CAM, roof);
    let mesh: { count: number; getMatrixAt(i: number, m: unknown): void } | undefined;
    weather.attach((o) => {
      mesh = o as never;
    });
    expect(mesh).toBeDefined();
    // Sample positions out of the instance matrices.
    const m = new Matrix4();
    const pos = new Vector3();
    for (let i = 0; i < (mesh?.count ?? 0); i++) {
      mesh?.getMatrixAt(i, m);
      pos.setFromMatrixPosition(m);
      expect(pos.y).toBeGreaterThanOrEqual(59);
    }
  });
});

describe('Weather lightning', () => {
  it('storms strike (flash + thunder callback); rain never does', () => {
    let thunders = 0;
    // rng below the strike threshold every roll → strikes as often as allowed
    const weather = new Weather(
      () => {
        thunders++;
      },
      () => 0.00001,
    );
    weather.setKind('storm');
    weather.update(0.016, CAM, noSolid);
    expect(weather.flashLevel).toBe(1);
    expect(thunders).toBe(1);

    const calm = new Weather(
      () => {
        thunders = 1000;
      },
      () => 0.00001,
    );
    calm.setKind('rain');
    calm.update(0.016, CAM, noSolid);
    expect(calm.flashLevel).toBe(0);
  });

  it('the flash decays over time', () => {
    const weather = new Weather(
      () => {},
      () => 0.00001,
    );
    weather.setKind('storm');
    weather.update(0.016, CAM, noSolid);
    const first = weather.flashLevel;
    weather.setKind('clear');
    weather.update(0.25, CAM, noSolid);
    expect(weather.flashLevel).toBeLessThan(first);
  });
});

describe('shader animation uniforms', () => {
  const tex = new DataArrayTexture(new Uint8Array(4), 1, 1, 1);

  it('applyTime writes the clock to every material', () => {
    const materials = [createChunkMaterial(tex), createCutoutMaterial(tex)];
    applyTime(materials, 12.5);
    for (const m of materials) expect(m.uniforms.uTime.value).toBe(12.5);
  });

  it('only plants sway and only water waves', () => {
    const opaque = createChunkMaterial(tex);
    const cutout = createCutoutMaterial(tex);
    const transparent = createTransparentMaterial(tex);
    const water = createWaterMaterial(tex);
    const lava = createLavaMaterial(tex);
    expect(opaque.uniforms.uSwayAmp.value).toBe(0);
    expect(opaque.uniforms.uWaveAmp.value).toBe(0);
    expect(cutout.uniforms.uSwayAmp.value).toBe(PLANT_SWAY_AMP);
    expect(cutout.uniforms.uWaveAmp.value).toBe(0);
    expect(transparent.uniforms.uWaveAmp.value).toBe(0);
    expect(transparent.uniforms.uSwayAmp.value).toBe(0);
    expect(water.uniforms.uWaveAmp.value).toBe(WATER_WAVE_AMP);
    expect(water.uniforms.uFluidKind.value).toBe(1);
    expect(lava.uniforms.uWaveAmp.value).toBeGreaterThan(0);
    expect(lava.uniforms.uFluidKind.value).toBe(2);
    expect(lava.uniforms.uLavaGlow.value).toBeGreaterThan(0);
  });
});
