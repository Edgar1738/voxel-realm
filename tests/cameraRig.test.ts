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

// A real EventTarget: CameraRig listens for clicks on the canvas itself (world clicks
// request mouse capture; HUD clicks land on their own controls and never reach it).
class FakeCanvas extends EventTarget {
  requestPointerLock = vi.fn();
}

function makeCanvas() {
  return new FakeCanvas() as unknown as HTMLCanvasElement;
}

function makeOverlay() {
  return { textContent: '', style: { display: 'flex' } } as unknown as HTMLElement;
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

describe('CameraRig pointer-lock capture', () => {
  it('requests mouse capture from canvas clicks while unlocked', async () => {
    vi.resetModules();
    const { CameraRig } = await import('../src/render/CameraRig');
    const cam = makeCamera() as unknown as import('three').PerspectiveCamera;
    const canvas = makeCanvas();
    new CameraRig(cam, canvas);

    (canvas as unknown as EventTarget).dispatchEvent(new Event('click'));
    expect((canvas as unknown as FakeCanvas).requestPointerLock).toHaveBeenCalledTimes(1);
  });

  it('ignores clicks that do not land on the canvas (HUD stays free of capture)', async () => {
    vi.resetModules();
    const { CameraRig } = await import('../src/render/CameraRig');
    const cam = makeCamera() as unknown as import('three').PerspectiveCamera;
    const canvas = makeCanvas();
    new CameraRig(cam, canvas);

    // A toolbar/HUD click bubbles to the document but never touches the canvas.
    fakeDocument.dispatchEvent(new Event('click'));
    expect((canvas as unknown as FakeCanvas).requestPointerLock).not.toHaveBeenCalled();
  });

  it('does not re-request capture while already locked', async () => {
    vi.resetModules();
    const { CameraRig } = await import('../src/render/CameraRig');
    const cam = makeCamera() as unknown as import('three').PerspectiveCamera;
    const canvas = makeCanvas();
    new CameraRig(cam, canvas);

    fakeDocument.pointerLockElement = canvas as unknown as Element;
    fakeDocument.dispatchEvent(new Event('pointerlockchange'));
    (canvas as unknown as EventTarget).dispatchEvent(new Event('click'));
    expect((canvas as unknown as FakeCanvas).requestPointerLock).not.toHaveBeenCalled();
    fakeDocument.pointerLockElement = null;
  });

  it('surfaces a blocked-capture message that says the toolbar still works', async () => {
    vi.resetModules();
    const { CameraRig } = await import('../src/render/CameraRig');
    const cam = makeCamera() as unknown as import('three').PerspectiveCamera;
    const canvas = makeCanvas();
    const overlay = makeOverlay();
    new CameraRig(cam, canvas, overlay);

    fakeDocument.dispatchEvent(new Event('pointerlockerror'));
    expect(overlay.textContent).toContain('Mouse capture is blocked');
    expect(overlay.textContent).toContain('toolbar still work');
  });

  it('dispose() stops canvas clicks from requesting capture', async () => {
    vi.resetModules();
    const { CameraRig } = await import('../src/render/CameraRig');
    const cam = makeCamera() as unknown as import('three').PerspectiveCamera;
    const canvas = makeCanvas();
    const rig = new CameraRig(cam, canvas);

    rig.dispose();
    (canvas as unknown as EventTarget).dispatchEvent(new Event('click'));
    expect((canvas as unknown as FakeCanvas).requestPointerLock).not.toHaveBeenCalled();
  });
});

describe('CameraRig view modes', () => {
  it('defaults to first-person and toggles to third and back', async () => {
    vi.resetModules();
    const { CameraRig } = await import('../src/render/CameraRig');
    const cam = makeCamera() as unknown as import('three').PerspectiveCamera;
    const rig = new CameraRig(cam, makeCanvas());
    expect(rig.mode).toBe('first');
    expect(rig.toggleMode()).toBe('third');
    expect(rig.mode).toBe('third');
    expect(rig.toggleMode()).toBe('first');
    expect(rig.mode).toBe('first');
  });

  it('applyPlayerView sits the camera exactly at the eye in first-person', async () => {
    vi.resetModules();
    const { CameraRig } = await import('../src/render/CameraRig');
    const cam = makeCamera();
    const rig = new CameraRig(cam as unknown as import('three').PerspectiveCamera, makeCanvas());
    rig.yaw = 1.1;
    rig.pitch = 0.3;
    rig.applyPlayerView({ x: 10, y: 20, z: 30 }, 4);
    expect(cam.position.set).toHaveBeenCalledWith(10, 20, 30);
    expect(cam.quaternion.setFromEuler).toHaveBeenCalled();
  });

  it('applyPlayerView trails the camera behind the eye along −look in third-person', async () => {
    vi.resetModules();
    const { CameraRig, lookDirectionFromYawPitch, THIRD_PERSON_DISTANCE } =
      await import('../src/render/CameraRig');
    expect(THIRD_PERSON_DISTANCE).toBe(4);
    const cam = makeCamera();
    const rig = new CameraRig(cam as unknown as import('three').PerspectiveCamera, makeCanvas());
    rig.mode = 'third';
    rig.yaw = 0.7;
    rig.pitch = -0.2;
    const eye = { x: 5, y: 8, z: -3 };
    const dist = 4;
    rig.applyPlayerView(eye, dist);
    const d = lookDirectionFromYawPitch(0.7, -0.2);
    expect(cam.position.set).toHaveBeenCalledWith(
      eye.x - d.x * dist,
      eye.y - d.y * dist,
      eye.z - d.z * dist,
    );
  });

  it('look direction matches a real three camera forward (first-person view unchanged)', async () => {
    vi.resetModules();
    const { lookDirectionFromYawPitch } = await import('../src/render/CameraRig');
    const three = await import('three');
    for (const [yaw, pitch] of [
      [0, 0],
      [0.7, -0.3],
      [-1.2, 0.5],
    ] as const) {
      const cam = new three.PerspectiveCamera();
      cam.quaternion.setFromEuler(new three.Euler(pitch, yaw, 0, 'YXZ'));
      const v = new three.Vector3();
      cam.getWorldDirection(v);
      const look = lookDirectionFromYawPitch(yaw, pitch);
      expect(look.x).toBeCloseTo(v.x, 6);
      expect(look.y).toBeCloseTo(v.y, 6);
      expect(look.z).toBeCloseTo(v.z, 6);
    }
  });
});
