import { describe, it, expect } from 'vitest';
import { AVATAR_TILE, paintAvatarTile, styleForSlot } from '../src/character/AvatarTextures';

const paint = (color: number, style: 'fabric' | 'leather' | 'metal' | 'plain'): Uint8Array => {
  const out = new Uint8Array(AVATAR_TILE * AVATAR_TILE * 4);
  paintAvatarTile(out, color, style);
  return out;
};

const spread = (data: Uint8Array): number => {
  let min = 255,
    max = 0;
  for (let i = 0; i < data.length; i += 4) {
    min = Math.min(min, data[i]);
    max = Math.max(max, data[i]);
  }
  return max - min;
};

describe('avatar textures', () => {
  it('is deterministic for the same color and style', () => {
    expect(paint(0x3e7c59, 'fabric')).toEqual(paint(0x3e7c59, 'fabric'));
  });

  it('textured styles vary around the base color; plain stays flat', () => {
    for (const style of ['fabric', 'leather', 'metal'] as const) {
      expect(spread(paint(0x3e7c59, style))).toBeGreaterThan(4);
    }
    expect(spread(paint(0x3e7c59, 'plain'))).toBe(0);
  });

  it('keeps near-black palettes near-black (Shadow Wanderer silhouette)', () => {
    for (const style of ['fabric', 'leather', 'metal'] as const) {
      const data = paint(0x0a0a0f, style);
      for (let i = 0; i < data.length; i += 4) {
        expect(data[i]).toBeLessThan(0x14);
        expect(data[i + 1]).toBeLessThan(0x14);
        expect(data[i + 2]).toBeLessThan(0x14);
      }
    }
  });

  it('fills every pixel fully opaque', () => {
    const data = paint(0xc9a45c, 'leather');
    for (let i = 3; i < data.length; i += 4) expect(data[i]).toBe(255);
  });

  it('maps cloth slots to fabric, gear to leather/metal, and faces to plain', () => {
    expect(styleForSlot('tunic')).toBe('fabric');
    expect(styleForSlot('boots')).toBe('leather');
    expect(styleForSlot('metal')).toBe('metal');
    expect(styleForSlot('trim')).toBe('metal');
    for (const slot of ['skin', 'hair', 'eye', 'pupil']) expect(styleForSlot(slot)).toBe('plain');
  });
});
