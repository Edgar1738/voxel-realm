import { describe, it, expect } from 'vitest';
import { packState, unpackState, FACING, facingFromYaw } from '../src/world/VoxelState';
import { ChunkData } from '../src/world/ChunkData';

describe('packState/unpackState', () => {
  it('round-trips facing + half in one byte', () => {
    for (const facing of [0, 1, 2, 3]) {
      for (const half of [0, 1]) {
        const s = packState(facing, half);
        expect(s).toBeGreaterThanOrEqual(0);
        expect(s).toBeLessThan(256);
        expect(unpackState(s)).toEqual({ facing, half });
      }
    }
  });
  it('facing occupies bits 0-1, half bit 2', () => {
    expect(packState(FACING.W, 1)).toBe(0b111); // facing 3 | half<<2
  });
});

describe('facingFromYaw', () => {
  it('maps the 4 quadrants to 4 distinct facings', () => {
    const facings = [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2].map(facingFromYaw);
    expect(new Set(facings).size).toBe(4);
    facings.forEach((f) => expect([0, 1, 2, 3]).toContain(f));
  });
  it('is stable under full-turn wrap', () => {
    expect(facingFromYaw(0.3)).toBe(facingFromYaw(0.3 + 2 * Math.PI));
  });
});

describe('ChunkData.state', () => {
  it('defaults to 0 and round-trips setState/getState', () => {
    const d = new ChunkData(0, 0);
    expect(d.getState(1, 2, 3)).toBe(0);
    d.setState(1, 2, 3, packState(FACING.E, 1));
    expect(d.getState(1, 2, 3)).toBe(packState(FACING.E, 1));
  });
  it('out-of-bounds getState reads 0', () => {
    expect(new ChunkData(0, 0).getState(-1, 0, 0)).toBe(0);
  });
});
