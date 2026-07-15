import { FLOOR, KCX, KCZ } from '../worldgen/cloudspireFrame';
import type { WorldPreset } from '../worldgen/Presets';
import { formatChallengeTime } from './ThreeFlagChallenge';
import type {
  NpcAnimationDefinition,
  NpcDefinition,
  NpcDialogueTree,
  NpcJointDefinition,
  NpcPartDefinition,
  NpcPoseDefinition,
  NpcPoseJointTransform,
} from './NpcTypes';

const part = (
  id: string,
  size: readonly [number, number, number],
  pos: readonly [number, number, number],
  slot: string,
  options: Omit<NpcPartDefinition, 'id' | 'size' | 'pos' | 'slot'> = {},
): NpcPartDefinition => ({ id, size, pos, slot, ...options });

const AURELIA_DIALOGUE: NpcDialogueTree = {
  start: 'root',
  nodes: [
    {
      id: 'root',
      message: (context) => {
        if (context.crownCircuitState === 'complete') {
          return 'The Crown’s Circuit shines again. Cloudspire remembers those who climb for more than a view.';
        }
        if (context.crownCircuitState === 'active') {
          return `The Sunseal answers ${context.crownFound} of ${context.crownTotal} stations. The waterfall, sky bridge, and crown await.`;
        }
        return 'Welcome, Wayfarer. I am Lady Aurelia, keeper of the Sunseal and steward of Cloudspire.';
      },
      actions: [
        { id: 'identity', label: 'Who are you?', next: 'identity' },
        { id: 'realm', label: 'Tell me about Cloudspire.', next: 'realm' },
        { id: 'guide', label: 'Guide me through the citadel.', effect: 'start-tour' },
        {
          id: 'circuit',
          label: 'Does the realm need anything?',
          next: 'circuit',
          visible: (context) => context.crownCircuitState === 'inactive',
        },
        {
          id: 'reminder',
          label: 'Remind me of the Crown’s Circuit.',
          next: 'reminder',
          visible: (context) => context.crownCircuitState === 'active',
        },
        { id: 'close', label: 'Farewell.', effect: 'close' },
      ],
    },
    {
      id: 'identity',
      message:
        'The throne may stand empty, but the city does not. I keep its histories, receive its travelers, and make certain the high roads remain open.',
      actions: [{ id: 'back', label: 'Back', next: 'root' }],
    },
    {
      id: 'realm',
      message:
        'Cloudspire was built upward so every generation would leave the next a wider horizon. The cathedral remembers; the bridges dare; the crown watches.',
      actions: [{ id: 'back', label: 'Back', next: 'root' }],
    },
    {
      id: 'circuit',
      message:
        'Carry the Sunseal’s memory to three stations: the East Waterfall, the Sky Bridge, and the Crown Balcony. Return when all three know your footsteps.',
      actions: [
        { id: 'accept', label: 'I’ll walk the circuit.', effect: 'start-crown-circuit' },
        { id: 'back', label: 'Not yet.', next: 'root' },
      ],
    },
    {
      id: 'reminder',
      message:
        'Seek the East Waterfall below the terraces, cross the high Sky Bridge, then climb to the Crown Balcony.',
      actions: [{ id: 'back', label: 'I understand.', next: 'root' }],
    },
  ],
};

