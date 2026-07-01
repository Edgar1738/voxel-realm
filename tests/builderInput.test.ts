import { describe, it, expect } from 'vitest';
import { resolveBuilderIntent, dominantHorizontalAxis } from '../src/app/builderInput';

describe('resolveBuilderIntent', () => {
  it('KeyB always toggles mode', () => {
    expect(resolveBuilderIntent('KeyB', 'off')).toBe('toggleMode');
    expect(resolveBuilderIntent('KeyB', 'selecting')).toBe('toggleMode');
    expect(resolveBuilderIntent('KeyB', 'pasting')).toBe('toggleMode');
  });

  it('off mode ignores every key except KeyB', () => {
    for (const code of ['KeyF', 'KeyG', 'KeyR', 'KeyC', 'BracketLeft', 'Escape']) {
      expect(resolveBuilderIntent(code, 'off')).toBe('none');
    }
  });

  it('selecting mode maps fill/clear/replace/copy and cancel', () => {
    expect(resolveBuilderIntent('KeyF', 'selecting')).toBe('fill');
    expect(resolveBuilderIntent('KeyG', 'selecting')).toBe('clear');
    expect(resolveBuilderIntent('KeyR', 'selecting')).toBe('replace');
    expect(resolveBuilderIntent('KeyC', 'selecting')).toBe('copy');
    expect(resolveBuilderIntent('Escape', 'selecting')).toBe('cancel');
    expect(resolveBuilderIntent('BracketLeft', 'selecting')).toBe('none');
  });

  it('pasting mode maps rotate/mirror/array and cancel; ignores selecting-only keys', () => {
    expect(resolveBuilderIntent('BracketLeft', 'pasting')).toBe('rotateCCW');
    expect(resolveBuilderIntent('BracketRight', 'pasting')).toBe('rotateCW');
    expect(resolveBuilderIntent('KeyM', 'pasting')).toBe('mirror');
    expect(resolveBuilderIntent('Equal', 'pasting')).toBe('arrayInc');
    expect(resolveBuilderIntent('NumpadAdd', 'pasting')).toBe('arrayInc');
    expect(resolveBuilderIntent('Minus', 'pasting')).toBe('arrayDec');
    expect(resolveBuilderIntent('NumpadSubtract', 'pasting')).toBe('arrayDec');
    expect(resolveBuilderIntent('Escape', 'pasting')).toBe('cancel');
    expect(resolveBuilderIntent('KeyF', 'pasting')).toBe('none');
  });
});

describe('dominantHorizontalAxis', () => {
  it('picks x when |forwardX| >= |forwardZ|, else z', () => {
    expect(dominantHorizontalAxis(0.9, 0.1)).toBe('x');
    expect(dominantHorizontalAxis(-0.9, 0.1)).toBe('x');
    expect(dominantHorizontalAxis(0.1, 0.9)).toBe('z');
  });
});
