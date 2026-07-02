import { describe, it, expect, vi } from 'vitest';
import { renderBlueprintThumbnail, THUMBNAIL_SIZE } from '../src/app/blueprintThumbnail';
import type { Prefab } from '../src/core/Prefab';

/** Minimal fake 2D context capturing fill calls, since jsdom has no canvas backend. */
function fakeCanvas(): { canvas: HTMLCanvasElement; state: { fillCalls: number } } {
  const state = { fillCalls: 0 };
  const ctx = {
    clearRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    closePath: vi.fn(),
    fill: vi.fn(() => {
      state.fillCalls++;
    }),
    fillStyle: '',
  };
  const canvas = {
    width: 0,
    height: 0,
    getContext: vi.fn(() => ctx),
  } as unknown as HTMLCanvasElement;
  return { canvas, state };
}

const swatch = (): string => '#abcabc';

describe('renderBlueprintThumbnail', () => {
  it('sets a fixed canvas size regardless of prefab dimensions', () => {
    const { canvas } = fakeCanvas();
    const prefab: Prefab = { dims: [3, 3, 3], blocks: [[0, 0, 0, 1]] };
    renderBlueprintThumbnail(canvas, prefab, swatch);
    expect(canvas.width).toBe(THUMBNAIL_SIZE);
    expect(canvas.height).toBe(THUMBNAIL_SIZE);
  });

  it('draws one diamond per block for a small prefab', () => {
    const { canvas, state } = fakeCanvas();
    const prefab: Prefab = {
      dims: [2, 1, 2],
      blocks: [
        [0, 0, 0, 1],
        [1, 0, 0, 1],
        [0, 0, 1, 1],
        [1, 0, 1, 1],
      ],
    };
    renderBlueprintThumbnail(canvas, prefab, swatch);
    expect(state.fillCalls).toBe(4);
  });

  it('does nothing for an empty prefab (no blocks)', () => {
    const { canvas, state } = fakeCanvas();
    const prefab: Prefab = { dims: [1, 1, 1], blocks: [] };
    renderBlueprintThumbnail(canvas, prefab, swatch);
    expect(state.fillCalls).toBe(0);
  });

  it('falls back to an exterior-only silhouette for huge prefabs (still draws something)', () => {
    const { canvas, state } = fakeCanvas();
    // A solid 20x20x20 cube (8000 blocks) exceeds the drawn-block cap, so only the
    // exterior-facing shell should be drawn — fewer fills than total blocks, but > 0.
    const blocks: Prefab['blocks'] = [];
    for (let x = 0; x < 20; x++)
      for (let y = 0; y < 20; y++) for (let z = 0; z < 20; z++) blocks.push([x, y, z, 1]);
    const prefab: Prefab = { dims: [20, 20, 20], blocks };
    renderBlueprintThumbnail(canvas, prefab, swatch);
    expect(state.fillCalls).toBeGreaterThan(0);
    expect(state.fillCalls).toBeLessThan(blocks.length);
  });

  it('does nothing when the canvas has no 2D context available', () => {
    const canvas = { width: 0, height: 0, getContext: vi.fn(() => null) } as unknown as HTMLCanvasElement;
    const prefab: Prefab = { dims: [1, 1, 1], blocks: [[0, 0, 0, 1]] };
    expect(() => renderBlueprintThumbnail(canvas, prefab, swatch)).not.toThrow();
  });
});