const PIPER_DIALOGUE: NpcDialogueTree = {
  start: 'root',
  nodes: [
    {
      id: 'root',
      message: (context) => {
        if (context.challengeRunning)
          return 'You’re on the clock! Rose Flag, Sand Bend, then Sun Crown. Keep moving.';
        if (context.challengeBestSeconds !== undefined) {
          return `Back for another round? Your Three-Flag best is ${formatChallengeTime(context.challengeBestSeconds)}.`;
        }
        return 'Hi! I’m Piper Green, host of the Three-Flag Trial. It’s a race, not a golf lesson—good shoes are all you need.';
      },
      actions: [
        {
          id: 'start',
          label: 'Start the Three-Flag Trial.',
          effect: 'start-three-flag',
          visible: (context) => !context.challengeRunning,
        },
        {
          id: 'restart',
          label: 'Restart the trial.',
          effect: 'start-three-flag',
          visible: (context) => context.challengeRunning,
        },
        { id: 'rules', label: 'How does it work?', next: 'rules' },
        { id: 'identity', label: 'Who are you?', next: 'identity' },
        { id: 'close', label: 'Maybe later.', effect: 'close' },
      ],
    },
    {
      id: 'rules',
      message:
        'Follow the pink beacon through all three flags in order. I’ll keep the time, and your quickest clean run becomes the course record to beat.',
      actions: [{ id: 'back', label: 'Got it.', next: 'root' }],
    },
    {
      id: 'identity',
      message:
        'Course architect, challenge host, and enthusiastic applauder of dramatic finishes. Sunmeadow is small on purpose—every shortcut is visible.',
      actions: [{ id: 'back', label: 'Back', next: 'root' }],
    },
  ],
};

const AURELIA_PARTS: readonly NpcPartDefinition[] = [
  part('torso', [0.56, 0.54, 0.34], [0, 0.12, 0], 'crimson', { style: 'fabric' }),
  part('upper-skirt', [0.62, 0.38, 0.4], [0, -0.32, 0], 'crimson', { style: 'fabric' }),
  part('lower-skirt', [0.7, 0.56, 0.46], [0, -0.71, 0], 'crimsonDark', { style: 'fabric' }),
  part('front-panel', [0.16, 0.72, 0.035], [0, -0.52, -0.245], 'gold', { style: 'metal' }),
  part('belt', [0.66, 0.1, 0.43], [0, -0.18, 0], 'leather', { style: 'leather' }),
  part('right-arm', [0.19, 0.56, 0.27], [0.39, 0.08, 0], 'crimson', { style: 'fabric' }),
  part('left-arm', [0.19, 0.56, 0.27], [-0.39, 0.08, 0], 'crimson', { style: 'fabric' }),
  part('right-cuff', [0.2, 0.09, 0.29], [0.39, -0.17, 0], 'gold', { style: 'metal' }),
  part('left-cuff', [0.2, 0.09, 0.29], [-0.39, -0.17, 0], 'gold', { style: 'metal' }),
  part('right-hand', [0.18, 0.17, 0.24], [0.39, -0.29, -0.01], 'skin'),
  part('left-hand', [0.18, 0.17, 0.24], [-0.39, -0.29, -0.01], 'skin'),
  part('neck-trim', [0.4, 0.08, 0.04], [0, 0.33, -0.19], 'gold', { style: 'metal' }),
  part('pendant-bar', [0.05, 0.2, 0.04], [0, 0.23, -0.205], 'gold', { style: 'metal' }),
  part('pendant', [0.16, 0.16, 0.055], [0, 0.12, -0.22], 'gold', { style: 'metal' }),
  part('right-pauldron', [0.27, 0.14, 0.35], [0.35, 0.37, 0], 'gold', { style: 'metal' }),
  part('left-pauldron', [0.27, 0.14, 0.35], [-0.35, 0.37, 0], 'gold', { style: 'metal' }),
  part('head', [0.5, 0.48, 0.48], [0, 0, 0], 'skin', { anchor: 'head' }),
  part('hair-cap', [0.54, 0.14, 0.52], [0, 0.23, 0.01], 'hair', { anchor: 'head' }),
  part('right-lock-top', [0.13, 0.38, 0.18], [0.245, -0.08, 0], 'hair', { anchor: 'head' }),
  part('left-lock-top', [0.13, 0.38, 0.18], [-0.245, -0.08, 0], 'hair', { anchor: 'head' }),
  part('right-lock', [0.12, 0.48, 0.16], [0.22, -0.35, 0.02], 'hair', { anchor: 'head' }),
  part('left-lock', [0.12, 0.48, 0.16], [-0.22, -0.35, 0.02], 'hair', { anchor: 'head' }),
  part('right-eye', [0.12, 0.1, 0.035], [0.11, 0.04, -0.245], 'eye', { anchor: 'head' }),
  part('left-eye', [0.12, 0.1, 0.035], [-0.11, 0.04, -0.245], 'eye', { anchor: 'head' }),
  part('right-pupil', [0.055, 0.06, 0.035], [0.1, 0.035, -0.267], 'pupil', { anchor: 'head' }),
  part('left-pupil', [0.055, 0.06, 0.035], [-0.1, 0.035, -0.267], 'pupil', { anchor: 'head' }),
  part('nose', [0.08, 0.1, 0.08], [0, -0.04, -0.28], 'skinShadow', { anchor: 'head' }),
  part('mouth', [0.14, 0.045, 0.025], [0, -0.15, -0.255], 'mouth', { anchor: 'head' }),
];

