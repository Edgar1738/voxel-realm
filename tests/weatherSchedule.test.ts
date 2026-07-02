import { describe, it, expect } from 'vitest';
import { nextSpell, WeatherClock, type WeatherKind } from '../src/app/weatherSchedule';

/** rng returning a fixed sequence, then repeating the last value. */
function seq(values: number[]): () => number {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)];
}

describe('nextSpell', () => {
  it('never repeats the current kind back-to-back', () => {
    const kinds: WeatherKind[] = ['clear', 'rain', 'storm', 'snow'];
    for (const kind of kinds) {
      for (let roll = 0; roll < 20; roll++) {
        const spell = nextSpell(kind, seq([roll / 20, 0.5]));
        expect(spell.kind).not.toBe(kind);
      }
    }
  });

  it('picks by cumulative weight: a low roll out of clear is rain, a high roll is storm', () => {
    expect(nextSpell('clear', seq([0.1, 0.5])).kind).toBe('rain');
    expect(nextSpell('clear', seq([0.99, 0.5])).kind).toBe('storm');
  });

  it('snow always clears', () => {
    expect(nextSpell('snow', seq([0.0, 0.5])).kind).toBe('clear');
    expect(nextSpell('snow', seq([0.999, 0.5])).kind).toBe('clear');
  });

  it('duration lands inside the kind range and scales with the second roll', () => {
    const short = nextSpell('clear', seq([0.1, 0]));
    const long = nextSpell('clear', seq([0.1, 0.9999]));
    expect(short.kind).toBe(long.kind);
    expect(short.durationSec).toBeLessThan(long.durationSec);
    expect(short.durationSec).toBeGreaterThan(0);
  });
});

describe('WeatherClock', () => {
  it('stays on the initial spell until it runs out, then rolls a new kind', () => {
    // First roll (in the constructor) sets the initial clear duration to the minimum (240s).
    const clock = new WeatherClock(seq([0, 0.1, 0.5]));
    expect(clock.kind).toBe('clear');
    expect(clock.advance(239)).toBeUndefined();
    const next = clock.advance(2);
    expect(next).toBe('rain');
    expect(clock.kind).toBe('rain');
  });

  it('force() pins the kind and stops the cycle; resume() rolls immediately', () => {
    const clock = new WeatherClock(seq([0, 0.1, 0.5]));
    clock.force('storm');
    expect(clock.kind).toBe('storm');
    expect(clock.advance(10_000)).toBeUndefined();
    clock.resume();
    const next = clock.advance(0.016);
    expect(next).toBeDefined();
    expect(next).not.toBe('storm');
  });
});
