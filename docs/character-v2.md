# Character V2 authoring

Voxel Realm characters are rigid voxel sculptures, not six-box avatars. Small stepped masses preserve
the voxel language while a shared humanoid hierarchy provides enough articulation for expressive
animation.

## Rig

`CharacterRig` builds ordered parent/child joints from data. Player skins use this hierarchy:

```text
root
└─ pelvis
   ├─ spine-lower ─ chest ─ neck ─ head
   │               ├─ right-shoulder ─ right-elbow ─ right-wrist
   │               └─ left-shoulder  ─ left-elbow  ─ left-wrist
   ├─ right-hip ─ right-knee ─ right-ankle
   └─ left-hip  ─ left-knee  ─ left-ankle
```

NPC definitions may add or omit joints, but Piper uses the same spine, arm, and leg concepts. Equipment
anchors belong on wrist joints so authored motion automatically carries held items.

## Silhouette rules

- Build anatomy from several small masses: skull and jaw, chest and waist, upper/lower limbs, hands,
  knees, calves, and shoes.
- Keep visible voxel steps. Do not smooth the character into an ordinary low-poly mesh.
- Put clothing above the body as separate parts. Belts, collars, straps, skirt pleats, armor, hair,
  bags, and equipment should change the outline as well as the color.
- Preserve readable negative space between arms, waist, and legs.
- Use asymmetry for identity. Realm Scout has a diagonal strap, satchel, backpack, scarf, and knee
  pads; Piper has visor, bobbed hair, layered top, glove, club, and skirt pleats.

## Animation clips

`CharacterAnimator` consumes data-driven clips containing joint tracks and keyframes. It supports:

- looping or one-shot playback;
- linear, eased, smoothstep, and stepped interpolation;
- shortest-path angle interpolation;
- crossfades from the current pose;
- absolute and additive tracks;
- joint masks for upper- or lower-body animation layers.

Keep a neutral keyframe at the start and end of a looping clip. Prefer pelvis/spine counter-motion and
elbow/knee follow-through over rotating an entire limb as one piece.

## Live pose authoring

The dev build exposes a JSON-ready joint editor:

```js
__vr.character.player.joints();
__vr.character.player.joint('chest', { rotation: [0.15, 0, -0.1] });
__vr.character.player.exportPose();
__vr.character.player.reset();

__vr.character.npc.joints('piper-green');
__vr.character.npc.joint('piper-green', 'right-elbow', { rotation: [0, 0, -1.2] });
__vr.character.npc.exportPose('piper-green');
__vr.character.npc.reset('piper-green');
```

Rotations are radians in local joint space. `exportPose()` returns transforms that can be pasted into
an authored pose or converted into keyframes.