const PIPER_PARTS: readonly NpcPartDefinition[] = [
  part('torso', [0.53, 0.3, 0.32], [0, -0.08, 0], 'magenta', {
    joint: 'chest',
    style: 'fabric',
  }),
  part('midriff', [0.43, 0.2, 0.28], [0, -0.05, 0], 'magenta', {
    joint: 'spine',
    style: 'fabric',
  }),
  part('right-top-panel', [0.2, 0.24, 0.035], [0.15, -0.06, -0.18], 'magentaDark', {
    joint: 'chest',
    rotation: [0, 0, -0.08],
    style: 'fabric',
  }),
  part('left-top-panel', [0.2, 0.24, 0.035], [-0.15, -0.06, -0.18], 'magentaDark', {
    joint: 'chest',
    rotation: [0, 0, 0.08],
    style: 'fabric',
  }),
  part('collar', [0.35, 0.07, 0.34], [0, 0.13, 0], 'white', {
    joint: 'chest',
    style: 'fabric',
  }),
  part('waist', [0.56, 0.12, 0.35], [0, -0.14, 0], 'magentaDark', {
    joint: 'pose-root',
    style: 'fabric',
  }),
  part('skirt', [0.66, 0.45, 0.42], [0, -0.42, 0], 'white', {
    joint: 'pose-root',
    style: 'fabric',
  }),
  part('front-skirt-panel', [0.28, 0.38, 0.035], [0, -0.42, -0.225], 'white', {
    joint: 'pose-root',
    style: 'fabric',
  }),
  part('right-skirt-pleat', [0.11, 0.34, 0.04], [0.21, -0.41, -0.224], 'metal', {
    joint: 'pose-root',
    style: 'fabric',
  }),
  part('left-skirt-pleat', [0.11, 0.34, 0.04], [-0.21, -0.41, -0.224], 'metal', {
    joint: 'pose-root',
    style: 'fabric',
  }),
  part('right-leg', [0.2, 0.24, 0.24], [0, -0.12, 0], 'skin', {
    joint: 'right-hip',
  }),
  part('right-calf', [0.18, 0.18, 0.22], [0, -0.09, 0], 'skin', {
    joint: 'right-knee',
  }),
  part('left-leg', [0.2, 0.24, 0.24], [0, -0.12, 0], 'skin', {
    joint: 'left-hip',
  }),
  part('left-calf', [0.18, 0.18, 0.22], [0, -0.09, 0], 'skin', {
    joint: 'left-knee',
  }),
  part('right-shoe', [0.23, 0.13, 0.31], [0, -0.035, -0.035], 'white', {
    joint: 'right-ankle',
    style: 'leather',
  }),
  part('left-shoe', [0.23, 0.13, 0.31], [0, -0.035, -0.035], 'white', {
    joint: 'left-ankle',
    style: 'leather',
  }),
  part('right-upper-arm', [0.18, 0.38, 0.24], [0, -0.19, 0], 'skin', {
    joint: 'right-shoulder',
  }),
  part('right-forearm', [0.17, 0.28, 0.23], [0, -0.14, -0.01], 'skin', {
    joint: 'right-elbow',
  }),
  part('right-hand', [0.19, 0.17, 0.24], [0, 0, -0.02], 'skin', {
    joint: 'right-wrist',
  }),
  part('left-upper-arm', [0.18, 0.36, 0.24], [0, -0.18, 0], 'skin', {
    joint: 'left-shoulder',
  }),
  part('left-forearm', [0.17, 0.3, 0.23], [0, -0.15, -0.005], 'skin', {
    joint: 'left-elbow',
  }),
  part('left-glove', [0.2, 0.18, 0.25], [0, -0.01, -0.01], 'white', {
    joint: 'left-wrist',
    style: 'leather',
  }),
  part('necklace', [0.34, 0.055, 0.035], [0, 0.13, -0.18], 'white', {
    joint: 'chest',
    style: 'metal',
  }),
  part('club-shaft', [0.035, 1.14, 0.035], [-0.06, -0.27, -0.02], 'metal', {
    joint: 'left-wrist',
    rotation: [0, 0, -0.1],
    style: 'metal',
  }),
  part('club-head', [0.22, 0.12, 0.13], [-0.15, -0.8, -0.02], 'metalDark', {
    joint: 'left-wrist',
    style: 'metal',
  }),
  part('head', [0.5, 0.48, 0.48], [0, 0, 0], 'skin', { anchor: 'head' }),
  part('jaw', [0.38, 0.13, 0.42], [0, -0.25, -0.01], 'skin', { anchor: 'head' }),
  part('right-ear', [0.075, 0.13, 0.09], [0.275, -0.04, 0], 'skin', { anchor: 'head' }),
  part('left-ear', [0.075, 0.13, 0.09], [-0.275, -0.04, 0], 'skin', { anchor: 'head' }),
  part('hair-cap', [0.54, 0.14, 0.52], [0, 0.22, 0.02], 'hair', { anchor: 'head' }),
  part('right-bob', [0.14, 0.42, 0.2], [0.24, -0.1, 0.03], 'hair', { anchor: 'head' }),
  part('left-bob', [0.14, 0.42, 0.2], [-0.24, -0.1, 0.03], 'hair', { anchor: 'head' }),
  part('hair-nape', [0.38, 0.2, 0.12], [0, -0.18, 0.22], 'hair', { anchor: 'head' }),
  part('visor-band', [0.56, 0.13, 0.5], [0, 0.25, 0], 'white', { anchor: 'head', style: 'fabric' }),
  part('visor-brim', [0.58, 0.055, 0.34], [0, 0.23, -0.25], 'white', {
    anchor: 'head',
    style: 'fabric',
  }),
  part('visor-mark-left', [0.07, 0.055, 0.025], [-0.045, 0.27, -0.268], 'magenta', {
    anchor: 'head',
  }),
  part('visor-mark-right', [0.07, 0.055, 0.025], [0.045, 0.27, -0.268], 'magenta', {
    anchor: 'head',
  }),
  part('right-eye', [0.12, 0.11, 0.035], [0.11, 0.04, -0.245], 'eye', { anchor: 'head' }),
  part('left-eye', [0.12, 0.11, 0.035], [-0.11, 0.04, -0.245], 'eye', { anchor: 'head' }),
  part('right-pupil', [0.055, 0.065, 0.035], [0.1, 0.035, -0.267], 'pupil', { anchor: 'head' }),
  part('left-pupil', [0.055, 0.065, 0.035], [-0.1, 0.035, -0.267], 'pupil', { anchor: 'head' }),
  part('right-brow', [0.12, 0.035, 0.025], [0.11, 0.12, -0.263], 'hair', { anchor: 'head' }),
  part('left-brow', [0.12, 0.035, 0.025], [-0.11, 0.12, -0.263], 'hair', { anchor: 'head' }),
  part('right-cheek', [0.09, 0.07, 0.025], [0.16, -0.09, -0.258], 'blush', { anchor: 'head' }),
  part('left-cheek', [0.09, 0.07, 0.025], [-0.16, -0.09, -0.258], 'blush', { anchor: 'head' }),
  part('nose', [0.08, 0.1, 0.08], [0, -0.035, -0.28], 'skinShadow', { anchor: 'head' }),
  part('smile', [0.2, 0.065, 0.03], [0, -0.16, -0.26], 'mouth', { anchor: 'head' }),
  part('teeth', [0.13, 0.035, 0.025], [0, -0.142, -0.28], 'white', { anchor: 'head' }),
];

