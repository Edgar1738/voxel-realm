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

  it('builds every data-driven part (findable in the avatar graph)', () => {
    const avatar = new PlayerAvatar();
    for (const id of PLAYER_AVATAR_PART_IDS) {
      expect(avatar.group.getObjectByName(id)).toBeDefined();
    }
  });

  it('swings the limbs while moving and eases back to rest when still', () => {
    const avatar = new PlayerAvatar();
    const legPivot = avatar.group.getObjectByName('right-leg')!.parent!;
    for (let i = 0; i < 30; i++)
      avatar.update({ x: 0, y: 0, z: 0 }, 0, true, { dh: 0.1, dt: 0.016 });
    expect(Math.abs(legPivot.rotation.x)).toBeGreaterThan(0.05);
    for (let i = 0; i < 150; i++)
      avatar.update({ x: 0, y: 0, z: 0 }, 0, true, { dh: 0, dt: 0.016 });
    expect(Math.abs(legPivot.rotation.x)).toBeLessThan(0.02);
  });

  it('stays at rest when updated without motion', () => {
    const avatar = new PlayerAvatar();
    const legPivot = avatar.group.getObjectByName('right-leg')!.parent!;
    avatar.update({ x: 0, y: 0, z: 0 }, 0, true);
    expect(legPivot.rotation.x).toBe(0);
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
    const hatBrim = avatar.group.getObjectByName('hat-brim') as Mesh;
    const hood = avatar.group.getObjectByName('hood') as Mesh;
    const helmet = avatar.group.getObjectByName('helmet') as Mesh;
    const mat = torso.material as MeshLambertMaterial;
    expect(mat.color.getHex()).toBe(resolvePlayerSkin('keep-mage').palette.tunic);
    // The mage trades the old full hood for a proper pointed hat.
    expect(hatBrim.visible).toBe(true);
    expect(hood.visible).toBe(false);
    expect(helmet.visible).toBe(false);
  });

  it('every skin shows a face: eyes and pupils are always visible', () => {
    for (const id of ['realm-scout', 'dawn-guard', 'shadow-wanderer', 'night-rogue']) {
      const avatar = new PlayerAvatar(id);
      for (const part of ['right-eye', 'left-eye', 'right-pupil', 'left-pupil']) {
        const mesh = avatar.group.getObjectByName(part) as Mesh;
        expect(mesh.visible).toBe(true);
      }
    }
  });

  it('eyes sit proud of the head front so hoods/helmets cannot swallow them', () => {
    const avatar = new PlayerAvatar();
    const head = avatar.group.getObjectByName('head')!;
    const eye = avatar.group.getObjectByName('right-eye')!;
    const pupil = avatar.group.getObjectByName('right-pupil')!;
    expect(eye.position.z).toBeLessThan(head.position.z); // −Z is forward
    expect(pupil.position.z).toBeLessThan(eye.position.z);
  });

  it('new accessories show only on skins that declare them', () => {
    const ranger = new PlayerAvatar('forest-ranger');
    expect((ranger.group.getObjectByName('quiver') as Mesh).visible).toBe(true);
    expect((ranger.group.getObjectByName('right-pauldron') as Mesh).visible).toBe(false);
    const knight = new PlayerAvatar('frost-knight');
    expect((knight.group.getObjectByName('right-pauldron') as Mesh).visible).toBe(true);
    expect((knight.group.getObjectByName('hat-brim') as Mesh).visible).toBe(false);
    const mage = new PlayerAvatar('keep-mage');
    expect((mage.group.getObjectByName('hat-tip') as Mesh).visible).toBe(true);
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
