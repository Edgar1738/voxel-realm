import { describe, it, expect } from 'vitest';
import { FACING, packState, unpackState } from '../src/world/VoxelState';
import { stairFacingCode, stairState, stairFacingToward } from '../src/app/stairFacing';

describe('stairFacingCode', () => {
  it('maps n/e/s/w to the packed facing codes', () => {
    expect(stairFacingCode('n')).toBe(FACING.N);
    expect(stairFacingCode('e')).toBe(FACING.E);
    expect(stairFacingCode('s')).toBe(FACING.S);
    expect(stairFacingCode('w')).toBe(FACING.W);
  });

  it('is case-insensitive', () => {
    expect(stairFacingCode('N')).toBe(FACING.N);
    expect(stairFacingCode('W')).toBe(FACING.W);
  });

  it('throws on an unknown facing', () => {
    expect(() => stairFacingCode('up')).toThrow(/invalid stair facing/);
    expect(() => stairFacingCode('')).toThrow(/invalid stair facing/);
  });
});

describe('stairState', () => {
  it('packs a bottom-half stair by default', () => {
    expect(stairState('n')).toBe(packState(FACING.N, 0));
    expect(stairState('s')).toBe(packState(FACING.S, 0));
  });

  it('flips to the top half when top is set', () => {
    expect(stairState('e', { top: true })).toBe(packState(FACING.E, 1));
  });

  it('round-trips through unpackState', () => {
    const s = stairState('w', { top: true });
    expect(unpackState(s)).toEqual({ facing: FACING.W, half: 1 });
  });
});

describe('stairFacingToward', () => {
  it('picks the compass facing of the outward vector', () => {
    expect(stairFacingToward(0, -1)).toBe('n');
    expect(stairFacingToward(0, 1)).toBe('s');
    expect(stairFacingToward(1, 0)).toBe('e');
    expect(stairFacingToward(-1, 0)).toBe('w');
  });

  it('uses the dominant axis for diagonal vectors', () => {
    expect(stairFacingToward(5, -2)).toBe('e');
    expect(stairFacingToward(-1, 4)).toBe('s');
  });

  it('resolves |dx| === |dz| ties to the z axis', () => {
    expect(stairFacingToward(3, 3)).toBe('s');
    expect(stairFacingToward(-2, -2)).toBe('n');
  });
});
