import { BLOCK_TEXTURES, Face, type Shape } from '../blocks/blocks';
import { TILE, paintLayer } from '../blocks/textures';
import type { BlockId } from '../core/types';

/** Internal canvas resolution for block icons; CSS scales it, pixelated. */
export const BLOCK_ICON_SIZE = 96;

/** Half-width of the iso cube in icon pixels; total icon is ~1.73*S wide and 2*S tall. */
const S = 44;
const ISO_X = 0.866; // cos(30°)

/** Lazily painted 16x16 face-texture canvases, one per texture-array layer. */
const faceCanvasCache = new Map<number, HTMLCanvasElement>();

function faceCanvas(layer: number): HTMLCanvasElement | null {
  const cached = faceCanvasCache.get(layer);
  if (cached) return cached;
  const spec = BLOCK_TEXTURES.uniqueSpecs[layer];
  if (!spec) return null;
  const pixels = new Uint8Array(TILE * TILE * 4);
  paintLayer(pixels, 0, spec);
  const canvas = document.createElement('canvas');
  canvas.width = TILE;
  canvas.height = TILE;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.putImageData(new ImageData(new Uint8ClampedArray(pixels), TILE, TILE), 0, 0);
  faceCanvasCache.set(layer, canvas);
  return canvas;
}

/** Draws one cube face: the texture under the current transform, then a shade overlay. */
function drawFace(
  ctx: CanvasRenderingContext2D,
  tex: HTMLCanvasElement,
  shade: number,
  srcY = 0,
  srcH = TILE,
): void {
  ctx.drawImage(tex, 0, srcY, TILE, srcH, 0, 0, 1, 1);
  if (shade > 0) {
    ctx.fillStyle = `rgba(0, 0, 0, ${shade})`;
    ctx.fillRect(0, 0, 1, 1);
  }
}

/**
 * Renders a block as a Minecraft-style inventory icon onto `canvas`: an isometric cube
 * showing the block's real top + side textures (top lit, sides progressively shaded).
 * Cross-shaped blocks (flowers, tall grass) draw their sprite flat instead. Slabs draw
 * as a half-height cube. Blocks without textures fall back to a flat `fallbackColor` fill.
 */
export function renderBlockIcon(
  canvas: HTMLCanvasElement,
  id: BlockId,
  shape: Shape,
  fallbackColor: string,
): void {
  canvas.width = BLOCK_ICON_SIZE;
  canvas.height = BLOCK_ICON_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, BLOCK_ICON_SIZE, BLOCK_ICON_SIZE);

  const layers = BLOCK_TEXTURES.faceLayers.get(id);
  const top = layers ? faceCanvas(layers[Face.PosY]) : null;
  const left = layers ? faceCanvas(layers[Face.PosZ]) : null;
  const right = layers ? faceCanvas(layers[Face.PosX]) : null;
  if (!layers || !top || !left || !right) {
    ctx.fillStyle = fallbackColor;
    ctx.fillRect(8, 8, BLOCK_ICON_SIZE - 16, BLOCK_ICON_SIZE - 16);
    return;
  }

  if (shape === 'cross') {
    // Flat sprite, Minecraft-style: the texture itself is the icon.
    const pad = 6;
    ctx.drawImage(right, pad, pad, BLOCK_ICON_SIZE - pad * 2, BLOCK_ICON_SIZE - pad * 2);
    return;
  }

  // Half-height for slabs; every other shape reads fine as a full cube icon.
  const h = shape === 'slab' ? 0.5 : 1;
  const cx = BLOCK_ICON_SIZE / 2;
  const y0 = (BLOCK_ICON_SIZE - 2 * S) / 2 + (1 - h) * S; // top vertex, sunk for slabs
  const sideH = h * S;
  const srcY = (1 - h) * TILE; // slabs show the bottom half of the side texture
  const srcH = h * TILE;

  // Top face: rhombus from the top vertex; x-axis to the right vertex, y-axis to the left.
  ctx.setTransform(ISO_X * S, 0.5 * S, -ISO_X * S, 0.5 * S, cx, y0);
  drawFace(ctx, top, 0);
  // Front-left face, lightly shaded.
  ctx.setTransform(ISO_X * S, 0.5 * S, 0, sideH, cx - ISO_X * S, y0 + 0.5 * S);
  drawFace(ctx, left, 0.22, srcY, srcH);
  // Front-right face, darkest.
  ctx.setTransform(ISO_X * S, -0.5 * S, 0, sideH, cx, y0 + S);
  drawFace(ctx, right, 0.42, srcY, srcH);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}
