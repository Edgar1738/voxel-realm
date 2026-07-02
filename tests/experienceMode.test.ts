import { describe, it, expect } from 'vitest';
import { isCuratedWorld, initialExperienceMode } from '../src/app/experienceMode';
import { creativeInputAllowed } from '../src/app/input';
import type { WorldMeta } from '../src/persistence/SaveTypes';
import { REGULAR_USER_MOONSPIRE_META } from './fixtures/curatedMeta';

const bare: WorldMeta = { seed: 1, version: 1, preset: 'default' };

describe('isCuratedWorld / initialExperienceMode', () => {
  it('a fully curated world opens in play mode', () => {
    expect(isCuratedWorld(REGULAR_USER_MOONSPIRE_META)).toBe(true);
    expect(initialExperienceMode(REGULAR_USER_MOONSPIRE_META)).toBe('play');
  });

  it('missing or sparse meta keeps creative build mode', () => {
    expect(initialExperienceMode(undefined)).toBe('build');
    expect(initialExperienceMode(bare)).toBe('build');
    // spawn/look without a player-facing identity is a dev bookmark, not curation
    expect(
      initialExperienceMode({ ...bare, spawn: { x: 0, y: 64, z: 0 }, look: { yaw: 0, pitch: 0 } }),
    ).toBe('build');
    // identity without an authored arrival is not curated either
    expect(initialExperienceMode({ ...bare, title: 'X', description: 'Y' })).toBe('build');
    // whitespace-only title does not count
    expect(
      initialExperienceMode({
        ...bare,
        title: '   ',
        description: 'Y',
        spawn: { x: 0, y: 64, z: 0 },
        look: { yaw: 0, pitch: 0 },
      }),
    ).toBe('build');
  });
});

describe('creativeInputAllowed', () => {
  it('gates every creative input in play mode and none in build mode', () => {
    expect(creativeInputAllowed('play')).toBe(false);
    expect(creativeInputAllowed('build')).toBe(true);
  });
});