const PIPER_JOINTS: readonly NpcJointDefinition[] = [
  { id: 'pose-root' },
  { id: 'pelvis', parent: 'pose-root' },
  { id: 'body', parent: 'pelvis', pos: [0, -0.1, 0] },
  { id: 'spine', parent: 'body', pos: [0, 0.14, 0] },
  { id: 'chest', parent: 'spine', pos: [0, 0.18, 0] },
  { id: 'neck', parent: 'chest', pos: [0, 0.22, 0] },
  { id: 'right-hip', parent: 'pelvis', pos: [0.14, -0.51, 0] },
  { id: 'right-knee', parent: 'right-hip', pos: [0, -0.24, 0] },
  { id: 'right-ankle', parent: 'right-knee', pos: [0, -0.18, 0] },
  { id: 'left-hip', parent: 'pelvis', pos: [-0.14, -0.51, 0] },
  { id: 'left-knee', parent: 'left-hip', pos: [0, -0.24, 0] },
  { id: 'left-ankle', parent: 'left-knee', pos: [0, -0.18, 0] },
  { id: 'right-shoulder', parent: 'chest', pos: [0.34, 0.11, 0] },
  { id: 'right-elbow', parent: 'right-shoulder', pos: [0, -0.38, 0] },
  { id: 'right-wrist', parent: 'right-elbow', pos: [0, -0.28, 0] },
  { id: 'left-shoulder', parent: 'chest', pos: [-0.348, 0.125, 0] },
  { id: 'left-elbow', parent: 'left-shoulder', pos: [0, -0.36, 0] },
  { id: 'left-wrist', parent: 'left-elbow', pos: [0, -0.3, 0] },
];

