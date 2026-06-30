import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * CameraRig disposal tests.
 *
 * CameraRig registers event listeners on `document` and `window`. After dispose() all listeners
 * must be inactive.
 *
 * The vitest environment is `node` so we stub document/window with real EventTargets so that
 * addEventListener/dispatchEvent work, and also stub KeyboardEvent which node doesn't have.
 */

// ---------------------------------------------------------------------------
// Stub DOM globals using real EventTarget so event dispatch actually works
// ---------------------------------------------------------------------------

class FakeEventTarget extends EventTarget {
  pointerLockElement: Element | null = null;
}

const fakeDocument = new FakeEventTarget();
const fakeWindow = new FakeEventTarget();

// KeyboardEvent is not available in node — provide a minimal stub
class FakeKeyboardEvent extends Event {
  readonly code: string;
  readonly movementX: number = 0;
  readonly movementY: number = 0;
  constructor(type: string, init?: { code?: string; bubbles?: boolean }) {
    super(type, { bubbles: init?.bubbles ?? false });
    this.code = init?.code ?? '';
  }
}

vi.stubGlobal('document', fakeDocument);
vi.stubGlobal('window', fakeWindow);
vi.stubGlobal('KeyboardEvent', FakeKeyboardEvent);

beforeEach(() => {
  fakeDocument.pointerLockElement = null;
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCamera() {
  return {
    position: { set: vi.fn() },
    quaternion: { setFromEuler: vi.fn() },
    getWorldDirection: vi.fn((v: { x: number; y: number; z: number }) => {
      v.x = 0;
      v.y = 0;
      v.z = -1;
      return v;
    }),
  };
}

function makeCanvas() {
  return { requestPointerLock: vi.fn() } as unknown as HTMLCanvasElement;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CameraRig', () => {
  it('dispose() stops keydown from affecting pressed keys', async () => {
    vi.resetModules();
    const { CameraRig } = await import('../src/render/CameraRig');
    const cam = makeCamera() as unknown as import('three').PerspectiveCamera;
    const canvas = makeCanvas();
    const rig = new CameraRig(cam, canvas);

    // While active: KeyW → forward = true
    fakeDocument.pointerLockElement = canvas as unknown as Element;
    fakeDocument.dispatchEvent(new Event('pointerlockchange'));
    fakeWindow.dispatchEvent(new FakeKeyboardEvent('keydown', { code: 'KeyW' }));
    expect(rig.getInput().forward).toBe(true);

    // After dispose: release W, press S — neither event should be processed
    rig.dispose();
    fakeWindow.dispatchEvent(new FakeKeyboardEvent('keyup', { code: 'KeyW' }));
    fakeWindow.dispatchEvent(new FakeKeyboardEvent('keydown', { code: 'KeyS' }));
    expect(rig.getInput().back).toBe(false);
  });

  it('returns neutral input and drops fly toggle when pointer lock is inactive', async () => {
    vi.resetModules();
    const { CameraRig } = await import('../src/render/CameraRig');
    const cam = makeCamera() as unknown as import('three').PerspectiveCamera;
    const canvas = makeCanvas();
    const rig = new CameraRig(cam, canvas);

    fakeWindow.dispatchEvent(new FakeKeyboardEvent('keydown', { code: 'KeyW' }));
    fakeWindow.dispatchEvent(new FakeKeyboardEvent('keydown', { code: 'KeyF' }));

    expect(rig.getInput()).toEqual({
      forward: false,
      back: false,
      left: false,
      right: false,
      up: false,
      down: false,
      toggleFly: false,
    });

    fakeDocument.pointerLockElement = canvas as unknown as Element;
    fakeDocument.dispatchEvent(new Event('pointerlockchange'));
    expect(rig.getInput().toggleFly).toBe(false);
    fakeDocument.pointerLockElement = null;
  });

  it('returns neutral input and drops fly toggle while the UI gate is blocked', async () => {
    vi.resetModules();
    const { CameraRig } = await import('../src/render/CameraRig');
    const cam = makeCamera() as unknown as import('three').PerspectiveCamera;
    const canvas = makeCanvas();
    const rig = new CameraRig(cam, canvas, undefined, () => true);

    fakeDocument.pointerLockElement = canvas as unknown as Element;
    fakeDocument.dispatchEvent(new Event('pointerlockchange'));
    fakeWindow.dispatchEvent(new FakeKeyboardEvent('keydown', { code: 'KeyW' }));
    fakeWindow.dispatchEvent(new FakeKeyboardEvent('keydown', { code: 'KeyF' }));

    expect(rig.getInput()).toEqual({
      forward: false,
      back: false,
      left: false,
      right: false,
      up: false,
      down: false,
      toggleFly: false,
    });

    fakeDocument.pointerLockElement = null;
  });

  it('dispose() stops pointerlockchange from updating locked state', async () => {
    vi.resetModules();
    const { CameraRig } = await import('../src/render/CameraRig');
    const cam = makeCamera() as unknown as import('three').PerspectiveCamera;
    const rig = new CameraRig(cam, makeCanvas());

    rig.dispose();
    const before = rig.locked;
    fakeDocument.dispatchEvent(new Event('pointerlockchange'));
    expect(rig.locked).toBe(before);
  });

  it('dispose() is idempotent — calling twice does not throw', async () => {
    vi.resetModules();
    const { CameraRig } = await import('../src/render/CameraRig');
    const cam = makeCamera() as unknown as import('three').PerspectiveCamera;
    const rig = new CameraRig(cam, makeCanvas());
    rig.dispose();
    expect(() => rig.dispose()).not.toThrow();
  });
});
