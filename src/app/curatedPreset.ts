import type { WorldMeta } from '../persistence/SaveTypes';
import type { WorldPreset } from '../worldgen/Presets';
import {
  spireAccessibleY,
  SPAWN,
  LOOK,
  CATH,
  KEEP,
  FLOOR,
  KCX,
  KCZ,
  G,
  GP,
} from '../worldgen/cloudspireFrame';

/** Metadata for procedural-but-authored worlds, giving new worlds a curated arrival and tour. */
export function curatedPresetMeta(
  preset: WorldPreset,
  seed: number,
  version: number,
  worldgenVersion?: number,
): WorldMeta | undefined {
  if (preset === 'sunmeadow-trials') {
    return {
      seed,
      version,
      ...(worldgenVersion === undefined ? {} : { worldgenVersion }),
      preset,
      title: 'Sunmeadow Trial Grounds',
      description:
        'A bright recreation meadow hosted by Piper Green. Meet her beneath the start pavilion, then race through the Rose Flag, Sand Bend, and Sun Crown.',
      spawn: { x: 0.5, y: 63.9, z: 30.5 },
      look: { yaw: 0, pitch: 0 },
      atmosphere: { weather: 'clear', timeOfDay: 0.4, fogNear: 110, fogFar: 300 },
      landmarks: [
        { name: 'Start Pavilion', x: 0, y: 63, z: 28 },
        { name: 'Rose Flag', x: -24, y: 63, z: 2 },
        { name: 'Sand Bend', x: 24, y: 63, z: -22 },
        { name: 'Sun Crown', x: 0, y: 63, z: -52 },
      ],
      tour: [
        { name: 'Start Pavilion', x: 0, y: 63, z: 24 },
        { name: 'Rose Flag', x: -24, y: 63, z: 2 },
        { name: 'Sand Bend', x: 24, y: 63, z: -22 },
        { name: 'Sun Crown', x: 0, y: 63, z: -52 },
      ],
    };
  }

  if (preset === 'ashen-reach') {
    return {
      seed,
      version,
      ...(worldgenVersion === undefined ? {} : { worldgenVersion }),
      preset,
      title: 'Ashen Reach',
      description:
        'From a basalt overlook, cross the broken ember bridge into Cinderkeep — a fallen frontier fortress above the lava-cut valley.',
      spawn: { x: 0, y: 108, z: 95 },
      look: { yaw: 0, pitch: -0.12 },
      landmarks: [
        { name: 'Basalt Overlook', x: 0, y: 107, z: 95 },
        { name: 'Ember Bridge', x: 0, y: 80, z: 12 },
        { name: 'Cinderkeep Gatehouse', x: 0, y: 80, z: -42 },
        { name: 'Cinderkeep Rooftop', x: 0, y: 108, z: -78 },
        { name: 'Ash Watchtower', x: 28, y: 72, z: 38 },
      ],
      tour: [
        { name: 'Basalt Overlook', x: 0, y: 107, z: 95 },
        { name: 'Ember Bridge', x: 0, y: 80, z: 12 },
        { name: 'Cinderkeep Gatehouse', x: 0, y: 80, z: -42 },
        { name: 'Cinderkeep Rooftop', x: 0, y: 108, z: -78 },
      ],
    };
  }

  if (preset === 'cloudspire-citadel') {
    const crownY = spireAccessibleY();
    return {
      seed,
      version,
      ...(worldgenVersion === undefined ? {} : { worldgenVersion }),
      preset,
      title: 'Cloudspire Citadel',
      description:
        'An enormous high-fantasy castle-city in the mountain mist: pale limestone walls, dark slate roofs, a Gothic cathedral, cascading waterfalls, and one impossibly tall central spire above terraced gardens and fortifications.',
      spawn: { x: SPAWN.x, y: SPAWN.y, z: SPAWN.z },
      look: { yaw: LOOK.yaw, pitch: LOOK.pitch },
      atmosphere: {
        weather: 'clear',
        timeOfDay: 0.42,
        // Mist still builds through the mid-ground, but the far plane clears the crown
        // (~379 blocks from spawn) so the hero spire reads as a silhouette instead of
        // dissolving into fog at arrival.
        fogNear: 150,
        fogFar: 500,
      },
      landmarks: [
        { name: 'Arrival Overlook', x: SPAWN.x, y: Math.floor(SPAWN.y), z: SPAWN.z },
        { name: 'Outer Gatehouse', x: 0, y: G + 2, z: -125 },
        { name: 'Garden Terraces', x: 0, y: 105, z: -70 },
        { name: 'Grand Cathedral', x: 0, y: CATH.floor + 2, z: CATH.z0 + 8 },
        { name: 'Inner Palace Court', x: 0, y: FLOOR.ground + 1, z: KEEP.z0 - 10 },
        { name: 'Great Hall', x: KCX, y: FLOOR.hall + 1, z: KCZ },
        { name: 'Sky Bridge', x: KEEP.x1 + 10, y: FLOOR.high + 3, z: KCZ },
        { name: 'Crown Balcony', x: KCX, y: crownY + 1, z: KCZ },
        { name: 'East Waterfall', x: 70, y: GP + 1, z: -30 },
        { name: 'Wizard Tower', x: -55, y: 160, z: 35 },
      ],
      tour: [
        { name: 'Arrival Overlook', x: SPAWN.x, y: Math.floor(SPAWN.y) + 1, z: SPAWN.z + 2 },
        { name: 'Outer Gatehouse', x: 0, y: G + 3, z: -120 },
        { name: 'Garden Terraces', x: 0, y: 106, z: -65 },
        { name: 'Cathedral Nave', x: 0, y: CATH.floor + 2, z: CATH.z0 + 16 },
        { name: 'Inner Palace Court', x: 0, y: FLOOR.ground + 2, z: KEEP.z0 - 8 },
        { name: 'Great Hall', x: KCX, y: FLOOR.hall + 2, z: KCZ },
        { name: 'Throne Floor', x: KCX, y: FLOOR.throne + 2, z: KCZ },
        { name: 'High Palace', x: KCX, y: FLOOR.high + 2, z: KCZ },
        { name: 'Sky Bridge', x: KEEP.x1 + 12, y: FLOOR.high + 3, z: KCZ + 4 },
        { name: 'Crown Balcony', x: KCX, y: crownY + 1, z: KCZ - 2 },
      ],
    };
  }

  return undefined;
}
