import { describe, it, expect } from 'vitest';
import { BuilderState } from '../src/app/BuilderState';

const ID = 7 as never;

describe('BuilderState selection', () => {
  it('toggleMode goes off → selecting → off', () => {
    const b = new BuilderState();
    expect(b.mode).toBe('off');
    b.toggleMode();
    expect(b.mode).toBe('selecting');
    b.toggleMode();
    expect(b.mode).toBe('off');
  });

  it('setCorner fills A then B then cycles back to A; selectionBox spans both', () => {
    const b = new BuilderState();
    b.toggleMode();
    b.setCorner({ x: 1, y: 2, z: 3 });
    b.setCorner({ x: 4, y: 5, z: 6 });
    expect(b.selectionBox()).toEqual({ x1: 1, y1: 2, z1: 3, x2: 4, y2: 5, z2: 6 });
    b.setCorner({ x: 9, y: 9, z: 9 }); // cycles: replaces A
    expect(b.selectionBox()).toEqual({ x1: 9, y1: 9, z1: 9, x2: 4, y2: 5, z2: 6 });
  });

  it('selectionBox is undefined until both corners are set', () => {
    const b = new BuilderState();
    b.toggleMode();
    expect(b.selectionBox()).toBeUndefined();
    b.setCorner({ x: 0, y: 0, z: 0 });
    expect(b.selectionBox()).toBeUndefined();
  });
});

describe('BuilderState clipboard + transform', () => {
  it('setClipboard enters pasting mode with a reset transform', () => {
    const b = new BuilderState();
    b.setClipboard({ dims: [2, 1, 1], blocks: [[0, 0, 0, ID]] });
    expect(b.mode).toBe('pasting');
    expect(b.transform).toEqual({
      turns: 0,
      mirrorX: false,
      mirrorZ: false,
      arrayCount: 1,
      arrayAxis: 'x',
    });
  });

  it('rotate wraps modulo 4 in both directions', () => {
    const b = new BuilderState();
    b.setClipboard({ dims: [1, 1, 1], blocks: [[0, 0, 0, ID]] });
    b.rotate(1);
    expect(b.transform.turns).toBe(1);
    b.rotate(-2);
    expect(b.transform.turns).toBe(3);
  });

  it('arrayAdjust never drops below 1 and records the axis', () => {
    const b = new BuilderState();
    b.setClipboard({ dims: [1, 1, 1], blocks: [[0, 0, 0, ID]] });
    b.arrayAdjust(-5, 'z');
    expect(b.transform.arrayCount).toBe(1);
    expect(b.transform.arrayAxis).toBe('z');
    b.arrayAdjust(2, 'z');
    expect(b.transform.arrayCount).toBe(3);
  });

  it('transformedClipboard tiles along the array axis (count 3 on x doubles+ the block count)', () => {
    const b = new BuilderState();
    b.setClipboard({ dims: [1, 1, 1], blocks: [[0, 0, 0, ID]] });
    b.arrayAdjust(2, 'x'); // count 3
    const p = b.transformedClipboard()!;
    expect(p.blocks).toHaveLength(3);
    expect(p.dims[0]).toBe(3);
  });

  it('transformedClipboard is undefined with no clipboard', () => {
    expect(new BuilderState().transformedClipboard()).toBeUndefined();
  });
});

describe('BuilderState paste nudge', () => {
  it('accumulates nudge and applies it to a base origin without mutating input', () => {
    const b = new BuilderState();
    b.setClipboard({ dims: [1, 1, 1], blocks: [[0, 0, 0, ID]] });
    b.nudgeBy(2, 0, 0);
    b.nudgeBy(0, -1, 3);
    expect(b.nudge).toEqual({ x: 2, y: -1, z: 3 });
    const base = { x: 10, y: 20, z: 30 };
    expect(b.applyNudge(base)).toEqual({ x: 12, y: 19, z: 33 });
    expect(base).toEqual({ x: 10, y: 20, z: 30 }); // untouched
  });

  it('resetNudge clears the offset', () => {
    const b = new BuilderState();
    b.nudgeBy(5, 5, 5);
    b.resetNudge();
    expect(b.nudge).toEqual({ x: 0, y: 0, z: 0 });
  });

  it('starts a fresh paste un-nudged (setClipboard and exitPaste reset it)', () => {
    const b = new BuilderState();
    b.setClipboard({ dims: [1, 1, 1], blocks: [[0, 0, 0, ID]] });
    b.nudgeBy(3, 3, 3);
    b.setClipboard({ dims: [1, 1, 1], blocks: [[0, 0, 0, ID]] });
    expect(b.nudge).toEqual({ x: 0, y: 0, z: 0 });

    b.nudgeBy(1, 1, 1);
    b.exitPaste();
    expect(b.nudge).toEqual({ x: 0, y: 0, z: 0 });
  });
});
