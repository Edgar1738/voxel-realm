import type { WorldMeta } from '../persistence/SaveTypes';

/**
 * The player-facing experience mode. `play` is explore-first: creative/build UI is hidden and
 * every world-mutating input is gated off (movement, look, fly, sound and the headlamp stay).
 * `build` is the full creative experience the app has always had.
 */
export type ExperienceMode = 'play' | 'build';

/**
 * A world is "curated" when its metadata carries a player-facing identity (title + description)
 * AND an authored arrival (spawn + look). Landmarks/tour are optional extras on top.
 */
export function isCuratedWorld(meta: WorldMeta | undefined): boolean {
  return Boolean(meta && meta.title?.trim() && meta.description?.trim() && meta.spawn && meta.look);
}

/** Curated worlds open in explore-first `play` mode; everything else keeps creative `build`. */
export function initialExperienceMode(meta: WorldMeta | undefined): ExperienceMode {
  return isCuratedWorld(meta) ? 'play' : 'build';
}
