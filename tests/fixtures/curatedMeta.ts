import type { WorldMeta } from '../../src/persistence/SaveTypes';

/**
 * The curation contract fixture: the meta of `.saves/regular-user-moonspire.json`, copied
 * verbatim. Both readiness classifiers (auditWorldMeta — curation; validatePackage —
 * structural) must accept it, keeping their semantics aligned on a real curated world.
 */
export const REGULAR_USER_MOONSPIRE_META: WorldMeta = {
  seed: 1337,
  version: 1,
  preset: 'flat',
  title: 'Moonspire Realm: South Approach',
  description:
    'A player-ready Moonspire copy staged from the southern road: two outer cabins, lantern ' +
    'markers, a gatehouse, inner halls, water courts, and the high moonspire as the destination.',
  landmarks: [
    { name: 'South Arrival Road', x: 8, y: 72, z: 94 },
    { name: 'Outer Cabins', x: 5, y: 64, z: 82 },
    { name: 'Gatehouse Threshold', x: 8, y: 64, z: 47 },
    { name: 'Inner Library Court', x: -18, y: 72, z: -8 },
    { name: 'Moonspire Lookout', x: 68, y: 118, z: 72 },
  ],
  tour: [
    { name: 'South Arrival Road', x: 8, y: 72, z: 94 },
    { name: 'Outer Cabins', x: 5, y: 64, z: 82 },
    { name: 'Gatehouse Threshold', x: 8, y: 64, z: 47 },
    { name: 'Inner Library Court', x: -18, y: 72, z: -8 },
    { name: 'Moonspire Lookout', x: 68, y: 118, z: 72 },
  ],
  spawn: { x: 8, y: 72, z: 94 },
  look: { yaw: 0, pitch: 0.0568352751932849 },
};
