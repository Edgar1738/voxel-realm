import { describe, it, expect } from 'vitest';
import {
  familyOf,
  batchSound,
  landingVolume,
  parseVolume,
  LANDING_MIN_SPEED,
  LANDING_MAX_SPEED,
} from '../src/audio/sounds';
import { MovementSoundTracker } from '../src/audio/MovementSounds';
import {
  AIR,
  GRASS,
  STONE,
  WOOD,
  SAND,
  GLASS,
  DIRT,
  PLANKS,
  OAK_FENCE_GATE,
  WATER,
  SNOW,
  BLOCK_DEFS,
} from '../src/blocks/blocks';

describe('familyOf', () => {
  it('is silent for air', () => {
    expect(familyOf(AIR)).toBeUndefined();
  });

  it('maps representative blocks to their material family', () => {
    expect(familyOf(STONE)).toBe('stone');
    expect(familyOf(WOOD)).toBe('wood');
    expect(familyOf(PLANKS)).toBe('wood');
    expect(familyOf(OAK_FENCE_GATE)).toBe('wood');
    expect(familyOf(GRASS)).toBe('grass');
    expect(familyOf(DIRT)).toBe('dirt');
    expect(familyOf(SAND)).toBe('sand');
    expect(familyOf(SNOW)).toBe('snow');
    expect(familyOf(GLASS)).toBe('glass');
    expect(familyOf(WATER)).toBe('water');
  });

  it('gives every registered non-air block a family (fallback = stone)', () => {
    for (const def of BLOCK_DEFS) {
      if (def.id === AIR) continue;
      expect(familyOf(def.id), def.name).toBeDefined();
    }
  });
});

describe('batchSound', () => {
  it('returns undefined for an empty batch', () => {
    expect(batchSound([])).toBeUndefined();
  });

  it('voices a break with the broken block family', () => {
    expect(batchSound([{ before: STONE, after: AIR }])).toEqual({
      kind: 'break',
      family: 'stone',
    });
  });

  it('voices a placement with the placed block family', () => {
    expect(batchSound([{ before: AIR, after: PLANKS }])).toEqual({
      kind: 'place',
      family: 'wood',
    });
  });

  it('prefers the break when a batch mixes breaks and placements', () => {
    expect(
      batchSound([
        { before: AIR, after: PLANKS },
        { before: GRASS, after: AIR },
      ]),
    ).toEqual({ kind: 'break', family: 'grass' });
  });

  it('treats a replace (block -> other block) as a placement', () => {
    expect(batchSound([{ before: STONE, after: GLASS }])).toEqual({
      kind: 'place',
      family: 'glass',
    });
  });
});

describe('landingVolume', () => {
  it('is silent below the threshold', () => {
    expect(landingVolume(LANDING_MIN_SPEED - 1)).toBe(0);
    expect(landingVolume(0)).toBe(0);
  });

  it('grows with impact speed and caps at 1', () => {
    const soft = landingVolume(LANDING_MIN_SPEED + 1);
    const hard = landingVolume(LANDING_MAX_SPEED);
    expect(soft).toBeGreaterThan(0);
    expect(hard).toBeGreaterThan(soft);
    expect(landingVolume(LANDING_MAX_SPEED * 3)).toBe(1);
  });
});

describe('parseVolume', () => {
  it('falls back when absent or invalid', () => {
    expect(parseVolume(null, 0.6)).toBe(0.6);
    expect(parseVolume('not-a-number', 0.6)).toBe(0.6);
    expect(parseVolume('1.5', 0.6)).toBe(0.6);
    expect(parseVolume('-0.1', 0.6)).toBe(0.6);
  });

  it('accepts valid persisted values', () => {
    expect(parseVolume('0', 0.6)).toBe(0);
    expect(parseVolume('0.35', 0.6)).toBe(0.35);
    expect(parseVolume('1', 0.6)).toBe(1);
  });
});

describe('MovementSoundTracker', () => {
  const DT = 1 / 60;

  it('emits nothing on the priming frame', () => {
    const t = new MovementSoundTracker();
    expect(t.update(DT, 0, 10, 0, true)).toEqual({ stepped: false, landed: 0 });
  });

  it('steps once per stride of grounded horizontal travel', () => {
    const t = new MovementSoundTracker();
    t.update(DT, 0, 10, 0, true);
    let steps = 0;
    // Walk 5 blocks in 0.1-block increments.
    for (let x = 0.1; x <= 5.0001; x += 0.1) {
      if (t.update(DT, x, 10, 0, true).stepped) steps++;
    }
    expect(steps).toBe(2); // 5 blocks / 2.1 stride
  });

  it('does not step while airborne', () => {
    const t = new MovementSoundTracker();
    t.update(DT, 0, 10, 0, false);
    let steps = 0;
    for (let x = 0.1; x <= 5.0001; x += 0.1) {
      if (t.update(DT, x, 10, 0, false).stepped) steps++;
    }
    expect(steps).toBe(0);
  });

  it('emits a landing scaled by fall speed on the airborne->grounded edge', () => {
    const t = new MovementSoundTracker();
    t.update(DT, 0, 20, 0, false);
    // Fall fast: 20 blocks/s downward.
    let y = 20;
    for (let i = 0; i < 10; i++) {
      y -= 20 * DT;
      expect(t.update(DT, 0, y, 0, false).landed).toBe(0);
    }
    const landing = t.update(DT, 0, y, 0, true);
    expect(landing.landed).toBeGreaterThan(0);
    // Grounded frames afterward stay silent.
    expect(t.update(DT, 0, y, 0, true).landed).toBe(0);
  });

  it('lands silently after a small hop', () => {
    const t = new MovementSoundTracker();
    t.update(DT, 0, 10, 0, true);
    t.update(DT, 0, 10.2, 0, false); // rising
    t.update(DT, 0, 10.1, 0, false); // falling slowly (~6 blocks/s)
    expect(t.update(DT, 0, 10, 0, true).landed).toBe(0);
  });
});
