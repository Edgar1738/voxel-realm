import { describe, it, expect } from 'vitest';
import { canEdit, editMessage, toolLabel, TOOLS, hotbarWheelDelta } from '../src/app/input';

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
