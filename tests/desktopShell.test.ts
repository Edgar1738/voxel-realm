import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  shouldShowDesktopShell,
  readShellSignals,
  DESKTOP_OVERRIDE_KEY,
} from '../src/app/desktopShell';

afterEach(() => vi.unstubAllGlobals());

describe('shouldShowDesktopShell', () => {
  it('shows only for touch-only devices without an override', () => {
    expect(shouldShowDesktopShell({ anyPointerFine: false, override: false })).toBe(true);
    expect(shouldShowDesktopShell({ anyPointerFine: true, override: false })).toBe(false);
    expect(shouldShowDesktopShell({ anyPointerFine: false, override: true })).toBe(false);
    expect(shouldShowDesktopShell({ anyPointerFine: true, override: true })).toBe(false);
  });
});

describe('readShellSignals', () => {
  it('reads any-pointer:fine from matchMedia and the override from sessionStorage', () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn((q: string) => ({ matches: q === '(any-pointer: fine)' ? false : true })),
    );
    vi.stubGlobal('sessionStorage', {
      getItem: (k: string) => (k === DESKTOP_OVERRIDE_KEY ? '1' : null),
    });
    expect(readShellSignals()).toEqual({ anyPointerFine: false, override: true });
  });

  it('fails open (assumes desktop) when matchMedia/sessionStorage are unavailable', () => {
    vi.stubGlobal('matchMedia', undefined);
    vi.stubGlobal('sessionStorage', undefined);
    expect(readShellSignals()).toEqual({ anyPointerFine: true, override: false });
  });

  it('fails open when matchMedia throws', () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => {
        throw new Error('nope');
      }),
    );
    vi.stubGlobal('sessionStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
    });
    expect(readShellSignals()).toEqual({ anyPointerFine: true, override: false });
  });
});
