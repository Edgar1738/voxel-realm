import { describe, it, expect } from 'vitest';
import { Scene, PerspectiveCamera, type Mesh, type MeshBasicMaterial } from 'three';
import { HeldBlock } from '../src/render/HeldBlock';
import { BlockRegistry } from '../src/blocks/BlockRegistry';
import { AIR, STONE, GRASS, STONE_SLAB, FLOWER } from '../src/blocks/blocks';

const registry = new BlockRegistry();

function makeHeld() {
  const held = new HeldBlock(registry);
  const scene = new Scene();
  const camera = new PerspectiveCamera();
  held.attach(scene, camera);
  // The group is the camera's child so the hand rides every camera move for free.
  const group = camera.children[0];
  return { held, scene, camera, group };
}

const meshOf = (group: { children: unknown[] }): Mesh | undefined =>
  group.children[0] as Mesh | undefined;

describe('HeldBlock', () => {
  it('attaches to the camera and stays hidden until visible + a block is set', () => {
    const { held, scene, camera, group } = makeHeld();
    expect(scene.children).toContain(camera);
    expect(group.visible).toBe(false);
    held.setBlock(STONE);
    held.update(0.016, { visible: true, yaw: 0, pitch: 0, bobY: 0 });
    expect(group.visible).toBe(true);
    held.update(0.016, { visible: false, yaw: 0, pitch: 0, bobY: 0 });
    expect(group.visible).toBe(false);
  });

  it('builds a 6-material cube whose textures come from the block face layers', () => {
    const { held, group } = makeHeld();
    held.setBlock(GRASS);
    const mesh = meshOf(group)!;
    const mats = mesh.material as MeshBasicMaterial[];
    expect(mats).toHaveLength(6);
    // Grass: the top face layer differs from the side layer (green cap vs dirt-side).
    expect(mats[2].map).not.toBe(mats[0].map);
    for (const m of mats) expect(m.depthTest).toBe(false);
  });

  it('shares cached layer textures across blocks with common faces', () => {
    const { held, group } = makeHeld();
    held.setBlock(STONE);
    const stoneMap = (meshOf(group)!.material as MeshBasicMaterial[])[0].map;
    held.setBlock(STONE_SLAB); // same stone spec → same unique layer
    const slabMap = (meshOf(group)!.material as MeshBasicMaterial[])[0].map;
    expect(slabMap).toBe(stoneMap);
  });

  it('slabs render half-height; cross plants render as one cutout quad', () => {
    const { held, group } = makeHeld();
    held.setBlock(STONE_SLAB);
    const slab = meshOf(group)!;
    expect(slab.geometry.type).toBe('BoxGeometry');
    expect(slab.position.y).toBeLessThan(0);
    held.setBlock(FLOWER);
    const flower = meshOf(group)!;
    expect(flower.geometry.type).toBe('PlaneGeometry');
    const mat = flower.material as MeshBasicMaterial;
    expect(mat.alphaTest).toBe(0.5);
    expect(mat.transparent).toBe(true);
  });

  it('AIR (or an unknown id) empties the hand', () => {
    const { held, group } = makeHeld();
    held.setBlock(STONE);
    expect(group.children).toHaveLength(1);
    held.setBlock(AIR);
    expect(group.children).toHaveLength(0);
    held.update(0.016, { visible: true, yaw: 0, pitch: 0, bobY: 0 });
    expect(group.visible).toBe(false); // visible flag alone can't show an empty hand
  });

  it('setBlock is a no-op for the already-held id', () => {
    const { held, group } = makeHeld();
    held.setBlock(STONE);
    const first = meshOf(group);
    held.setBlock(STONE);
    expect(meshOf(group)).toBe(first);
  });

  it('punch dips the hand and decays back to the rest pose', () => {
    const { held, group } = makeHeld();
    held.setBlock(STONE);
    held.update(0.016, { visible: true, yaw: 0, pitch: 0, bobY: 0 });
    const restY = group.position.y;
    held.punch();
    held.update(0.11, { visible: true, yaw: 0, pitch: 0, bobY: 0 }); // mid-swing
    expect(group.position.y).toBeLessThan(restY);
    for (let i = 0; i < 30; i++) held.update(0.05, { visible: true, yaw: 0, pitch: 0, bobY: 0 });
    expect(group.position.y).toBeCloseTo(restY, 2);
  });
});
