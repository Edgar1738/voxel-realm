import { Scene, PerspectiveCamera, WebGLRenderer, Color, Object3D } from 'three';

/** Owns the three.js scene/camera/renderer and the render loop. Camera is driven by CameraRig. */
export class Renderer {
  readonly scene = new Scene();
  readonly camera: PerspectiveCamera;
  private readonly renderer: WebGLRenderer;
  private rafId: number | undefined;
  private readonly resizeController = new AbortController();

  constructor(canvas: HTMLCanvasElement) {
    this.scene.background = new Color(0x87b9e8);

    this.camera = new PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 1000);

    this.renderer = new WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setSize(window.innerWidth, window.innerHeight);

    window.addEventListener('resize', () => this.onResize(), {
      signal: this.resizeController.signal,
    });
  }

  add(object: Object3D): void {
    this.scene.add(object);
  }

  /** Renders a single frame immediately. Used by the dev-only frame-capture hook. */
  renderOnce(): void {
    this.renderer.render(this.scene, this.camera);
  }

  /** The backing canvas (for dev capture; reading it is only valid in-tick after a render). */
  get domElement(): HTMLCanvasElement {
    return this.renderer.domElement;
  }

  start(onFrame?: (dtSeconds: number) => void): void {
    let last = performance.now();
    const tick = (): void => {
      const now = performance.now();
      const dt = (now - last) / 1000;
      last = now;
      if (onFrame) onFrame(dt);
      this.renderer.render(this.scene, this.camera);
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  /** Cancels the running animation frame loop. Safe to call if loop was never started. */
  stop(): void {
    if (this.rafId !== undefined) {
      cancelAnimationFrame(this.rafId);
      this.rafId = undefined;
    }
  }

  /** Stops the loop, removes the resize listener, and releases the WebGL context. */
  dispose(): void {
    this.stop();
    this.resizeController.abort();
    this.renderer.dispose();
  }

  private onResize(): void {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }
}
