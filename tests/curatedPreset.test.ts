import { describe, expect, it } from 'vitest';
import { curatedPresetMeta } from '../src/app/curatedPreset';

describe('Ashen Reach curated metadata', () => {
  it('gives a new Ashen Reach world an authored arrival and tour', () => {
    expect(curatedPresetMeta('ashen-reach', 1337, 1)).toMatchObject({
      title: 'Ashen Reach',
      preset: 'ashen-reach',
      spawn: { x: 0, y: 108, z: 95 },
      look: { yaw: 0, pitch: -0.12 },
    });
    expect(curatedPresetMeta('ashen-reach', 1337, 1)?.tour).toHaveLength(4);
  });

  it('does not turn ordinary generator presets into curated worlds', () => {
    expect(curatedPresetMeta('default', 1337, 1)).toBeUndefined();
  });
});

describe('Cloudspire curated metadata', () => {
  it('authors arrival, tour, and atmosphere', () => {
    const meta = curatedPresetMeta('cloudspire-citadel', 1337, 2);
    expect(meta?.title).toBe('Cloudspire Citadel');
    expect(meta?.preset).toBe('cloudspire-citadel');
    expect(meta?.tour?.length).toBeGreaterThanOrEqual(8);
    expect(meta?.atmosphere?.weather).toBe('clear');
  });
});
