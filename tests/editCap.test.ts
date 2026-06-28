import { describe, it, expect } from 'vitest';
import { withinEditCap, MAX_EDIT_VOXELS } from '../src/app/editCap';

describe('withinEditCap', () => {
  it('allows a count of zero', () => {
    expect(withinEditCap(0, MAX_EDIT_VOXELS)).toBe(true);
  });

  it('allows a count well below the cap', () => {
    expect(withinEditCap(1, MAX_EDIT_VOXELS)).toBe(true);
    expect(withinEditCap(100, MAX_EDIT_VOXELS)).toBe(true);
  });

  it('allows a volume exactly equal to the cap', () => {
    expect(withinEditCap(MAX_EDIT_VOXELS, MAX_EDIT_VOXELS)).toBe(true);
  });

  it('rejects a volume one over the cap', () => {
    expect(withinEditCap(MAX_EDIT_VOXELS + 1, MAX_EDIT_VOXELS)).toBe(false);
  });

  it('rejects a count far above the cap', () => {
    expect(withinEditCap(MAX_EDIT_VOXELS * 2, MAX_EDIT_VOXELS)).toBe(false);
  });

  it('works with an arbitrary cap value', () => {
    expect(withinEditCap(5, 5)).toBe(true);
    expect(withinEditCap(6, 5)).toBe(false);
  });
});
