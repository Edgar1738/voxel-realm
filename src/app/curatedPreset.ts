import type { WorldMeta } from '../persistence/SaveTypes';
import type { WorldPreset } from '../worldgen/Presets';

/** Metadata for procedural-but-authored worlds, giving new worlds a curated arrival and tour. */
export function curatedPresetMeta(
  preset: WorldPreset,
  seed: number,
  version: number,
): WorldMeta | undefined {
  if (preset !== 'ashen-reach') return undefined;
  return {
    seed,
    version,
    preset,
    textureTheme: 'fantasy',
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
