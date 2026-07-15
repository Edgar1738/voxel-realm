import { describe, expect, it } from 'vitest';
import { Group } from 'three';
import {
  CharacterAnimator,
  CharacterRig,
  characterEase,
  type CharacterAnimationClip,
} from '../src/character/CharacterRig';

describe('CharacterRig', () => {
  it('builds an articulated hierarchy and can export and reset edited joints', () => {
    const host = new Group();
    const rig = new CharacterRig(host, [
      { id: 'root', pos: [0, 1, 0] },
      { id: 'spine', parent: 'root', pos: [0, 0.4, 0] },
      { id: 'hand', parent: 'spine', pos: [0.3, 0.2, 0] },
    ]);

    expect(rig.joint('hand')?.parent).toBe(rig.joint('spine'));
    expect(rig.set('spine', { rotation: [0.2, 0.3, 0.4] })).toBe(true);
    expect(rig.exportPose().spine.rotation).toEqual([0.2, 0.3, 0.4]);
    rig.reset();
    expect(rig.joint('spine')?.rotation.toArray()).toEqual([0, 0, 0, 'XYZ']);
  });

  it('rejects out-of-order parent references instead of silently detaching a limb', () => {
    expect(
      () => new CharacterRig(new Group(), [{ id: 'hand', parent: 'arm' }, { id: 'arm' }]),
    ).toThrow('references missing parent arm');
  });
});

describe('CharacterAnimator', () => {
  const clips: readonly CharacterAnimationClip[] = [
    {
      id: 'masked-bob',
      label: 'Masked bob',
      duration: 1,
      mask: ['root'],
      tracks: [
        {
          joint: 'root',
          mode: 'additive',
          keyframes: [
            { time: 0, pos: [0, 0, 0], easing: 'smoothstep' },
            { time: 0.5, pos: [0, 1, 0], easing: 'smoothstep' },
            { time: 1, pos: [0, 0, 0] },
          ],
        },
        {
          joint: 'arm',
          mode: 'additive',
          keyframes: [
            { time: 0, rotation: [0, 0, 0] },
            { time: 0.5, rotation: [0, 0, 2] },
          ],
        },
      ],
    },
  ];

  it('samples eased additive tracks, respects masks, crossfades, and loops', () => {
    const rig = new CharacterRig(new Group(), [
      { id: 'root', pos: [0, 2, 0] },
      { id: 'arm', parent: 'root' },
    ]);
    const animator = new CharacterAnimator(rig, clips);

    expect(animator.play('masked-bob', { transitionSeconds: 0 })).toBe(true);
    animator.update(0.5);
    expect(rig.joint('root')?.position.y).toBe(3);
    expect(rig.joint('arm')?.rotation.z).toBe(0);

    animator.update(0.5);
    expect(rig.joint('root')?.position.y).toBe(2);
    expect(animator.stop()).toBe(true);
    expect(animator.play('missing')).toBe(false);
  });

  it('provides reusable animation easing curves', () => {
    expect(characterEase('linear', 0.25)).toBe(0.25);
    expect(characterEase('ease-in', 0.5)).toBe(0.25);
    expect(characterEase('ease-out', 0.5)).toBe(0.75);
    expect(characterEase('step', 0.99)).toBe(0);
  });
});
