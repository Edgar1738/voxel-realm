import { describe, it, expect } from 'vitest';
import {
  clampSensitivity,
  clampFov,
  qualityMaxVd,
  loadSensitivity,
  saveSensitivity,
  loadFov,
  saveFov,
  loadInvertY,
  saveInvertY,
  loadViewQuality,
  saveViewQuality,
  DEFAULT_SENSITIVITY,
  DEFAULT_FOV,
  DEFAULT_VIEW_QUALITY,
  SENSITIVITY_MIN,
  SENSITIVITY_MAX,
  FOV_MIN,
  FOV_MAX,
  type PrefStore,
} from '../src/app/playerPrefs';
import { MAX_VIEW_DISTANCE } from '../src/core/constants';

function fakeStore(
  init: Record<string, string> = {},
): PrefStore & { data: Record<string, string> } {
  const data = { ...init };
  return {
    data,
    getItem: (k) => data[k] ?? null,
    setItem: (k, v) => {
      data[k] = v;
    },
  };
}

describe('clamps', () => {
  it('sensitivity clamps to range and rejects non-finite', () => {
    expect(clampSensitivity(1)).toBe(1);
    expect(clampSensitivity(0.01)).toBe(SENSITIVITY_MIN);
    expect(clampSensitivity(99)).toBe(SENSITIVITY_MAX);
    expect(clampSensitivity(NaN)).toBe(DEFAULT_SENSITIVITY);
  });

  it('fov clamps to range and rounds to an integer', () => {
    expect(clampFov(70.4)).toBe(70);
    expect(clampFov(10)).toBe(FOV_MIN);
    expect(clampFov(180)).toBe(FOV_MAX);
    expect(clampFov(Infinity)).toBe(DEFAULT_FOV);
  });

  it('view quality maps to an adaptive ceiling, far == engine max', () => {
    expect(qualityMaxVd('short')).toBe(6);
    expect(qualityMaxVd('medium')).toBe(10);
    expect(qualityMaxVd('far')).toBe(MAX_VIEW_DISTANCE);
  });
});

describe('load/save round-trips with defaults + clamping', () => {
  it('sensitivity', () => {
    const s = fakeStore();
    expect(loadSensitivity(s)).toBe(DEFAULT_SENSITIVITY);
    saveSensitivity(s, 2.0);
    expect(loadSensitivity(s)).toBe(2.0);
    saveSensitivity(s, 999); // clamped on the way in
    expect(loadSensitivity(s)).toBe(SENSITIVITY_MAX);
    expect(loadSensitivity(fakeStore({ 'vr.mouseSensitivity': 'garbage' }))).toBe(
      DEFAULT_SENSITIVITY,
    );
  });

  it('fov', () => {
    const s = fakeStore();
    expect(loadFov(s)).toBe(DEFAULT_FOV);
    saveFov(s, 85);
    expect(loadFov(s)).toBe(85);
    expect(loadFov(fakeStore({ 'vr.fov': '5' }))).toBe(FOV_MIN);
  });

  it('invert-Y is off unless explicitly on', () => {
    const s = fakeStore();
    expect(loadInvertY(s)).toBe(false);
    saveInvertY(s, true);
    expect(loadInvertY(s)).toBe(true);
    saveInvertY(s, false);
    expect(loadInvertY(s)).toBe(false);
  });

  it('view quality defaults to far and rejects junk', () => {
    const s = fakeStore();
    expect(loadViewQuality(s)).toBe(DEFAULT_VIEW_QUALITY);
    saveViewQuality(s, 'short');
    expect(loadViewQuality(s)).toBe('short');
    expect(loadViewQuality(fakeStore({ 'vr.viewQuality': 'ultra' }))).toBe(DEFAULT_VIEW_QUALITY);
  });

  it('fails open when the store throws', () => {
    const throwing: PrefStore = {
      getItem: () => {
        throw new Error('x');
      },
      setItem: () => {
        throw new Error('x');
      },
    };
    expect(loadSensitivity(throwing)).toBe(DEFAULT_SENSITIVITY);
    expect(loadFov(throwing)).toBe(DEFAULT_FOV);
    expect(loadInvertY(throwing)).toBe(false);
    expect(loadViewQuality(throwing)).toBe(DEFAULT_VIEW_QUALITY);
    expect(() => saveFov(throwing, 70)).not.toThrow();
  });
});
