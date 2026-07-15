import { describe, it, expect } from 'vitest';
import { Mesh, MeshLambertMaterial, type DataTexture, type Object3D } from 'three';
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

  it('loops a hip-thrust animation by counter-moving the hips and upper body', () => {
    const avatar = new PlayerAvatar('keep-mage');
    expect(avatar.playAnimation('hip-thrust-loop')).toBe(true);
    avatar.update({ x: 0, y: 0, z: 0 }, 0, true, { dh: 0, dt: 0.25 });

    const hips = avatar.group.getObjectByName('animation:hips')!;
    const upperBody = avatar.group.getObjectByName('animation:upper-body')!;
    expect(Math.abs(hips.position.z)).toBeGreaterThan(0.1);
    expect(Math.abs(hips.rotation.x)).toBeGreaterThan(0.1);
    expect(upperBody.rotation.x * hips.rotation.x).toBeLessThan(0);
  });

  it('loops a jump-cheer animation with vertical lift and both hands overhead', () => {
    const avatar = new PlayerAvatar();
    expect(avatar.playAnimation('jump-cheer-loop')).toBe(true);
    avatar.update({ x: 0, y: 0, z: 0 }, 0, true, { dh: 0, dt: 0.52 });

    const animationRoot = avatar.group.getObjectByName('animation:root')!;
    const rightArm = avatar.group.getObjectByName('right-arm')!.parent!;
    const leftArm = avatar.group.getObjectByName('left-arm')!.parent!;
    expect(animationRoot.position.y).toBeGreaterThan(0.4);
    expect(rightArm.rotation.z).toBeGreaterThan(2.5);
    expect(leftArm.rotation.z).toBeLessThan(-2.5);
  });

  it('uses the V2 spine, elbow, knee, ankle, neck, and head hierarchy on every skin', () => {
    for (const skin of ['realm-scout', 'keep-mage', 'frost-knight']) {
      const avatar = new PlayerAvatar(skin);
      const ids = avatar.jointState().map(({ id }) => id);
      expect(ids).toEqual(
        expect.arrayContaining([
          'pelvis',
          'spine-lower',
          'chest',
          'neck',
          'head',
          'right-elbow',
          'left-elbow',
          'right-knee',
          'left-knee',
          'right-ankle',
          'left-ankle',
        ]),
      );
    }
  });

  it('supports live joint posing, reset, and JSON-ready pose export', () => {
    const avatar = new PlayerAvatar();
    expect(avatar.setJointTransform('chest', { rotation: [0.2, -0.1, 0.3] })).toBe(true);
    expect(avatar.setJointTransform('missing', { rotation: [1, 0, 0] })).toBe(false);
    expect(avatar.exportPose().chest.rotation).toEqual([0.2, -0.1, 0.3]);
    avatar.resetJoints();
    expect(avatar.exportPose().chest.rotation).toEqual([0, 0, 0]);
  });

  it('cycles both player animations and then returns to the neutral pose', () => {
    const avatar = new PlayerAvatar();
    expect(avatar.animationState().animation).toBeUndefined();
    expect(avatar.cycleAnimation(1).animation).toBe('hip-thrust-loop');
    expect(avatar.cycleAnimation(1).animation).toBe('jump-cheer-loop');
    expect(avatar.cycleAnimation(1).animation).toBeUndefined();
    expect(avatar.playAnimation('missing')).toBe(false);
    expect(avatar.stopAnimation()).toBe(false);
  });

  it('uses Realm Scout as the default skin', () => {
    const avatar = new PlayerAvatar();
    const torso = avatar.group.getObjectByName('torso') as Mesh;
    const mat = torso.material as MeshLambertMaterial;
    // Textured slot: the palette color is baked into the map, material color stays white.
    expect(mat.map).not.toBeNull();
    expect(mat.color.getHex()).toBe(0xffffff);
    const head = avatar.group.getObjectByName('head') as Mesh;
    const headMat = head.material as MeshLambertMaterial;
    expect(headMat.map).toBeNull();
    expect(headMat.color.getHex()).toBe(resolvePlayerSkin('realm-scout').palette.skin);
    expect((avatar.group.getObjectByName('scout-scarf') as Mesh).visible).toBe(true);
    expect(avatar.group.getObjectByName('jaw')).toBeDefined();
    expect(avatar.group.getObjectByName('right-forearm')).toBeDefined();
    expect(avatar.group.getObjectByName('right-calf')).toBeDefined();
  });

  it('shares one texture per color+style across parts and skin swaps', () => {
    const avatar = new PlayerAvatar('realm-scout');
    const mapOf = (id: string): unknown =>
      (avatar.group.getObjectByName(id) as Mesh<never, MeshLambertMaterial>).material.map;
    const tunicMap = mapOf('torso');
    // Hood shares the tunic color on realm-scout → same cached texture instance.
    expect(mapOf('hood')).toBe(tunicMap);
    avatar.setSkin('dawn-guard');
    avatar.setSkin('realm-scout');
    expect(mapOf('torso')).toBe(tunicMap);
  });

  it('can apply the Mage of the Keep skin by id', () => {
    const avatar = new PlayerAvatar('keep-mage');
    const torso = avatar.group.getObjectByName('torso') as Mesh;
    const hatBrim = avatar.group.getObjectByName('hat-brim') as Mesh;
    const hood = avatar.group.getObjectByName('hood') as Mesh;
    const helmet = avatar.group.getObjectByName('helmet') as Mesh;
    const mat = torso.material as MeshLambertMaterial;
    // Textured tunic: the mage's robe color lives in the baked texel data.
    const texel = (mat.map as DataTexture).image.data as Uint8Array;
    const tunic = resolvePlayerSkin('keep-mage').palette.tunic;
    expect(Math.abs(texel[0] - ((tunic >> 16) & 0xff))).toBeLessThan(40);
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

  it('can apply the Shadow Wanderer (all-black) skin by id (silhouette survives texturing)', () => {
    const avatar = new PlayerAvatar('shadow-wanderer');
    const torso = avatar.group.getObjectByName('torso') as Mesh;
    const mat = torso.material as MeshLambertMaterial;
    // Every baked texel stays near-black so the silhouette reads solid.
    const texel = (mat.map as DataTexture).image.data as Uint8Array;
    for (let i = 0; i < texel.length; i += 4) expect(texel[i]).toBeLessThan(0x14);
  });

  it('starts hidden (first-person default)', () => {
    expect(new PlayerAvatar().group.visible).toBe(false);
  });

  it('mounts shared main/off equipment at the animated wrist joints', () => {
    const avatar = new PlayerAvatar();
    avatar.setEquipment({ main: 'sword', off: 'baguette' });
    const rightWrist = avatar.group.getObjectByName('joint:right-wrist')!;
    const leftWrist = avatar.group.getObjectByName('joint:left-wrist')!;
    expect(rightWrist.getObjectByName('equipment:sword')).toBeDefined();
    expect(leftWrist.getObjectByName('equipment:baguette')).toBeDefined();
    expect(avatar.equipmentState()).toEqual({ main: 'sword', off: 'baguette' });

    avatar.setEquipmentVisible(false);
    expect(rightWrist.getObjectByName('equipment-slot:main')?.visible).toBe(false);
    avatar.unequip('off');
    expect(avatar.equipmentState()).toEqual({ main: 'sword' });
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
