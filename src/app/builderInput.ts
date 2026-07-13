import type { BuilderMode } from './BuilderState';

export type BuilderIntent =
  | 'toggleMode'
  | 'fill'
  | 'clear'
  | 'replace'
  | 'copy'
  | 'rotateCW'
  | 'rotateCCW'
  | 'mirror'
  | 'arrayInc'
  | 'arrayDec'
  | 'nudgeXPlus'
  | 'nudgeXMinus'
  | 'nudgeYPlus'
  | 'nudgeYMinus'
  | 'nudgeZPlus'
  | 'nudgeZMinus'
  | 'nudgeReset'
  | 'cancel'
  | 'none';

/** World-space whole-block delta for a nudge intent, or null for non-nudge intents. Pure. */
export function nudgeDelta(intent: BuilderIntent): [number, number, number] | null {
  switch (intent) {
    case 'nudgeXPlus':
      return [1, 0, 0];
    case 'nudgeXMinus':
      return [-1, 0, 0];
    case 'nudgeYPlus':
      return [0, 1, 0];
    case 'nudgeYMinus':
      return [0, -1, 0];
    case 'nudgeZPlus':
      return [0, 0, 1];
    case 'nudgeZMinus':
      return [0, 0, -1];
    default:
      return null;
  }
}

/** Maps a keyboard `code` to a builder intent given the current mode. Pure. */
export function resolveBuilderIntent(code: string, mode: BuilderMode): BuilderIntent {
  if (code === 'KeyB') return 'toggleMode';
  if (mode === 'selecting') {
    switch (code) {
      case 'KeyX':
        return 'fill';
      case 'KeyG':
        return 'clear';
      case 'KeyR':
        return 'replace';
      case 'KeyC':
        return 'copy';
      case 'Escape':
        return 'cancel';
      default:
        return 'none';
    }
  }
  if (mode === 'pasting') {
    switch (code) {
      case 'BracketLeft':
        return 'rotateCCW';
      case 'BracketRight':
        return 'rotateCW';
      // Mirror is U, not M: M is reserved for the world map in every mode.
      case 'KeyU':
        return 'mirror';
      case 'Equal':
      case 'NumpadAdd':
        return 'arrayInc';
      case 'Minus':
      case 'NumpadSubtract':
        return 'arrayDec';
      // Whole-block paste nudge: arrows move on the X/Z plane, Page keys change height.
      case 'ArrowRight':
        return 'nudgeXPlus';
      case 'ArrowLeft':
        return 'nudgeXMinus';
      case 'ArrowDown':
        return 'nudgeZPlus';
      case 'ArrowUp':
        return 'nudgeZMinus';
      case 'PageUp':
        return 'nudgeYPlus';
      case 'PageDown':
        return 'nudgeYMinus';
      case 'KeyN':
        return 'nudgeReset';
      case 'Escape':
        return 'cancel';
      default:
        return 'none';
    }
  }
  return 'none';
}

/** The horizontal axis the camera faces most strongly. */
export function dominantHorizontalAxis(forwardX: number, forwardZ: number): 'x' | 'z' {
  return Math.abs(forwardX) >= Math.abs(forwardZ) ? 'x' : 'z';
}
