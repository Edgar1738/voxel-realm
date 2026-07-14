import { describe, it, expect } from 'vitest';
import { ViewDistanceGovernor } from '../src/app/ViewDistanceGovernor';

const TUNING = {
  windowFrames: 2,
  growCooldownFrames: 2,
  shrinkCooldownFrames: 2,
  growAtOrBelowMs: 18,
  shrinkAtOrAboveMs: 22,
};

function gov(minVd: number, maxVd: number, initial: number) {
  return new ViewDistanceGovernor({ minVd, maxVd, ...TUNING }, initial);
}

describe('ViewDistanceGovernor', () => {
  it('grows once a full window of good frames elapses while idle', () => {
    const g = gov(1, 4, 1);
    expect(g.sample(16, false)).toBeUndefined(); // window not full yet
    expect(g.sample(16, false)).toBe(2); // full window, p95 <= 18 -> grow
    expect(g.viewDistance).toBe(2);
  });

  it('does not grow while streaming', () => {
    const g = gov(1, 4, 1);
    expect(g.sample(16, true)).toBeUndefined();
    expect(g.sample(16, true)).toBeUndefined();
    expect(g.viewDistance).toBe(1);
  });

  it('shrinks when frames sustain above the drop threshold', () => {
    const g = gov(1, 4, 3);
    expect(g.sample(33, false)).toBeUndefined();
    expect(g.sample(33, false)).toBe(2);
  });

  it('never grows past maxVd', () => {
    const g = gov(1, 2, 2);
    expect(g.sample(16, false)).toBeUndefined();
    expect(g.sample(16, false)).toBeUndefined(); // already at cap
    expect(g.viewDistance).toBe(2);
  });

  it('never shrinks below minVd', () => {
    const g = gov(2, 4, 2);
    expect(g.sample(33, false)).toBeUndefined();
    expect(g.sample(33, false)).toBeUndefined(); // already at floor
    expect(g.viewDistance).toBe(2);
  });

  it('suppresses changes during the cooldown after a change', () => {
    const g = gov(1, 4, 1);
    g.sample(16, false);
    expect(g.sample(16, false)).toBe(2); // grow, cooldown = 2
    expect(g.sample(16, false)).toBeUndefined(); // cooldown 2 -> 1
    expect(g.sample(16, false)).toBeUndefined(); // cooldown 1 -> 0
    expect(g.sample(16, false)).toBeUndefined(); // window refilling (1/2)
    expect(g.sample(16, false)).toBe(3); // window full again -> grow
  });

  it('does not let a streaming (load-inflated) frame pollute the decision window', () => {
    const g = gov(1, 4, 3); // room to shrink; a polluted window would shrink here
    expect(g.sample(100, true)).toBeUndefined(); // streaming spike must not enter the window
    expect(g.sample(16, false)).toBeUndefined(); // window=[16], len 1 < 2 (spike absent)
    expect(g.sample(16, false)).toBe(4); // window=[16,16] -> grow, never shrink
    expect(g.viewDistance).toBe(4);
  });

  describe('setMaxVd', () => {
    it('lowers the ceiling, clamps current down, and returns the new distance', () => {
      const g = gov(1, 16, 12);
      expect(g.setMaxVd(6)).toBe(6);
      expect(g.viewDistance).toBe(6);
    });

    it('leaves current alone when it already fits under the new cap', () => {
      const g = gov(1, 16, 4);
      expect(g.setMaxVd(10)).toBe(4);
      expect(g.viewDistance).toBe(4);
    });

    it('never drops the cap below minVd', () => {
      const g = gov(4, 16, 8);
      expect(g.setMaxVd(1)).toBe(4);
      expect(g.viewDistance).toBe(4);
    });

    it('clears the window so a raised cap grows from a fresh measurement', () => {
      const g = gov(1, 16, 4);
      g.sample(16, false); // window=[16], len 1 of 2
      g.setMaxVd(10); // clears the window
      expect(g.sample(16, false)).toBeUndefined(); // only 1 sample again, not enough
      expect(g.sample(16, false)).toBe(5); // now full -> grow
    });
  });
});
