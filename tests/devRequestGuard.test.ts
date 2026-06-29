import { describe, it, expect } from 'vitest';
import { isAllowedDevOrigin } from '../server/devRequestGuard';

describe('isAllowedDevOrigin', () => {
  it('allows when origin is undefined (same-origin navigation, curl, non-browser)', () => {
    expect(isAllowedDevOrigin(undefined, 'localhost:5173')).toBe(true);
  });

  it('allows http://localhost:5173', () => {
    expect(isAllowedDevOrigin('http://localhost:5173', 'localhost:5173')).toBe(true);
  });

  it('allows http://127.0.0.1:8080', () => {
    expect(isAllowedDevOrigin('http://127.0.0.1:8080', '127.0.0.1:8080')).toBe(true);
  });

  it('allows http://[::1]:5173', () => {
    expect(isAllowedDevOrigin('http://[::1]:5173', '[::1]:5173')).toBe(true);
  });

  it('denies http://evil.com', () => {
    expect(isAllowedDevOrigin('http://evil.com', 'localhost:5173')).toBe(false);
  });

  it('denies https://attacker.test', () => {
    expect(isAllowedDevOrigin('https://attacker.test', 'localhost:5173')).toBe(false);
  });

  it('denies a malformed origin string', () => {
    expect(isAllowedDevOrigin('not-a-valid-origin', 'localhost:5173')).toBe(false);
  });
});

it('allows a same-host origin', () => {
  expect(isAllowedDevOrigin('http://localhost:5173', 'localhost:5173')).toBe(true);
});
it('denies a different-port localhost origin', () => {
  expect(isAllowedDevOrigin('http://localhost:6006', 'localhost:5173')).toBe(false);
});
it('still allows a missing Origin (non-browser / same-origin nav)', () => {
  expect(isAllowedDevOrigin(undefined, 'localhost:5173')).toBe(true);
});
