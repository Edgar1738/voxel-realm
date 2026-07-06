import { describe, it, expect } from 'vitest';
import type { Object3D } from 'three';
import { PlayerAvatar } from '../src/render/PlayerAvatar';

describe('PlayerAvatar', () => {
  it('attach adds the root group, which holds the box parts', () => {
    const avatar = new PlayerAvatar();
    const added: Object3D[] = [];
    avatar.attach((o) => added.push(o));
    expect(added).toEqual([avatar.group]);
    expect(avatar.group.children.length).toBeGreaterThan(0);
  });

  it('starts hidden (first-person default)', () => {
    expect(new PlayerAvatar().group.visible).toBe(false);
  });

  it('update copies center, yaw and visibility when shown', () => {
    const avatar = new PlayerAvatar();
    avatar.update({ x: 4, y: 65, z: -2 }, 1.2, true);
    expect(avatar.group.visible).toBe(true);
    expect(avatar.group.position.x).toBe(4);
    expect(avatar.group.position.y).toBe(65);
    expect(avatar.group.position.z).toBe(-2);
    expect(avatar.group.rotation.y).toBeCloseTo(1.2, 6);
  });

  it('hides without repositioning when not visible', () => {
    const avatar = new PlayerAvatar();
    avatar.update({ x: 4, y: 65, z: -2 }, 1.2, true);
    avatar.update({ x: 99, y: 99, z: 99 }, 0, false);
    expect(avatar.group.visible).toBe(false);
    expect(avatar.group.position.x).toBe(4); // early-return keeps the last shown pose
  });

  it('dispose releases resources without throwing', () => {
    const avatar = new PlayerAvatar();
    expect(() => avatar.dispose()).not.toThrow();
  });
});
