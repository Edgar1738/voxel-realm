import { Scene, PerspectiveCamera, WebGLRenderer, Color, Object3D } from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

/** Owns the three.js scene/camera/renderer and a simple orbit camera + render loop. */
export class Renderer {
  readonly scene = new Scene();
  readonly camera: PerspectiveCamera;
  private readonly renderer: WebGLRenderer;
  private readonly controls: OrbitControls;

  constructor(canvas: HTMLCanvasElement) {
    this.scene.background = new Color(0x87b9e8);

    this.camera = new PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 1000);
    this.camera.position.set(24, 90, 48);

    this.renderer = new WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setSize(window.innerWidth, window.innerHeight);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.target.set(8, 64, 8);
    this.controls.update();

    window.addEventListener('resize', () => this.onResize());
  }

  add(object: Object3D): void {
    this.scene.add(object);
  }

  start(): void {
    const tick = (): void => {
      this.controls.update();
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
