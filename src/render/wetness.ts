import type { WeatherKind } from '../app/weatherSchedule';

/** How soaked the world gets under each weather kind (0..1). */
export function wetnessTarget(kind: WeatherKind): number {
  if (kind === 'storm') return 1;
  if (kind === 'rain') return 0.8;
  if (kind === 'snow') return 0.15; // a damp sheen, not a downpour
  return 0;
}

/** Surfaces soak fast (~3s to full) ... */
const SOAK_RATE = 0.35;
/** ...and dry slowly (~15s+), so the world stays glistening after a shower passes. */
const DRY_RATE = 0.06;

/** One frame's step of the global wetness factor toward the weather's target. */
export function stepWetness(current: number, target: number, dt: number): number {
  const rate = target > current ? SOAK_RATE : DRY_RATE;
  const delta = Math.sign(target - current) * Math.min(Math.abs(target - current), rate * dt);
  return current + delta;
}
