import { describe, it, expect } from 'vitest';
import { facingFromYaw, packState } from '../src/world/VoxelState';

/** Pure helper the place path uses: a stair's state from the player's yaw. */
import { stairStateFromYaw } from '../src/app/placement';

describe('stairStateFromYaw', () => {
  it('packs facing from yaw with bottom half', () => {
    for (const yaw of [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2]) {
      expect(stairStateFromYaw(yaw)).toBe(packState(facingFromYaw(yaw), 0));
    }
  });
});
