import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  Points,
  PointsMaterial,
  Scene,
  Sprite,
  SpriteMaterial,
  Vector3,
} from 'three';
import { skyState } from './Sky';

// Far enough to read as "at infinity" but well inside the camera's 1000 far plane.
const SKY_RADIUS = 400;
const SUN_SIZE = 60;
const MOON_SIZE = 42;
const STAR_COUNT = 600;
const STAR_RADIUS = 480; // just beyond the sun/moon arc so stars sit furthest back

/** Builds a soft round radial-gradient sprite texture (white core fading to transparent). */
function discTexture(inner: string, outer: string): CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const half = size / 2;
    const gradient = ctx.createRadialGradient(half, half, 0, half, half, half);
    gradient.addColorStop(0, inner);
    gradient.addColorStop(0.4, inner);
    gradient.addColorStop(1, outer);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
  }
  return new CanvasTexture(canvas);
}

/** Distributes `count` points roughly uniformly on a sphere of `radius` (Fibonacci sphere). */
function starPositions(count: number, radius: number): Float32Array {
  const positions = new Float32Array(count * 3);
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < count; i++) {
    const y = 1 - (i / (count - 1)) * 2; // 1 .. -1
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = golden * i;
    positions[i * 3] = Math.cos(theta) * r * radius;
    positions[i * 3 + 1] = y * radius;
    positions[i * 3 + 2] = Math.sin(theta) * r * radius;
  }
  return positions;
}

/** Star fade: fully visible at night, gone by day. daylight is ~0.16 (night) .. 1 (day). */
function starOpacity(daylight: number): number {
  return Math.max(0, Math.min(1, 1 - daylight * 1.6));
}

/**
 * Sun + moon discs that traverse the sky with the time of day, plus a star field that fades in at
 * night. Tracks the existing day/night model via {@link skyState}. Everything renders behind the
 * terrain (depthTest/depthWrite off, low renderOrder) and stays centered on the camera so it reads
 * as fixed at the horizon-to-zenith arc.
 */
export class CelestialSky {
  private readonly sun: Sprite;
  private readonly moon: Sprite;
  private readonly stars: Points;
  private readonly sunMat: SpriteMaterial;
  private readonly moonMat: SpriteMaterial;
  private readonly starMat: PointsMaterial;
  private readonly sunDir = new Vector3();

  private readonly scene: Scene;

  constructor(scene: Scene) {
    this.scene = scene;
    this.sunMat = new SpriteMaterial({
      map: discTexture('rgba(255,250,230,1)', 'rgba(255,240,200,0)'),
      color: new Color(0xfff4d6),
      depthTest: false,
      depthWrite: false,
      blending: AdditiveBlending,
      transparent: true,
    });
    this.sun = new Sprite(this.sunMat);
    this.sun.scale.setScalar(SUN_SIZE);
    this.sun.renderOrder = -8;

    this.moonMat = new SpriteMaterial({
      map: discTexture('rgba(235,238,245,1)', 'rgba(200,210,230,0)'),
      color: new Color(0xdfe4ef),
      depthTest: false,
      depthWrite: false,
      transparent: true,
    });
    this.moon = new Sprite(this.moonMat);
    this.moon.scale.setScalar(MOON_SIZE);
    this.moon.renderOrder = -9;

    const geometry = new BufferGeometry();
    geometry.setAttribute(
      'position',
      new BufferAttribute(starPositions(STAR_COUNT, STAR_RADIUS), 3),
    );
    this.starMat = new PointsMaterial({
      color: 0xffffff,
      size: 2.2,
      sizeAttenuation: false,
      depthTest: false,
      depthWrite: false,
      transparent: true,
      opacity: 0,
    });
    this.stars = new Points(geometry, this.starMat);
    this.stars.renderOrder = -10;

    scene.add(this.sun, this.moon, this.stars);
  }

  /**
   * Disposes all GPU resources owned by this object and removes its objects from the scene.
   * The sun/moon textures live on their materials; the star geometry is held directly.
   */
  dispose(): void {
    this.scene.remove(this.sun, this.moon, this.stars);
    // SpriteMaterial.map is the CanvasTexture we allocated — dispose both.
    this.sunMat.map?.dispose();
    this.sunMat.dispose();
    this.moonMat.map?.dispose();
    this.moonMat.dispose();
    this.stars.geometry.dispose();
    this.starMat.dispose();
  }

  /**
   * Positions sun/moon on a big circle around the camera using the time-of-day sun direction, and
   * fades the star field in as night falls. Call once per frame after the day/night clock advances.
   */
  update(time: number, cameraPos: Vector3): void {
    const state = skyState(time);
    this.sunDir.set(state.sun[0], state.sun[1], state.sun[2]).normalize();

    this.sun.position.copy(this.sunDir).multiplyScalar(SKY_RADIUS).add(cameraPos);
    // Moon rides the opposite point of the arc.
    this.moon.position.copy(this.sunDir).multiplyScalar(-SKY_RADIUS).add(cameraPos);

    // The sky model keeps the sun's elevation constant (only azimuth rotates), so drive the
    // sun/moon visibility from daylight instead: sun blazes by day, moon takes over at night.
    const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));
    const sunOpacity = clamp01((state.daylight - 0.35) / 0.45);
    const moonOpacity = clamp01((0.78 - state.daylight) / 0.5);
    this.sunMat.opacity = sunOpacity;
    this.sun.visible = sunOpacity > 0.001;
    this.moonMat.opacity = moonOpacity;
    this.moon.visible = moonOpacity > 0.001;

    const stars = starOpacity(state.daylight);
    this.starMat.opacity = stars;
    this.stars.visible = stars > 0.001;
    this.stars.position.copy(cameraPos);
  }
}

export { starOpacity };
