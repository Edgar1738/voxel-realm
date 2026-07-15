import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { NpcActor } from '../src/npc/NpcActor';
import { NPC_CATALOG } from '../src/npc/NpcCatalog';
import { NpcSystem } from '../src/npc/NpcSystem';

const PLAYER_NEAR_PIPER = { x: 0.5, y: 63.9, z: 20 };

describe('NPC poses', () => {
  it('builds Piper on the shared V2 spine and articulated leg hierarchy', () => {
    const actor = new NpcActor(NPC_CATALOG.piper);
    expect(actor.jointState().map(({ id }) => id)).toEqual(
      expect.arrayContaining([
        'pelvis',
        'spine',
        'chest',
        'neck',
        'right-knee',
        'left-knee',
        'right-ankle',
        'left-ankle',
      ]),
    );
    for (const part of ['jaw', 'midriff', 'front-skirt-panel', 'right-calf', 'right-brow']) {
      expect(actor.group.getObjectByName(part)).toBeDefined();
    }
    actor.dispose();
  });

  it('supports live Piper joint edits and pose export through the NPC system', () => {
    const system = new NpcSystem([NPC_CATALOG.piper]);
    expect(system.setJointTransform('piper-green', 'chest', { rotation: [0.1, 0.2, 0.3] })).toBe(
      true,
    );
    expect(system.exportPose('piper-green')?.chest.rotation).toEqual([0.1, 0.2, 0.3]);
    expect(system.resetJoints('piper-green')).toBe(true);
    expect(system.exportPose('piper-green')?.chest.rotation).toEqual([0, 0, 0]);
    system.dispose();
  });

  it('starts Piper in her authored pose and applies a named pose immediately', () => {
    const actor = new NpcActor(NPC_CATALOG.piper);
    expect(actor.poseState().pose).toBe('idle-hip');
    expect(actor.poseState().poses.map(({ id }) => id)).toEqual([
      'idle-hip',
      'idle-club',
      'wave',
      'point-course',
      'cheer',
      'welcome',
      'explain',
      'thinking',
      'club-shoulder',
      'ready',
      'shrug',
      'disappointed',
      'champion',
      'hands-ground',
      'hands-ground-perpendicular',
      'prone-legs-up',
    ]);
    expect(actor.poseState().animations.map(({ id }) => id)).toEqual([
      'wave-loop',
      'clap-loop',
      'celebrate-loop',
      'warmup-loop',
    ]);

    expect(actor.playPose('wave', { transitionSeconds: 0 })).toBe(true);
    expect(actor.group.getObjectByName('joint:right-shoulder')?.rotation.z).toBeCloseTo(2.25);
    expect(actor.playPose('missing')).toBe(false);
    actor.dispose();
  });

  it('folds Piper at the hips and places both wrists at ground level', () => {
    const actor = new NpcActor(NPC_CATALOG.piper);
    actor.playPose('hands-ground', { transitionSeconds: 0 });
    actor.group.updateMatrixWorld(true);

    const body = actor.group.getObjectByName('joint:body');
    const rightWrist = actor.group.getObjectByName('joint:right-wrist');
    const leftWrist = actor.group.getObjectByName('joint:left-wrist');
    expect(body?.rotation.x).toBeCloseTo(-1.2);
    expect(rightWrist?.getWorldPosition(new Vector3()).y).toBeCloseTo(
      NPC_CATALOG.piper.position.y - 0.9,
      1,
    );
    expect(leftWrist?.getWorldPosition(new Vector3()).y).toBeCloseTo(
      NPC_CATALOG.piper.position.y - 0.9,
      1,
    );
    actor.dispose();
  });

  it('can keep the bent-over pose while turning both hands perpendicular to the ground', () => {
    const actor = new NpcActor(NPC_CATALOG.piper);
    actor.playPose('hands-ground-perpendicular', { transitionSeconds: 0 });

    expect(actor.group.getObjectByName('joint:body')?.rotation.x).toBeCloseTo(-1.2);
    expect(actor.group.getObjectByName('joint:right-wrist')?.rotation.x).toBeCloseTo(-1.55);
    expect(actor.group.getObjectByName('joint:left-wrist')?.rotation.x).toBeCloseTo(-1.55);
    actor.dispose();
  });

  it('lays Piper face-down with both shoe joints raised above her hips', () => {
    const actor = new NpcActor(NPC_CATALOG.piper);
    actor.playPose('prone-legs-up', { transitionSeconds: 0 });
    actor.group.updateMatrixWorld(true);

    const poseRoot = actor.group.getObjectByName('joint:pose-root')!;
    const torso = actor.group.getObjectByName('torso')!.getWorldPosition(new Vector3());
    const head = actor.group.getObjectByName('head')!.getWorldPosition(new Vector3());
    const rightHip = actor.group
      .getObjectByName('joint:right-hip')!
      .getWorldPosition(new Vector3());
    const leftHip = actor.group.getObjectByName('joint:left-hip')!.getWorldPosition(new Vector3());
    const rightShoe = actor.group.getObjectByName('right-shoe')!.getWorldPosition(new Vector3());
    const leftShoe = actor.group.getObjectByName('left-shoe')!.getWorldPosition(new Vector3());

    expect(poseRoot.rotation.x).toBeCloseTo(-Math.PI / 2);
    expect(torso.y).toBeCloseTo(head.y, 1);
    expect(rightShoe.y).toBeGreaterThan(rightHip.y + 0.35);
    expect(leftShoe.y).toBeGreaterThan(leftHip.y + 0.35);
    actor.dispose();
  });

  it('returns from a held story pose to the requested idle pose', () => {
    const actor = new NpcActor(NPC_CATALOG.piper);
    actor.playPose('cheer', {
      transitionSeconds: 0,
      holdSeconds: 0.5,
      returnTo: 'idle-hip',
    });

    actor.update(0.6, PLAYER_NEAR_PIPER);
    expect(actor.poseState().pose).toBe('idle-hip');
    actor.dispose();
  });

  it('cycles forward and backward through poses through the NPC system', () => {
    const system = new NpcSystem([NPC_CATALOG.piper]);
    expect(system.cyclePose('piper-green', 1)).toEqual({ id: 'idle-club', label: 'Club rest' });
    expect(system.cyclePose('piper-green', -1)).toEqual({ id: 'idle-hip', label: 'Hand on hip' });
    expect(system.cyclePose('unknown')).toBeUndefined();
    system.dispose();
  });

  it('loops animation frames until stopped', () => {
    const actor = new NpcActor(NPC_CATALOG.piper);
    expect(actor.playAnimation('wave-loop')).toBe(true);
    expect(actor.poseState()).toMatchObject({ pose: 'wave', animation: 'wave-loop' });

    actor.update(0.17, PLAYER_NEAR_PIPER);
    actor.update(0.19, PLAYER_NEAR_PIPER);
    expect(actor.poseState()).toMatchObject({ pose: 'wave-low', animation: 'wave-loop' });

    actor.update(0.17, PLAYER_NEAR_PIPER);
    actor.update(0.19, PLAYER_NEAR_PIPER);
    expect(actor.poseState()).toMatchObject({ pose: 'wave', animation: 'wave-loop' });
    expect(actor.stopAnimation()).toBe(true);
    expect(actor.poseState()).toMatchObject({ pose: 'idle-hip' });
    expect(actor.poseState().animation).toBeUndefined();
    actor.dispose();
  });

  it('cycles looping animations through the NPC system', () => {
    const system = new NpcSystem([NPC_CATALOG.piper]);
    expect(system.cycleAnimation('piper-green', 1)).toEqual({
      id: 'wave-loop',
      label: 'Looping wave',
    });
    expect(system.cycleAnimation('piper-green', -1)).toEqual({
      id: 'warmup-loop',
      label: 'Course warmup',
    });
    expect(system.playAnimation('piper-green', 'missing')).toBe(false);
    system.dispose();
  });
});
