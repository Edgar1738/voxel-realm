import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Scene } from 'three';

// discTexture() needs a 2D canvas context; stub a minimal one for the node test env.
beforeEach(() => {
  vi.stubGlobal('document', {
    createElement: () => ({
      width: 0,
      height: 0,
      getContext: () => ({
        createRadialGradient: () => ({ addColorStop: () => {} }),
        fillRect: () => {},
        fillStyle: '',
      }),
    }),
  });
});

describe('CelestialSky depth test', () => {
  it('renders stars, sun, and moon with depthTest enabled so terrain occludes them', async () => {
    const { CelestialSky } = await import('../src/render/CelestialSky');
    const scene = new Scene();
    new CelestialSky(scene);
    const materials = scene.children
      .map((o) => (o as { material?: { depthTest?: boolean } }).material)
      .filter((m): m is { depthTest?: boolean } => !!m);
    expect(materials.length).toBeGreaterThanOrEqual(3);
    for (const m of materials) expect(m.depthTest).toBe(true);
  });
});
