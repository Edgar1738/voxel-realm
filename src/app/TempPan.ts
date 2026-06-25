import { Vector3, type PerspectiveCamera } from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

const SPEED = 40; // world units / second

/**
 * TEMPORARY: pans the orbit camera + target horizontally with WASD so streaming can be
 * exercised before the player controller exists. Removed in M1C (PlayerController).
 */
export function setupTempPan(
  camera: PerspectiveCamera,
  controls: OrbitControls,
): (dt: number) => void {
  const pressed = new Set<string>();
  window.addEventListener('keydown', (e) => pressed.add(e.code));
  window.addEventListener('keyup', (e) => pressed.delete(e.code));

  const forward = new Vector3();
  const right = new Vector3();
  const move = new Vector3();

  return (dt: number): void => {
    move.set(0, 0, 0);
    camera.getWorldDirection(forward);
    forward.y = 0;
    forward.normalize();
    right.crossVectors(forward, camera.up).normalize();

    if (pressed.has('KeyW')) move.add(forward);
    if (pressed.has('KeyS')) move.sub(forward);
    if (pressed.has('KeyD')) move.add(right);
    if (pressed.has('KeyA')) move.sub(right);
    if (pressed.has('Space')) move.y += 1;
    if (pressed.has('ShiftLeft')) move.y -= 1;

    if (move.lengthSq() === 0) return;
    move.normalize().multiplyScalar(SPEED * dt);
    camera.position.add(move);
    controls.target.add(move);
  };
}
