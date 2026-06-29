import { describe, it, expect } from 'vitest';
import { TILE, paintLayer } from '../src/blocks/textures';

function layerAlpha(spec: Parameters<typeof paintLayer>[2]): number[] {
  const data = new Uint8Array(TILE * TILE * 4);
  paintLayer(data, 0, spec);
  const a: number[] = [];
  for (let i = 0; i < TILE * TILE; i++) a.push(data[i * 4 + 3]);
  return a;
}

describe('alpha-capable textures', () => {
  it('opaque patterns stay fully opaque (alpha 255 everywhere)', () => {
    const a = layerAlpha({ pattern: 'stone', colors: [[128, 128, 132]] });
    expect(a.every((v) => v === 255)).toBe(true);
  });
  it('plant patterns have both transparent and opaque pixels', () => {
    const a = layerAlpha({ pattern: 'tallGrass', colors: [[60, 140, 60]] });
    expect(a.some((v) => v === 0)).toBe(true); // transparent background
    expect(a.some((v) => v === 255)).toBe(true); // opaque blades
  });
  it('flower pattern likewise has a transparent background', () => {
    const a = layerAlpha({
      pattern: 'flower',
      colors: [
        [60, 140, 60],
        [220, 70, 90],
      ],
    });
    expect(a.some((v) => v === 0)).toBe(true);
    expect(a.some((v) => v === 255)).toBe(true);
  });
});