const AURELIA_JOINTS: readonly NpcJointDefinition[] = [
  { id: 'right-wrist', pos: [0.39, -0.29, -0.01] },
  { id: 'left-wrist', pos: [-0.39, -0.29, -0.01] },
];

const PIPER_NEUTRAL_JOINTS: Readonly<Record<string, NpcPoseJointTransform>> = {
  'pose-root': { pos: [0, 0, 0], rotation: [0, 0, 0] },
  pelvis: { pos: [0, 0, 0], rotation: [0, 0, 0] },
  body: { pos: [0, -0.1, 0], rotation: [0, 0, 0] },
  spine: { rotation: [0, 0, 0] },
  chest: { rotation: [0, 0, 0] },
  neck: { rotation: [0, 0, 0] },
  'right-hip': { rotation: [0, 0, 0] },
  'right-knee': { rotation: [0, 0, 0] },
  'right-ankle': { rotation: [0, 0, 0] },
  'left-hip': { rotation: [0, 0, 0] },
  'left-knee': { rotation: [0, 0, 0] },
  'left-ankle': { rotation: [0, 0, 0] },
  'right-shoulder': { rotation: [0, 0, 0] },
  'right-elbow': { rotation: [0, 0, 0] },
  'right-wrist': { rotation: [0, 0, 0] },
  'left-shoulder': { rotation: [0, 0, 0] },
  'left-elbow': { rotation: [0, 0, 0] },
  'left-wrist': { rotation: [0, 0, 0] },
};

const piperPose = (
  id: string,
  label: string,
  joints: Readonly<Record<string, NpcPoseJointTransform>>,
  manual = true,
): NpcPoseDefinition => ({
  id,
  label,
  ...(!manual ? { manual: false } : {}),
  joints: { ...PIPER_NEUTRAL_JOINTS, ...joints },
});

