import { Scene, PerspectiveCamera, WebGLRenderer, Color, Object3D } from 'three';

/** Owns the three.js scene/camera/renderer and the render loop. Camera is driven by CameraRig. */
export class Renderer {
  readonly scene = new Scene();
  readonly camera: PerspectiveCamera;
  private readonly renderer: WebGLRenderer;

  constructor(canvas: HTMLCanvasElement) {
    this.scene.background = new Color(0x87b9e8);

    this.camera = new PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 1000);

    this.renderer = new WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setSize(window.innerWidth, window.innerHeight);

    window.addEventListener('resize', () => this.onResize());
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
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  private onResize(): void {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }
}
