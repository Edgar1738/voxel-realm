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
  if (preset === 'kingshollow') {
    return {
      seed,
      version,
      ...(worldgenVersion === undefined ? {} : { worldgenVersion }),
      preset,
      title: 'Kingshollow Village',
      description:
        'A living medieval shire beneath a hill castle: merchant streets, riverside industry, western farms, a northern abbey, and a vast hidden world below.',
      // Start a little above the green so the opening vista cannot clip the surface while the
      // surrounding chunks finish their first mesh pass.
      spawn: { x: 0.5, y: 69.5, z: 78.5 },
      look: { yaw: 0, pitch: -0.08 },
      atmosphere: { weather: 'clear', timeOfDay: 0.36, fogNear: 130, fogFar: 360 },
      landmarks: [
        { name: 'South Village Green', x: 0, y: 67, z: 67 },
        { name: 'Market Well', x: 0, y: 68, z: 2 },
        { name: 'West Farmstead', x: -54, y: 67, z: 23 },
        { name: 'Castle Gate', x: 0, y: 73, z: -28 },
        { name: 'Kingshollow Keep', x: 0, y: 74, z: -49 },
        { name: 'Castle Well', x: -15, y: 73, z: -49 },
        { name: 'Old Smuggler Works', x: -4, y: 46, z: -18 },
        { name: 'Echoing Reservoir', x: 13, y: 40, z: 12 },
        { name: 'Crystal Crossing', x: 47, y: 36, z: 18 },
        { name: 'The Great Rift', x: 2, y: 40, z: 24 },
        { name: 'Obsidian Confluence', x: -29, y: 12, z: -5 },
        { name: 'Heartforge Sanctum', x: 2, y: 9, z: -48 },
        { name: 'South Gate', x: 0, y: 68, z: 93 },
        { name: "King's Road Inn", x: -25, y: 68, z: 107 },
        { name: 'Kingshollow Windmill', x: -145, y: 77, z: 18 },
        { name: 'West Manor Farm', x: -116, y: 68, z: 58 },
        { name: 'East River Bridge', x: 108, y: 68, z: 2 },
        { name: 'Old Watermill', x: 123, y: 68, z: 39 },
        { name: 'Stonecutters Yard', x: 86, y: 68, z: 20 },
        { name: 'Kingshollow Abbey', x: 0, y: 75, z: -140 },
        { name: 'Abbey Watchtower', x: 80, y: 75, z: -141 },
        { name: 'Eastern Standing Stones', x: 210, y: 68, z: 113 },
      ],
      tour: [
        { name: 'South Village Green', x: 0, y: 67, z: 67 },
        { name: 'South Gate', x: 0, y: 68, z: 91 },
        { name: "King's Road Inn", x: -14, y: 68, z: 108 },
        { name: 'Merchant Ward', x: 0, y: 68, z: 124 },
        { name: 'Farm Lane', x: -47, y: 67, z: 45 },
        { name: 'West Manor Farm', x: -107, y: 68, z: 58 },
        { name: 'Kingshollow Windmill', x: -137, y: 68, z: 18 },
        { name: 'Market Well', x: 0, y: 68, z: 12 },
        { name: 'East River Bridge', x: 100, y: 68, z: 2 },
        { name: 'Old Watermill', x: 122, y: 68, z: 31 },
        { name: 'Stonecutters Yard', x: 85, y: 68, z: 12 },
        { name: 'Castle Gate', x: 0, y: 74, z: -25 },
        { name: 'Kingshollow Abbey', x: 0, y: 75, z: -116 },
        { name: 'Great Hall', x: 0, y: 74, z: -45 },
        { name: 'Castle Well', x: -13, y: 59, z: -49 },
        { name: 'Old Smuggler Works', x: -4, y: 46, z: -18 },
        { name: 'Echoing Reservoir', x: -3, y: 40, z: 9 },
        { name: 'Crystal Crossing', x: 47, y: 36, z: 18 },
        { name: 'The Great Rift', x: 2, y: 40, z: 24 },
        { name: 'Ember Descent', x: -35, y: 20, z: 6 },
        { name: 'Obsidian Confluence', x: -25, y: 12, z: -2 },
        { name: 'Heartforge Sanctum', x: 2, y: 9, z: -43 },
        { name: 'Ancient Return', x: 15, y: 72, z: -51 },
      ],
    };
  }

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