const PIPER_POSES: readonly NpcPoseDefinition[] = [
  piperPose('idle-hip', 'Hand on hip', {
    'right-shoulder': { rotation: [0, 0, 0.52] },
    'right-elbow': { rotation: [0, 0, -1.2] },
    'right-wrist': { rotation: [0, 0, 0.68] },
    'left-shoulder': { rotation: [0, 0, -0.12] },
    'left-elbow': { rotation: [0, 0, 0.08] },
    'left-wrist': { rotation: [0, 0, 0.04] },
  }),
  piperPose('idle-club', 'Club rest', {
    'right-shoulder': { rotation: [0, 0, 0.08] },
    'right-elbow': { rotation: [0, 0, -0.05] },
    'right-wrist': { rotation: [0, 0, -0.03] },
    'left-shoulder': { rotation: [0, 0, -0.08] },
    'left-elbow': { rotation: [0, 0, 0.04] },
    'left-wrist': { rotation: [0, 0, 0.04] },
  }),
  piperPose('wave', 'Wave', {
    'right-shoulder': { rotation: [0, 0, 2.25] },
    'right-elbow': { rotation: [0, 0, 0.55] },
    'right-wrist': { rotation: [0, 0, -2.8] },
    'left-shoulder': { rotation: [0, 0, -0.12] },
    'left-elbow': { rotation: [0, 0, 0.08] },
    'left-wrist': { rotation: [0, 0, 0.04] },
  }),
  piperPose('point-course', 'Point to course', {
    'right-shoulder': { rotation: [-0.22, 0, 1.55] },
    'right-wrist': { rotation: [0, 0, -1.55] },
    'left-shoulder': { rotation: [0, 0, -0.08] },
    'left-elbow': { rotation: [0, 0, 0.04] },
    'left-wrist': { rotation: [0, 0, 0.04] },
  }),
  piperPose('cheer', 'Victory cheer', {
    'right-shoulder': { rotation: [0, 0, 2.5] },
    'right-elbow': { rotation: [0, 0, 0.25] },
    'right-wrist': { rotation: [0, 0, -2.75] },
    'left-shoulder': { rotation: [0, 0, -2.5] },
    'left-elbow': { rotation: [0, 0, -0.25] },
    'left-wrist': { rotation: [0, 0, 2.75] },
  }),
  piperPose('welcome', 'Open welcome', {
    'right-shoulder': { rotation: [-0.2, 0, 1.2] },
    'right-elbow': { rotation: [0, 0, -0.3] },
    'right-wrist': { rotation: [0, 0, -0.9] },
    'left-shoulder': { rotation: [-0.2, 0, -1.2] },
    'left-elbow': { rotation: [0, 0, 0.3] },
    'left-wrist': { rotation: [0, 0, 0.9] },
  }),
  piperPose('explain', 'Course explanation', {
    'right-shoulder': { rotation: [-0.55, 0, 1.15] },
    'right-elbow': { rotation: [0, 0, -0.4] },
    'right-wrist': { rotation: [0, 0, -0.75] },
    'left-shoulder': { rotation: [0, 0, -0.08] },
    'left-elbow': { rotation: [0, 0, 0.04] },
    'left-wrist': { rotation: [0, 0, 0.04] },
  }),
  piperPose('thinking', 'Thinking', {
    'right-shoulder': { rotation: [0, 0, 0.8] },
    'right-elbow': { rotation: [0, 0, -3.1] },
    'right-wrist': { rotation: [0, 0, 1.55] },
    'left-shoulder': { rotation: [0, 0, -0.1] },
    'left-elbow': { rotation: [0, 0, 0.05] },
  }),
  piperPose('club-shoulder', 'Club over shoulder', {
    'right-shoulder': { rotation: [0, 0, 0.52] },
    'right-elbow': { rotation: [0, 0, -1.2] },
    'right-wrist': { rotation: [0, 0, 0.68] },
    'left-shoulder': { rotation: [0, 0, -0.7] },
    'left-elbow': { rotation: [0, 0, -1.9] },
    'left-wrist': { rotation: [0, 0, -1.28] },
  }),
  piperPose('ready', 'Ready stance', {
    body: { rotation: [-0.18, 0, 0] },
    'right-shoulder': { rotation: [0.38, 0, 0.35] },
    'right-elbow': { rotation: [0, 0, -0.85] },
    'right-wrist': { rotation: [0, 0, 0.5] },
    'left-shoulder': { rotation: [0.38, 0, -0.35] },
    'left-elbow': { rotation: [0, 0, 0.85] },
    'left-wrist': { rotation: [0, 0, -0.5] },
  }),
  piperPose('shrug', 'Playful shrug', {
    'right-shoulder': { rotation: [0, 0, 0.95] },
    'right-elbow': { rotation: [0, 0, 1.2] },
    'right-wrist': { rotation: [0, 0, -2.15] },
    'left-shoulder': { rotation: [0, 0, -0.95] },
    'left-elbow': { rotation: [0, 0, -1.2] },
    'left-wrist': { rotation: [0, 0, 2.15] },
  }),
  piperPose('disappointed', 'Disappointed', {
    body: { rotation: [-0.22, 0, 0] },
    'right-shoulder': { pos: [0.34, 0.39, 0], rotation: [0, 0, 0.03] },
    'right-elbow': { rotation: [0, 0, 0.08] },
    'left-shoulder': { pos: [-0.348, 0.405, 0], rotation: [0, 0, -0.03] },
    'left-elbow': { rotation: [0, 0, -0.08] },
  }),
  piperPose('champion', 'Champion salute', {
    'right-shoulder': { rotation: [0, 0, 2.72] },
    'right-elbow': { rotation: [0, 0, 0.12] },
    'right-wrist': { rotation: [0, 0, -2.84] },
    'left-shoulder': { rotation: [0, 0, -1.75] },
    'left-elbow': { rotation: [0, 0, -0.35] },
    'left-wrist': { rotation: [0, 0, -1.05] },
  }),
  piperPose('hands-ground', 'Hands on ground', {
    body: { pos: [0, -0.4, 0.03], rotation: [-1.2, 0, 0] },
    'right-shoulder': { rotation: [1.2, 0, 0.08] },
    'right-elbow': { rotation: [0, 0, -0.08] },
    'left-shoulder': { rotation: [1.2, 0, -0.08] },
    'left-elbow': { rotation: [0, 0, 0.08] },
  }),
  piperPose('hands-ground-perpendicular', 'Hands perpendicular to ground', {
    body: { pos: [0, -0.4, 0.03], rotation: [-1.2, 0, 0] },
    'right-shoulder': { rotation: [1.2, 0, 0.08] },
    'right-elbow': { rotation: [0, 0, -0.08] },
    'right-wrist': { rotation: [-1.55, 0, 0] },
    'left-shoulder': { rotation: [1.2, 0, -0.08] },
    'left-elbow': { rotation: [0, 0, 0.08] },
    'left-wrist': { rotation: [-1.55, 0, 0] },
  }),
  piperPose('prone-legs-up', 'Prone with legs raised', {
    'pose-root': { pos: [0, -0.68, 0], rotation: [-Math.PI / 2, 0, 0] },
    'right-hip': { rotation: [-Math.PI / 2, 0, 0] },
    'left-hip': { rotation: [-Math.PI / 2, 0, 0] },
  }),
  piperPose(
    'wave-low',
    'Wave low keyframe',
    {
      'right-shoulder': { rotation: [0, 0, 2.25] },
      'right-elbow': { rotation: [0, 0, 0.55] },
      'right-wrist': { rotation: [0, 0, -2.25] },
      'left-shoulder': { rotation: [0, 0, -0.12] },
      'left-elbow': { rotation: [0, 0, 0.08] },
      'left-wrist': { rotation: [0, 0, 0.04] },
    },
    false,
  ),
  piperPose(
    'clap-open',
    'Clap open keyframe',
    {
      'right-shoulder': { rotation: [-0.8, 0, 0.72] },
      'right-elbow': { rotation: [0, 0, -1.35] },
      'right-wrist': { rotation: [0, 0, 0.63] },
      'left-shoulder': { rotation: [-0.8, 0, -0.72] },
      'left-elbow': { rotation: [0, 0, 1.35] },
      'left-wrist': { rotation: [0, 0, -0.63] },
    },
    false,
  ),
  piperPose(
    'clap-closed',
    'Clap closed keyframe',
    {
      'right-shoulder': { rotation: [-0.92, 0, 0.38] },
      'right-elbow': { rotation: [0, 0, -1.15] },
      'right-wrist': { rotation: [0, 0, 0.77] },
      'left-shoulder': { rotation: [-0.92, 0, -0.38] },
      'left-elbow': { rotation: [0, 0, 1.15] },
      'left-wrist': { rotation: [0, 0, -0.77] },
    },
    false,
  ),
];

