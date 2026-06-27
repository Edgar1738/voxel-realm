import { describe, it, expect } from 'vitest';
import { resolveSaveAction } from '../src/persistence/SaveGuard';

const SEED = 1337;
const VERSION = 1;

describe('resolveSaveAction', () => {
  it('loads when stored meta matches the current seed and version', () => {
    expect(resolveSaveAction({ seed: SEED, version: VERSION }, SEED, VERSION)).toEqual({
      kind: 'load',
    });
  });

  it('resets with reason "no-meta" when there is no stored meta', () => {
    expect(resolveSaveAction(undefined, SEED, VERSION)).toEqual({
      kind: 'reset',
      reason: 'no-meta',
    });
  });

  it('resets as incompatible when the seed differs', () => {
    expect(resolveSaveAction({ seed: SEED + 1, version: VERSION }, SEED, VERSION)).toEqual({
      kind: 'reset',
      reason: 'incompatible',
    });
  });

  it('resets as incompatible when the version differs', () => {
    expect(resolveSaveAction({ seed: SEED, version: VERSION + 1 }, SEED, VERSION)).toEqual({
      kind: 'reset',
      reason: 'incompatible',
    });
  });
});
