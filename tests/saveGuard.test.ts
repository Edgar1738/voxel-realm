import { describe, it, expect } from 'vitest';
import { resolveSaveAction } from '../src/persistence/SaveGuard';

const SEED = 1337;
const VERSION = 1;
const PRESET = 'default';

describe('resolveSaveAction', () => {
  it('loads when stored meta matches the current seed, version, and preset', () => {
    expect(
      resolveSaveAction({ seed: SEED, version: VERSION, preset: PRESET }, SEED, VERSION, PRESET),
    ).toEqual({ kind: 'load' });
  });

  it('treats missing preset on stored meta as the default preset', () => {
    expect(resolveSaveAction({ seed: SEED, version: VERSION }, SEED, VERSION, 'default')).toEqual({
      kind: 'load',
    });
  });

  it('resets with reason "no-meta" when there is no stored meta', () => {
    expect(resolveSaveAction(undefined, SEED, VERSION, PRESET)).toEqual({
      kind: 'reset',
      reason: 'no-meta',
    });
  });

  it('resets as incompatible when the seed differs', () => {
    expect(
      resolveSaveAction(
        { seed: SEED + 1, version: VERSION, preset: PRESET },
        SEED,
        VERSION,
        PRESET,
      ),
    ).toEqual({ kind: 'reset', reason: 'incompatible' });
  });

  it('resets as incompatible when the version differs', () => {
    expect(
      resolveSaveAction(
        { seed: SEED, version: VERSION + 1, preset: PRESET },
        SEED,
        VERSION,
        PRESET,
      ),
    ).toEqual({ kind: 'reset', reason: 'incompatible' });
  });

  it('resets as incompatible when the preset differs', () => {
    expect(
      resolveSaveAction({ seed: SEED, version: VERSION, preset: 'flat' }, SEED, VERSION, 'default'),
    ).toEqual({ kind: 'reset', reason: 'incompatible' });
  });
});
