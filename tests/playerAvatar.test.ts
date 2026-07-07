import { describe, it, expect } from 'vitest';
import { Mesh, MeshLambertMaterial, type Object3D } from 'three';
import { PlayerAvatar, PLAYER_AVATAR_PART_IDS } from '../src/render/PlayerAvatar';
import { resolvePlayerSkin } from '../src/character/PlayerSkins';

describe('PlayerAvatar', () => {
  it('attach adds the root group, which holds the box parts', () => {
    const avatar = new PlayerAvatar();
    const added: Object3D[] = [];
    avatar.attach((o) => added.push(o));
    expect(added).toEqual([avatar.group]);
    expect(avatar.group.children.length).toBeGreaterThan(0);
  });

  it('builds the expected data-driven part set', () => {
    const avatar = new PlayerAvatar();
    expect(avatar.group.children.map((c) => c.name)).toEqual(PLAYER_AVATAR_PART_IDS);
  });

  it('uses Realm Scout as the default skin', () => {
    const avatar = new PlayerAvatar();
    const torso = avatar.group.getObjectByName('torso') as Mesh;
    const mat = torso.material as MeshLambertMaterial;
    expect(mat.color.getHex()).toBe(resolvePlayerSkin('realm-scout').palette.tunic);
  });

  it('can apply the Mage of the Keep skin by id', () => {
    const avatar = new PlayerAvatar('keep-mage');
    const torso = avatar.group.getObjectByName('torso') as Mesh;
    const hood = avatar.group.getObjectByName('hood') as Mesh;
    const helmet = avatar.group.getObjectByName('helmet') as Mesh;
    const mat = torso.material as MeshLambertMaterial;
    expect(mat.color.getHex()).toBe(resolvePlayerSkin('keep-mage').palette.tunic);
    expect(hood.visible).toBe(true);
    expect(helmet.visible).toBe(false);
  });

  it('can apply the Shadow Wanderer (all-black) skin by id', () => {
    const avatar = new PlayerAvatar('shadow-wanderer');
    const torso = avatar.group.getObjectByName('torso') as Mesh;
    const mat = torso.material as MeshLambertMaterial;
    expect(mat.color.getHex()).toBe(resolvePlayerSkin('shadow-wanderer').palette.tunic);
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
