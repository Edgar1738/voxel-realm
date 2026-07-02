import type { BlockId } from '../core/types';
import type { Prefab, PrefabVoxel } from '../core/Prefab';

/** Fixed pixel size for every blueprint thumbnail canvas — cards never reflow. */
export const THUMBNAIL_SIZE = 96;

/** Cap on blocks actually drawn; huge blueprints fall back to an exterior-only silhouette. */
const MAX_DRAWN_BLOCKS = 4000;

/** Isometric projection: standard 2:1 dimetric, y is screen-up. */
const ISO_X = { x: 0.866, y: 0.5 }; // contribution of world +x to screen (right, down)
const ISO_Z = { x: -0.866, y: 0.5 }; // contribution of world +z to screen (left, down)
const ISO_Y = { y: -1 }; // contribution of world +y to screen (up)

interface ProjectedVoxel {
  sx: number;
  sy: number;
  depth: number; // back-to-front paint order key
  color: string;
}

/** Projects a voxel's center to isometric screen space and a paint-order depth key. */
function project(x: number, y: number, z: number, tileSize: number): { sx: number; sy: number } {
  const sx = (x * ISO_X.x + z * ISO_Z.x) * tileSize;
  const sy = (x * ISO_X.y + z * ISO_Z.y) * tileSize + y * ISO_Y.y * tileSize;
  return { sx, sy };
}

/** True for a prefab voxel that has any of its 6 neighbors missing (i.e. visible from outside). */
function isExterior(occupied: Set<string>, x: number, y: number, z: number): boolean {
  const neighbors: Array<[number, number, number]> = [
    [x + 1, y, z],
    [x - 1, y, z],
    [x, y + 1, z],
    [x, y - 1, z],
    [x, y, z + 1],
    [x, y, z - 1],
  ];
  return neighbors.some(([nx, ny, nz]) => !occupied.has(`${nx},${ny},${nz}`));
}

/**
 * Renders a prefab as a small isometric thumbnail onto a fixed-size canvas.
 * Blocks are sorted back-to-front (by iso depth) so nearer geometry paints over farther geometry.
 * For prefabs larger than MAX_DRAWN_BLOCKS, only exterior-facing voxels are drawn (silhouette).
 *
 * @param swatchColor resolves a block id to its CSS color/gradient (reuses CreativeUi's swatches).
 */
export function renderBlueprintThumbnail(
  canvas: HTMLCanvasElement,
  prefab: Prefab,
  swatchColor: (id: BlockId) => string,
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  canvas.width = THUMBNAIL_SIZE;
  canvas.height = THUMBNAIL_SIZE;
  ctx.clearRect(0, 0, THUMBNAIL_SIZE, THUMBNAIL_SIZE);

  const { blocks, dims } = prefab;
  if (blocks.length === 0 || dims[0] <= 0 || dims[1] <= 0 || dims[2] <= 0) return;

  let drawn: ReadonlyArray<PrefabVoxel> = blocks;
  if (blocks.length > MAX_DRAWN_BLOCKS) {
    const occupied = new Set(blocks.map(([x, y, z]) => `${x},${y},${z}`));
    drawn = blocks.filter(([x, y, z]) => isExterior(occupied, x, y, z));
  }

  // Scale so the prefab's projected bounding box fits within the canvas with a small margin.
  const margin = THUMBNAIL_SIZE * 0.08;
  const available = THUMBNAIL_SIZE - margin * 2;
  const [sx0, sy0] = [0, 0];
  const corners: Array<[number, number, number]> = [
    [0, 0, 0],
    [dims[0], 0, 0],
    [0, dims[1], 0],
    [0, 0, dims[2]],
    [dims[0], dims[1], dims[2]],
    [dims[0], 0, dims[2]],
    [dims[0], dims[1], 0],
    [0, dims[1], dims[2]],
  ];
  let minSx = Infinity,
    maxSx = -Infinity,
    minSy = Infinity,
    maxSy = -Infinity;
  for (const [cx, cy, cz] of corners) {
    const { sx, sy } = project(cx, cy, cz, 1);
    minSx = Math.min(minSx, sx);
    maxSx = Math.max(maxSx, sx);
    minSy = Math.min(minSy, sy);
    maxSy = Math.max(maxSy, sy);
  }
  const spanX = Math.max(1e-6, maxSx - minSx);
  const spanY = Math.max(1e-6, maxSy - minSy);
  const tileSize = Math.min(available / spanX, available / spanY);
  void sx0;
  void sy0;

  const projected: ProjectedVoxel[] = drawn.map(([x, y, z, id]) => {
    const { sx, sy } = project(x + 0.5, y + 0.5, z + 0.5, tileSize);
    return { sx, sy, depth: x + z + y * 0.001, color: swatchColor(id) };
  });
  // Sort back-to-front: larger x+z (farther along the iso "away" axes) paints first,
  // so nearer voxels correctly occlude farther ones.
  projected.sort((a, b) => a.depth - b.depth);

  const offsetX = THUMBNAIL_SIZE / 2 - ((minSx + maxSx) / 2) * tileSize;
  const offsetY = THUMBNAIL_SIZE / 2 - ((minSy + maxSy) / 2) * tileSize;
  const half = tileSize * 0.62; // slight overlap hides seams between adjacent voxel diamonds

  for (const v of projected) {
    const cx = v.sx + offsetX;
    const cy = v.sy + offsetY;
    ctx.fillStyle = v.color;
    ctx.beginPath();
    ctx.moveTo(cx, cy - half);
    ctx.lineTo(cx + half, cy);
    ctx.lineTo(cx, cy + half);
    ctx.lineTo(cx - half, cy);
    ctx.closePath();
    ctx.fill();
  }
}
