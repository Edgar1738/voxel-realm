import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Renderer disposal tests.
 *
 * WebGLRenderer requires a real GPU context so we cannot instantiate Renderer directly.
 * We mock three.js WebGLRenderer and stub the browser globals (RAF, window) to test:
 *   - stop() calls cancelAnimationFrame with the stored RAF id
 *   - dispose() calls stop() and renderer.dispose()
 */

// ---------------------------------------------------------------------------
// Stubs for browser globals (node env has none of these)
// ---------------------------------------------------------------------------

let rafId = 0;
const cancelAnimationFrameMock = vi.fn();
const requestAnimationFrameMock = vi.fn(function () {
  rafId += 1;
  return rafId;
});

const windowStub = {
  innerWidth: 800,
  innerHeight: 600,
  devicePixelRatio: 1,
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
};

vi.stubGlobal('window', windowStub);
vi.stubGlobal('requestAnimationFrame', requestAnimationFrameMock);
vi.stubGlobal('cancelAnimationFrame', cancelAnimationFrameMock);
vi.stubGlobal('performance', { now: () => 0 });

// ---------------------------------------------------------------------------
// Mock three.js WebGLRenderer (must be constructable)
// ---------------------------------------------------------------------------

const mockRendererDispose = vi.fn();
const mockSetPixelRatio = vi.fn();
const mockSetSize = vi.fn();
const mockRender = vi.fn();
const fakeCanvas = {} as HTMLCanvasElement;

vi.mock('three', async (importOriginal) => {
  const actual = await importOriginal<typeof import('three')>();
  function FakeWebGLRenderer() {
    return {
      setPixelRatio: mockSetPixelRatio,
      setSize: mockSetSize,
      render: mockRender,
      dispose: mockRendererDispose,
      domElement: fakeCanvas,
    };
  }
  return {
    ...actual,
    WebGLRenderer: FakeWebGLRenderer,
  };
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Renderer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rafId = 0;
  });

  it('stop() cancels the stored RAF id', async () => {
    const { Renderer } = await import('../src/render/Renderer');
    const r = new Renderer(fakeCanvas);
    r.start();
    const storedId = rafId;
    r.stop();
    expect(cancelAnimationFrameMock).toHaveBeenCalledWith(storedId);
  });

  it('stop() is idempotent — calling twice does not throw and cancels only once', async () => {
    const { Renderer } = await import('../src/render/Renderer');
    const r = new Renderer(fakeCanvas);
    r.start();
    r.stop();
    expect(() => r.stop()).not.toThrow();
    expect(cancelAnimationFrameMock).toHaveBeenCalledOnce();
  });

  it('dispose() cancels RAF and calls renderer.dispose()', async () => {
    const { Renderer } = await import('../src/render/Renderer');
    const r = new Renderer(fakeCanvas);
    r.start();
    r.dispose();
    expect(cancelAnimationFrameMock).toHaveBeenCalled();
    expect(mockRendererDispose).toHaveBeenCalledOnce();
  });

  it('dispose() without start() still calls renderer.dispose() without throwing', async () => {
    const { Renderer } = await import('../src/render/Renderer');
    const r = new Renderer(fakeCanvas);
    expect(() => r.dispose()).not.toThrow();
    expect(mockRendererDispose).toHaveBeenCalledOnce();
  });
});
