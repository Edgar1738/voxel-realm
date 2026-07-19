import { describe, expect, it } from 'vitest';
import {
  CURRENT_WORLDGEN_VERSION,
  LEGACY_WORLDGEN_VERSION,
  resolveWorldgenVersion,
} from '../src/worldgen/worldgenVersion';

const SEED = 1337;
const SAVE_VERSION = 2;
const PRESET = 'default';

describe('worldgen version resolution', () => {
  it('uses current generation for new worlds', () => {
    expect(resolveWorldgenVersion(undefined, SEED, SAVE_VERSION, PRESET)).toBe(
      CURRENT_WORLDGEN_VERSION,
    );
  });

  it('treats compatible saves without a field as legacy', () => {
    expect(
      resolveWorldgenVersion(
        { seed: SEED, version: SAVE_VERSION, preset: PRESET },
        SEED,
        SAVE_VERSION,
        PRESET,
      ),
    ).toBe(LEGACY_WORLDGEN_VERSION);
  });

  it('keeps an explicitly current compatible save current', () => {
    expect(
      resolveWorldgenVersion(
        {
          seed: SEED,
          version: SAVE_VERSION,
          preset: PRESET,
          worldgenVersion: CURRENT_WORLDGEN_VERSION,
        },
        SEED,
        SAVE_VERSION,
        PRESET,
      ),
    ).toBe(CURRENT_WORLDGEN_VERSION);
  });

  it('uses current generation when an incompatible save will be reset', () => {
    expect(
      resolveWorldgenVersion(
        { seed: SEED + 1, version: SAVE_VERSION, preset: PRESET },
        SEED,
        SAVE_VERSION,
        PRESET,
      ),
    ).toBe(CURRENT_WORLDGEN_VERSION);
  });
});
