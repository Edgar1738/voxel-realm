import { describe, expect, it } from 'vitest';
import {
  THREE_FLAG_WAYPOINTS,
  formatChallengeTime,
  startThreeFlagChallenge,
  tickThreeFlagChallenge,
} from '../src/npc/ThreeFlagChallenge';

describe('Three-Flag Trial', () => {
  it('advances through the flags in order and completes on the third', () => {
    let run = startThreeFlagChallenge();
    for (let index = 0; index < THREE_FLAG_WAYPOINTS.length; index++) {
      const point = THREE_FLAG_WAYPOINTS[index];
      const tick = tickThreeFlagChallenge(run, point.x + 0.5, point.z + 0.5, 2);
      expect(tick.reached?.name).toBe(point.name);
      if (index < THREE_FLAG_WAYPOINTS.length - 1) {
        expect(tick.completed).toBe(false);
        run = tick.run!;
        expect(run.index).toBe(index + 1);
      } else {
        expect(tick.completed).toBe(true);
        expect(tick.run).toBeUndefined();
        expect(tick.elapsed).toBe(6);
      }
    }
  });

  it('keeps timing while the player has not reached the active flag', () => {
    const tick = tickThreeFlagChallenge(startThreeFlagChallenge(), 100, 100, 1.25);
    expect(tick.run).toEqual({ index: 0, elapsed: 1.25 });
    expect(tick.reached).toBeUndefined();
  });

  it('formats scorecard time consistently', () => {
    expect(formatChallengeTime(9.2)).toBe('0:09.2');
    expect(formatChallengeTime(65)).toBe('1:05.0');
  });
});
