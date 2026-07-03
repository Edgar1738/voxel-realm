import { describe, it, expect, beforeEach } from 'vitest';
import {
  canEdit,
  editMessage,
  toolLabel,
  TOOLS,
  hotbarWheelDelta,
  clampReach,
  reachWheelDelta,
  loadReach,
  saveReach,
  getReach,
  setReach,
  DEFAULT_REACH,
  MIN_REACH,
  MAX_REACH,
  REACH_STEP,
  voxelIntersectsPlayer,
  type ReachStorage,
} from '../src/app/input';

describe('voxelIntersectsPlayer', () => {
  const HALF = { x: 0.3, y: 0.9, z: 0.3 };
  // Player centered mid-voxel at (8.5, 64, 8.5): body spans y 63.1..64.9, x/z 8.2..8.8.
  const center = { x: 8.5, y: 64, z: 8.5 };

  it('refuses the voxels overlapping the body column', () => {
    expect(voxelIntersectsPlayer(8, 63, 8, center, HALF)).toBe(true); // feet
    expect(voxelIntersectsPlayer(8, 64, 8, center, HALF)).toBe(true); // head
  });

  it('allows voxels beside, above, and below the player', () => {
    expect(voxelIntersectsPlayer(9, 63, 8, center, HALF)).toBe(false); // beside (x 9..10 vs 8.2..8.8)
    expect(voxelIntersectsPlayer(8, 65, 8, center, HALF)).toBe(false); // above head (y 65..66 vs ..64.9)
    expect(voxelIntersectsPlayer(8, 62, 8, center, HALF)).toBe(false); // below feet (y 62..63 vs 63.1..)
  });

  it('treats exact face contact as non-intersecting', () => {
    // Player at x-center 8.0 spans x 7.7..8.3; voxel 7 spans 7..8 → overlaps. Voxel at
    // x 8.3 boundary: center 8.3 - 0.3 = 8.0 exactly → voxel 7..8 touches, not overlaps.
    expect(voxelIntersectsPlayer(7, 63, 8, { x: 8.3, y: 64, z: 8.5 }, HALF)).toBe(false);
  });
});

describe('editMessage', () => {
  it('returns "Undid" for a successful undo', () => {
    expect(editMessage('undo', 'ok')).toBe('Undid');
  });

  it('returns "Redid" for a successful redo', () => {
    expect(editMessage('redo', 'ok')).toBe('Redid');
  });

  it('returns a blocked message for undo', () => {
    expect(editMessage('undo', 'blocked')).toBe("Can't undo here — return to that area");
  });

  it('returns a blocked message for redo', () => {
    expect(editMessage('redo', 'blocked')).toBe("Can't redo here — return to that area");
  });

  it('returns "Nothing to undo" when stack is empty', () => {
    expect(editMessage('undo', 'empty')).toBe('Nothing to undo');
  });

  it('returns "Nothing to redo" when stack is empty', () => {
    expect(editMessage('redo', 'empty')).toBe('Nothing to redo');
  });
});

describe('toolLabel', () => {
  it('capitalises single-word tools', () => {
    expect(toolLabel('single')).toBe('Single');
    expect(toolLabel('fill')).toBe('Fill');
  });

  it('capitalises hyphenated tools', () => {
    expect(toolLabel('box-clear')).toBe('Box Clear');
  });

  it('covers all entries in TOOLS', () => {
    const labels = TOOLS.map(toolLabel);
    expect(labels).toEqual(['Single', 'Tunnel', 'Sphere', 'Box Clear', 'Fill', 'Replace']);
  });

  it('does not throw on a malformed tool string with an empty hyphen-split segment', () => {
    expect(() => toolLabel('-fill')).not.toThrow();
    expect(toolLabel('-fill')).toBe(' Fill');
    expect(() => toolLabel('box--clear')).not.toThrow();
    expect(toolLabel('box--clear')).toBe('Box  Clear');
    expect(toolLabel('')).toBe('');
  });
});

describe('canEdit', () => {
  it('allows edits when pointer is locked and the inventory is closed', () => {
    expect(canEdit(true, false)).toBe(true);
  });

  it('blocks edits when the pointer is not locked', () => {
    expect(canEdit(false, false)).toBe(false);
  });

  it('blocks edits when the inventory is open even if the pointer is locked', () => {
    expect(canEdit(true, true)).toBe(false);
  });

  it('blocks edits when neither locked nor inventory-closed', () => {
    expect(canEdit(false, true)).toBe(false);
  });
});

describe('hotbarWheelDelta', () => {
  it('returns 0 when editing is blocked (pointer unlocked or inventory open)', () => {
    expect(hotbarWheelDelta(120, false)).toBe(0);
    expect(hotbarWheelDelta(-120, false)).toBe(0);
  });

  it('maps positive deltaY to +1 and negative to -1 when editing is allowed', () => {
    expect(hotbarWheelDelta(120, true)).toBe(1);
    expect(hotbarWheelDelta(-120, true)).toBe(-1);
  });

  it('returns 0 for zero delta', () => {
    expect(hotbarWheelDelta(0, true)).toBe(0);
  });
});

describe('clampReach', () => {
  it('clamps to MIN_REACH..MAX_REACH', () => {
    expect(clampReach(0)).toBe(MIN_REACH);
    expect(clampReach(1000)).toBe(MAX_REACH);
  });

  it('snaps to the step grid from MIN_REACH', () => {
    expect(clampReach(4.9)).toBe(4);
    expect(clampReach(7)).toBe(8);
    expect(clampReach(6)).toBe(6);
  });

  it('keeps the default reach unchanged', () => {
    expect(clampReach(DEFAULT_REACH)).toBe(DEFAULT_REACH);
  });
});

describe('reachWheelDelta', () => {
  it('scrolling down (positive deltaY) decreases reach by one step', () => {
    expect(reachWheelDelta(120)).toBe(-REACH_STEP);
  });

  it('scrolling up (negative deltaY) increases reach by one step', () => {
    expect(reachWheelDelta(-120)).toBe(REACH_STEP);
  });

  it('returns 0 for zero delta', () => {
    expect(reachWheelDelta(0)).toBe(0);
  });
});

function fakeStorage(initial: Record<string, string> = {}): ReachStorage {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (key) => (map.has(key) ? map.get(key)! : null),
    setItem: (key, value) => {
      map.set(key, value);
    },
  };
}

describe('loadReach / saveReach', () => {
  it('returns DEFAULT_REACH when nothing is stored', () => {
    expect(loadReach(fakeStorage())).toBe(DEFAULT_REACH);
  });

  it('returns DEFAULT_REACH for invalid stored values', () => {
    expect(loadReach(fakeStorage({ 'vr.buildReach': 'not-a-number' }))).toBe(DEFAULT_REACH);
  });

  it('round-trips a saved value through clamping', () => {
    const storage = fakeStorage();
    saveReach(storage, 14);
    expect(loadReach(storage)).toBe(14);
  });

  it('clamps an out-of-range stored value on load', () => {
    expect(loadReach(fakeStorage({ 'vr.buildReach': '999' }))).toBe(MAX_REACH);
  });
});

describe('getReach / setReach', () => {
  beforeEach(() => {
    setReach(DEFAULT_REACH);
  });

  it('defaults to DEFAULT_REACH', () => {
    expect(getReach()).toBe(DEFAULT_REACH);
  });

  it('setReach clamps and getReach reflects the new value', () => {
    setReach(20);
    expect(getReach()).toBe(20);
    setReach(1);
    expect(getReach()).toBe(MIN_REACH);
    setReach(1000);
    expect(getReach()).toBe(MAX_REACH);
  });
});
