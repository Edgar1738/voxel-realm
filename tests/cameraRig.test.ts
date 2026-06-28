import { describe, it, expect, vi } from 'vitest';

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
    const rig = new CameraRig(cam, makeCanvas());

    // While active: KeyW → forward = true
    fakeWindow.dispatchEvent(new FakeKeyboardEvent('keydown', { code: 'KeyW' }));
    expect(rig.getInput().forward).toBe(true);

    // After dispose: release W, press S — neither event should be processed
    rig.dispose();
    fakeWindow.dispatchEvent(new FakeKeyboardEvent('keyup', { code: 'KeyW' }));
    fakeWindow.dispatchEvent(new FakeKeyboardEvent('keydown', { code: 'KeyS' }));
    expect(rig.getInput().back).toBe(false);
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