const PIPER_ANIMATIONS: readonly NpcAnimationDefinition[] = [
  {
    id: 'wave-loop',
    label: 'Looping wave',
    frames: [
      { pose: 'wave', transitionSeconds: 0.16, holdSeconds: 0.18, easing: 'ease-out' },
      { pose: 'wave-low', transitionSeconds: 0.16, holdSeconds: 0.18, easing: 'ease-in-out' },
    ],
  },
  {
    id: 'clap-loop',
    label: 'Applause',
    frames: [
      { pose: 'clap-open', transitionSeconds: 0.16, holdSeconds: 0.12, easing: 'ease-out' },
      { pose: 'clap-closed', transitionSeconds: 0.12, holdSeconds: 0.1, easing: 'ease-in' },
    ],
  },
  {
    id: 'celebrate-loop',
    label: 'Celebration',
    frames: [
      { pose: 'cheer', transitionSeconds: 0.28, holdSeconds: 0.32, easing: 'smoothstep' },
      { pose: 'champion', transitionSeconds: 0.28, holdSeconds: 0.32, easing: 'smoothstep' },
    ],
  },
  {
    id: 'warmup-loop',
    label: 'Course warmup',
    frames: [
      { pose: 'ready', transitionSeconds: 0.38, holdSeconds: 0.4, easing: 'ease-out' },
      { pose: 'hands-ground', transitionSeconds: 0.62, holdSeconds: 0.7, easing: 'ease-in-out' },
    ],
  },
];

