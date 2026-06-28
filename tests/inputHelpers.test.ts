import { describe, it, expect } from 'vitest';
import { editMessage, toolLabel, TOOLS } from '../src/app/input';

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
