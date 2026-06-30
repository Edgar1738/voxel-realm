import { describe, it, expect } from 'vitest';
import { OPEN_BIT, isOpen, setOpen, toggleOpen, packState, FACING } from '../src/world/VoxelState';
import { BlockRegistry } from '../src/blocks/BlockRegistry';
import { buildBlockTextures, type BlockDef } from '../src/blocks/blocks';

describe('open-state helpers', () => {
  it('OPEN_BIT is bit 3 and round-trips, preserving facing', () => {
    expect(OPEN_BIT).toBe(0b1000);
    const closed = packState(FACING.E, 0); // facing E, closed
    expect(isOpen(closed)).toBe(false);
    const opened = setOpen(closed, true);
    expect(isOpen(opened)).toBe(true);
    expect(opened & 0b11).toBe(FACING.E); // facing preserved
    expect(toggleOpen(opened)).toBe(closed); // toggle back
    expect(isOpen(toggleOpen(closed))).toBe(true);
  });
});

const planks = { pattern: 'planks' as const, colors: [[150, 116, 70] as [number, number, number]] };
const DEFS: BlockDef[] = [
  { id: 0, name: 'air', opaque: false, transparent: true },
  {
    id: 1,
    name: 'stone',
    opaque: true,
    transparent: false,
    faces: { pattern: 'stone', colors: [[128, 128, 132]] },
  },
  { id: 2, name: 'gate', opaque: true, transparent: false, shape: 'gate', faces: planks },
];
const reg = new BlockRegistry(DEFS, buildBlockTextures(DEFS));

describe('gate registry', () => {
  it('isToggleable only for gates; state-aware collisionAABBs', () => {
    expect(reg.isToggleable(2)).toBe(true);
    expect(reg.isToggleable(1)).toBe(false);
    expect(reg.collisionAABBs(2, packState(FACING.N, 0)).length).toBeGreaterThan(0); // closed gate has boxes
    expect(reg.collisionAABBs(2, setOpen(packState(FACING.N, 0), true)).length).toBe(0); // open gate is passable
    expect(reg.collisionAABBs(1, 0).length).toBeGreaterThan(0); // non-gate ignores state, always solid
    expect(reg.collisionAABBs(2, 0).length).toBeGreaterThan(0); // gate stateless default (state=0 = closed)
  });
});
