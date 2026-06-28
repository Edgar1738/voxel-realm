import { describe, it, expect, vi } from 'vitest';

/**
 * CelestialSky.dispose() tests.
 *
 * CelestialSky allocates CanvasTexture (one per SpriteMaterial), PointsMaterial, and
 * BufferGeometry. On dispose() each should have .dispose() called and all three objects
 * should be removed from the scene.
 *
 * We run in node env so:
 *   - stub `document` globally so discTexture() can call document.createElement('canvas')
 *   - mock three.js constructors to return tracked plain objects (constructor-safe with function syntax)
 */

// ---------------------------------------------------------------------------
// Stub document so discTexture() can run without a real DOM
// ---------------------------------------------------------------------------

const fakeCtx = {
  createRadialGradient: vi.fn(function () {
    return { addColorStop: vi.fn() };
  }),
  fillRect: vi.fn(),
  fillStyle: '',
};
const fakeHtmlCanvas = { width: 0, height: 0, getContext: vi.fn(() => fakeCtx) };
vi.stubGlobal('document', { createElement: vi.fn(() => fakeHtmlCanvas) });

// ---------------------------------------------------------------------------
// Tracked instances — created once, reused across test resets (module is cached)
// ---------------------------------------------------------------------------

const sunTexDispose = vi.fn();
const moonTexDispose = vi.fn();
const sunTexInstance = { dispose: sunTexDispose };
const moonTexInstance = { dispose: moonTexDispose };

const sunMatDispose = vi.fn();
const moonMatDispose = vi.fn();
const sunMatInstance = { map: sunTexInstance, dispose: sunMatDispose, opacity: 1 };
const moonMatInstance = { map: moonTexInstance, dispose: moonMatDispose, opacity: 1 };

const starMatDispose = vi.fn();
const starMatInstance = { dispose: starMatDispose, opacity: 0 };

const starGeoDispose = vi.fn();
const starGeoInstance = { setAttribute: vi.fn(), dispose: starGeoDispose };

const sunSpritePos = {
  copy: vi.fn(function () {
    return sunSpritePos;
  }),
  multiplyScalar: vi.fn(function () {
    return sunSpritePos;
  }),
  add: vi.fn(),
};
const sunSpriteInstance = {
  scale: { setScalar: vi.fn() },
  renderOrder: 0,
  position: sunSpritePos,
  visible: true,
};

const moonSpritePos = {
  copy: vi.fn(function () {
    return moonSpritePos;
  }),
  multiplyScalar: vi.fn(function () {
    return moonSpritePos;
  }),
  add: vi.fn(),
};
const moonSpriteInstance = {
  scale: { setScalar: vi.fn() },
  renderOrder: 0,
  position: moonSpritePos,
  visible: true,
};

const starPointsInstance = {
  renderOrder: 0,
  position: { copy: vi.fn() },
  visible: true,
  geometry: starGeoInstance,
};

// Call counters to hand out instances in order
let canvasTextureCount = 0;
let spriteMaterialCount = 0;
let spriteCount = 0;

const canvasTextureInstances = [sunTexInstance, moonTexInstance];
const spriteMaterialInstances = [sunMatInstance, moonMatInstance];
const spriteInstances = [sunSpriteInstance, moonSpriteInstance];

vi.mock('three', async (importOriginal) => {
  const actual = await importOriginal<typeof import('three')>();
  return {
    ...actual,
    CanvasTexture: function FakeCanvasTexture() {
      return canvasTextureInstances[canvasTextureCount++ % 2];
    },
    SpriteMaterial: function FakeSpriteMaterial() {
      return spriteMaterialInstances[spriteMaterialCount++ % 2];
    },
    Sprite: function FakeSprite() {
      return spriteInstances[spriteCount++ % 2];
    },
    PointsMaterial: function FakePointsMaterial() {
      return starMatInstance;
    },
    BufferGeometry: function FakeBufferGeometry() {
      return starGeoInstance;
    },
    BufferAttribute: function FakeBufferAttribute(arr: Float32Array) {
      return { array: arr };
    },
    Points: function FakePoints() {
      return starPointsInstance;
    },
    Color: actual.Color,
    Vector3: actual.Vector3,
    AdditiveBlending: actual.AdditiveBlending,
  };
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeScene() {
  return { add: vi.fn(), remove: vi.fn() } as unknown as import('three').Scene;
}

function resetCounters() {
  canvasTextureCount = 0;
  spriteMaterialCount = 0;
  spriteCount = 0;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CelestialSky.dispose()', () => {
  it('disposes sun/moon materials and star material + geometry', async () => {
    vi.clearAllMocks();
    resetCounters();
    const { CelestialSky } = await import('../src/render/CelestialSky');
    const sky = new CelestialSky(makeScene());
    sky.dispose();

    expect(sunMatDispose).toHaveBeenCalled();
    expect(moonMatDispose).toHaveBeenCalled();
    expect(starMatDispose).toHaveBeenCalled();
    expect(starGeoDispose).toHaveBeenCalled();
  });

  it('disposes sun and moon textures via mat.map?.dispose()', async () => {
    vi.clearAllMocks();
    resetCounters();
    const { CelestialSky } = await import('../src/render/CelestialSky');
    const sky = new CelestialSky(makeScene());
    sky.dispose();

    expect(sunTexDispose).toHaveBeenCalled();
    expect(moonTexDispose).toHaveBeenCalled();
  });

  it('removes sun, moon, and stars from the scene', async () => {
    vi.clearAllMocks();
    resetCounters();
    const { CelestialSky } = await import('../src/render/CelestialSky');
    const scene = makeScene();
    const sky = new CelestialSky(scene);
    sky.dispose();

    const removeSpy = scene.remove as ReturnType<typeof vi.fn>;
    expect(removeSpy).toHaveBeenCalled();
    const removed = (removeSpy.mock.calls as unknown[][]).flatMap((c) => c);
    expect(removed).toContain(sunSpriteInstance);
    expect(removed).toContain(moonSpriteInstance);
    expect(removed).toContain(starPointsInstance);
  });
});
