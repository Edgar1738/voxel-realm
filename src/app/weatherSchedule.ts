/** Sky conditions the world can be in. Storm is rain + lightning. */
export type WeatherKind = 'clear' | 'rain' | 'storm' | 'snow';

export interface WeatherSpell {
  kind: WeatherKind;
  /** How long this spell lasts, in seconds. */
  durationSec: number;
}

/** [min, max) spell lengths per kind, in seconds. Mostly-clear pacing, like Minecraft. */
const DURATION: Record<WeatherKind, [number, number]> = {
  clear: [240, 600],
  rain: [90, 240],
  storm: [60, 150],
  snow: [90, 240],
};

/** Transition weights out of each kind (relative, normalized at pick time). */
const TRANSITIONS: Record<WeatherKind, [WeatherKind, number][]> = {
  clear: [
    ['rain', 5],
    ['snow', 2],
    ['storm', 2],
  ],
  rain: [
    ['clear', 6],
    ['storm', 3],
  ],
  storm: [
    ['rain', 3],
    ['clear', 5],
  ],
  snow: [['clear', 1]],
};

function pick(current: WeatherKind, roll: number): WeatherKind {
  const options = TRANSITIONS[current];
  const total = options.reduce((sum, [, w]) => sum + w, 0);
  let r = roll * total;
  for (const [kind, weight] of options) {
    r -= weight;
    if (r < 0) return kind;
  }
  return options[options.length - 1][0];
}

/**
 * Picks the spell that follows `current`. `rng` is a [0,1) source (inject a seeded one
 * for tests; `Math.random` in the game). Weather never repeats back-to-back — every
 * transition changes the sky, so a spell ending is always a visible event.
 */
export function nextSpell(current: WeatherKind, rng: () => number): WeatherSpell {
  const kind = pick(current, rng());
  const [min, max] = DURATION[kind];
  return { kind, durationSec: min + rng() * (max - min) };
}

/**
 * Clock that walks the weather Markov chain. `advance(dt)` returns the new kind when a
 * spell ends, or undefined while one is running. `force(kind)` pins the weather (auto
 * progression stops) and `resume()` re-enters the chain from the pinned kind.
 */
export class WeatherClock {
  private kindState: WeatherKind = 'clear';
  private remaining: number;
  private locked = false;

  constructor(private readonly rng: () => number = Math.random) {
    const [min, max] = DURATION.clear;
    this.remaining = min + rng() * (max - min);
  }

  get kind(): WeatherKind {
    return this.kindState;
  }

  advance(dt: number): WeatherKind | undefined {
    if (this.locked) return undefined;
    this.remaining -= dt;
    if (this.remaining > 0) return undefined;
    const spell = nextSpell(this.kindState, this.rng);
    this.kindState = spell.kind;
    this.remaining = spell.durationSec;
    return spell.kind;
  }

  force(kind: WeatherKind): void {
    this.kindState = kind;
    this.locked = true;
  }

  resume(): void {
    this.locked = false;
    this.remaining = 0; // next advance() rolls a fresh spell immediately
  }
}