const AURELIA: NpcDefinition = {
  id: 'lady-aurelia',
  name: 'Lady Aurelia',
  role: 'Keeper of the Sunseal',
  position: { x: KCX + 0.5, y: FLOOR.hall + 1.9, z: KCZ - 7.5 },
  yaw: 0,
  collisionHalf: { x: 0.34, y: 0.9, z: 0.3 },
  palette: {
    skin: 0xe5b08f,
    skinShadow: 0xc98268,
    hair: 0xe2b93f,
    eye: 0xf4f1e9,
    pupil: 0x273449,
    mouth: 0xa75856,
    crimson: 0x9d1f2d,
    crimsonDark: 0x741520,
    gold: 0xd8ad42,
    leather: 0x6a4328,
  },
  parts: AURELIA_PARTS,
  joints: AURELIA_JOINTS,
  equipment: { main: 'sword' },
  dialogue: AURELIA_DIALOGUE,
};

const PIPER: NpcDefinition = {
  id: 'piper-green',
  name: 'Piper Green',
  role: 'Host of the Three-Flag Trial',
  position: { x: 0.5, y: 63.9, z: 18.5 },
  yaw: Math.PI,
  collisionHalf: { x: 0.34, y: 0.9, z: 0.3 },
  targetHalf: { x: 0.56, y: 1.04, z: 0.5 },
  palette: {
    skin: 0xdca07c,
    skinShadow: 0xbc775f,
    hair: 0xe8bb32,
    eye: 0xf6f4ef,
    pupil: 0x222735,
    blush: 0xe87582,
    mouth: 0x6f2532,
    magenta: 0xe12a78,
    magentaDark: 0xb51e5d,
    white: 0xf3f1e8,
    metal: 0xb8bec4,
    metalDark: 0x555d63,
  },
  parts: PIPER_PARTS,
  joints: PIPER_JOINTS,
  poses: PIPER_POSES,
  animations: PIPER_ANIMATIONS,
  defaultPose: 'idle-hip',
  headJoint: 'neck',
  headPos: [0, 0.24, 0],
  dialogue: PIPER_DIALOGUE,
};

export function npcDefinitionsForPreset(preset: WorldPreset): readonly NpcDefinition[] {
  if (preset === 'cloudspire-citadel') return [AURELIA];
  if (preset === 'sunmeadow-trials') return [PIPER];
  return [];
}

export const NPC_CATALOG = { aurelia: AURELIA, piper: PIPER } as const;
