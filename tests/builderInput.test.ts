import { describe, it, expect } from 'vitest';
import { resolveBuilderIntent, dominantHorizontalAxis, nudgeDelta } from '../src/app/builderInput';

describe('resolveBuilderIntent', () => {
  it('KeyB always toggles mode', () => {
    expect(resolveBuilderIntent('KeyB', 'off')).toBe('toggleMode');
    expect(resolveBuilderIntent('KeyB', 'selecting')).toBe('toggleMode');
    expect(resolveBuilderIntent('KeyB', 'pasting')).toBe('toggleMode');
  });

  it('off mode ignores every key except KeyB', () => {
    for (const code of ['KeyX', 'KeyG', 'KeyR', 'KeyC', 'BracketLeft', 'Escape']) {
      expect(resolveBuilderIntent(code, 'off')).toBe('none');
    }
  });

  it('selecting mode maps fill/clear/replace/copy and cancel', () => {
    expect(resolveBuilderIntent('KeyX', 'selecting')).toBe('fill');
    expect(resolveBuilderIntent('KeyG', 'selecting')).toBe('clear');
    expect(resolveBuilderIntent('KeyR', 'selecting')).toBe('replace');
    expect(resolveBuilderIntent('KeyC', 'selecting')).toBe('copy');
    expect(resolveBuilderIntent('Escape', 'selecting')).toBe('cancel');
    expect(resolveBuilderIntent('BracketLeft', 'selecting')).toBe('none');
    // F is reserved for fly (CameraRig), never bound to a builder intent.
    expect(resolveBuilderIntent('KeyF', 'selecting')).toBe('none');
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
    expect(resolveBuilderIntent('KeyX', 'pasting')).toBe('none');
  });

  it('pasting mode maps the paste-nudge keys (arrows/Page/N)', () => {
    expect(resolveBuilderIntent('ArrowRight', 'pasting')).toBe('nudgeXPlus');
    expect(resolveBuilderIntent('ArrowLeft', 'pasting')).toBe('nudgeXMinus');
    expect(resolveBuilderIntent('ArrowDown', 'pasting')).toBe('nudgeZPlus');
    expect(resolveBuilderIntent('ArrowUp', 'pasting')).toBe('nudgeZMinus');
    expect(resolveBuilderIntent('PageUp', 'pasting')).toBe('nudgeYPlus');
    expect(resolveBuilderIntent('PageDown', 'pasting')).toBe('nudgeYMinus');
    expect(resolveBuilderIntent('KeyN', 'pasting')).toBe('nudgeReset');
  });

  it('nudge keys are inert outside paste mode', () => {
    for (const code of ['ArrowRight', 'ArrowUp', 'PageUp', 'KeyN']) {
      expect(resolveBuilderIntent(code, 'selecting')).toBe('none');
      expect(resolveBuilderIntent(code, 'off')).toBe('none');
    }
  });
});

describe('nudgeDelta', () => {
  it('maps nudge intents to unit world deltas and everything else to null', () => {
    expect(nudgeDelta('nudgeXPlus')).toEqual([1, 0, 0]);
    expect(nudgeDelta('nudgeXMinus')).toEqual([-1, 0, 0]);
    expect(nudgeDelta('nudgeYPlus')).toEqual([0, 1, 0]);
    expect(nudgeDelta('nudgeYMinus')).toEqual([0, -1, 0]);
    expect(nudgeDelta('nudgeZPlus')).toEqual([0, 0, 1]);
    expect(nudgeDelta('nudgeZMinus')).toEqual([0, 0, -1]);
    expect(nudgeDelta('nudgeReset')).toBeNull();
    expect(nudgeDelta('rotateCW')).toBeNull();
  });
});

describe('dominantHorizontalAxis', () => {
  it('picks x when |forwardX| >= |forwardZ|, else z', () => {
    expect(dominantHorizontalAxis(0.9, 0.1)).toBe('x');
    expect(dominantHorizontalAxis(-0.9, 0.1)).toBe('x');
    expect(dominantHorizontalAxis(0.1, 0.9)).toBe('z');
  });
});
