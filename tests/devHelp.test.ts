import { describe, it, expect } from 'vitest';
import { DEV_HELP } from '../src/app/devHelp';

describe('DEV_HELP', () => {
  it('documents the dev API across roam/build/perceive with a self entry', () => {
    // A representative spread from each section, so a truncated extraction would fail here.
    for (const key of [
      'pos',
      'teleport',
      'fill',
      'stairs',
      'blockAt',
      'world',
      'props',
      'propCatalog',
      'ambient',
      'help',
    ]) {
      expect(DEV_HELP[key], `missing help for ${key}`).toBeTypeOf('string');
      expect(DEV_HELP[key].length).toBeGreaterThan(0);
    }
    expect(Object.keys(DEV_HELP).length).toBeGreaterThan(40);
  });
});
