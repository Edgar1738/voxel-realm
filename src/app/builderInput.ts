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
  | 'cancel'
  | 'none';

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
      case 'KeyM':
        return 'mirror';
      case 'Equal':
      case 'NumpadAdd':
        return 'arrayInc';
      case 'Minus':
      case 'NumpadSubtract':
        return 'arrayDec';
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
