import { CHUNK_SIZE_X, CHUNK_SIZE_Z, WORLD_HEIGHT } from '../core/constants';
import { Face } from '../blocks/blocks';
import { vertexAO, aoBrightness } from './Ao';
import type { BlockRegistry } from '../blocks/BlockRegistry';
import type { VoxelView } from '../world/VoxelView';
import type { MeshData } from './MeshTypes';
import type { MeshPass } from './MeshPass';
import { TINT_PALETTE, tintIndexFor, WHITE, type RGB } from './Tint';

/** Encodes four AO levels (each 0..3) into 8 bits: level[i] occupies bits 2i+1..2i. */
function packAoLevels(l0: number, l1: number, l2: number, l3: number): number {
  return (l0 << 6) | (l1 << 4) | (l2 << 2) | l3;
}

const DIMS = [CHUNK_SIZE_X, WORLD_HEIGHT, CHUNK_SIZE_Z];

/** Maps (axis, sign) to the Face enum used for texture-layer lookup. */
function faceFor(axis: number, sign: number): Face {
  if (axis === 0) return sign > 0 ? Face.PosX : Face.NegX;
  if (axis === 1) return sign > 0 ? Face.PosY : Face.NegY;
  return sign > 0 ? Face.PosZ : Face.NegZ;
}

interface MaskCell {
  layer: number;
  /** AO brightness per corner, order (0,0) (1,0) (1,1) (0,1) in (u,v). */
  ao: [number, number, number, number];
  /** Packed face light: skyLevel*16 + blockLevel (sampled at the air-side voxel). */
  light: number;
  /**
   * Integer merge key packed as:
   *   bits 31-24  tintIndex   (8 bits, 0 = white/untinted)
   *   bits 23-16  layer       (8 bits, 0..255)
   *   bits 15-14  ao[0]       (2 bits, AO level index 0..3)
   *   bits 13-12  ao[1]       (2 bits)
   *   bits 11-10  ao[2]       (2 bits)
   *   bits  9-8   ao[3]       (2 bits)
   *   bits  7-0   light       (8 bits, sky*16+block, 0..255)
   */
  key: number;
  /** Biome-tint RGB multiplier for this face (white = untinted). */
  tint: RGB;
}

interface Buffers {
  positions: number[];
  normals: number[];
  uvs: number[];
  layers: number[];
  ao: number[];
  light: number[];
  tint: number[];
  indices: number[];
  vertCount: number;
}

/**
 * Maximum cells in any single meshing slice.
 * The largest slice occurs on the X or Z axis (du=WORLD_HEIGHT, dv=16 or vice-versa):
 *   max(CHUNK_SIZE_X, CHUNK_SIZE_Z) * WORLD_HEIGHT
 */
const MAX_SLICE_CELLS = Math.max(CHUNK_SIZE_X, CHUNK_SIZE_Z) * WORLD_HEIGHT;

/**
 * Greedy mesher: for each of the 6 face directions, sweeps voxel slices, builds a 2D
 * mask of exposed faces (with per-corner AO), and merges equal cells into rectangles.
 * Reads neighbors through VoxelView so chunk-border faces cull correctly (missing
 * neighbor => air => border face emitted). AO is baked into a per-vertex brightness.
 */
export class GreedyMesher {
  // Pre-allocated scratch buffers reused across every inner-loop call; never
  // allocated inside the du*dv*dd loops to avoid GC pressure during chunk rebuilds.
  private readonly _solid: [number, number, number] = [0, 0, 0];
  private readonly _neighbor: [number, number, number] = [0, 0, 0];
  private readonly _air: [number, number, number] = [0, 0, 0];
  private readonly _sample: [number, number, number] = [0, 0, 0];

  // Pooled slice scratch buffers: sized once to the largest possible slice and
  // cleared in-place between slices (no per-slice allocation / GC pressure).
  private readonly _mask: (MaskCell | null)[] = new Array(MAX_SLICE_CELLS).fill(null);
  private readonly _visited: Uint8Array = new Uint8Array(MAX_SLICE_CELLS);

  constructor(private readonly registry: BlockRegistry) {}

  mesh(view: VoxelView, pass: MeshPass): MeshData {
    const buf: Buffers = {
      positions: [],
      normals: [],
      uvs: [],
      layers: [],
      ao: [],
      light: [],
      tint: [],
      indices: [],
      vertCount: 0,
    };

    for (let axis = 0; axis < 3; axis++) {
      const u = (axis + 1) % 3;
      const v = (axis + 2) % 3;
      this.meshDirection(view, axis, u, v, 1, pass, buf);
      this.meshDirection(view, axis, u, v, -1, pass, buf);
    }

    return {
      positions: new Float32Array(buf.positions),
      normals: new Float32Array(buf.normals),
      uvs: new Float32Array(buf.uvs),
      layers: new Float32Array(buf.layers),
      ao: new Float32Array(buf.ao),
      light: new Float32Array(buf.light),
      tint: new Float32Array(buf.tint),
      indices: new Uint32Array(buf.indices),
    };
  }

  private opaqueAt(view: VoxelView, c: readonly [number, number, number]): boolean {
    return this.registry.isOpaque(view.get(c[0], c[1], c[2]));
  }

  /**
   * AO brightness for the 4 corners of a face, sampled on the air side of the solid
   * voxel. Also writes the raw AO levels (0..3) into `outLevels` for key packing.
   * Uses pre-allocated scratch arrays — must not be called concurrently.
   */
  private cornerAO(
    view: VoxelView,
    solid: readonly [number, number, number],
    axis: number,
    sign: number,
    u: number,
    v: number,
    outLevels: [number, number, number, number],
  ): [number, number, number, number] {
    // air = solid shifted one step in the face direction (no allocation).
    this._air[0] = solid[0];
    this._air[1] = solid[1];
    this._air[2] = solid[2];
    this._air[axis] += sign;

    const sampleAt = (du: number, dv: number): number => {
      this._sample[0] = this._air[0];
      this._sample[1] = this._air[1];
      this._sample[2] = this._air[2];
      this._sample[u] += du;
      this._sample[v] += dv;
      return this.opaqueAt(view, this._sample) ? 1 : 0;
    };

    const cornerLevel = (i: number, j: number): number => {
      const su = i === 1 ? 1 : -1;
      const sv = j === 1 ? 1 : -1;
      const side1 = sampleAt(su, 0);
      const side2 = sampleAt(0, sv);
      const corner = sampleAt(su, sv);
      return vertexAO(side1, side2, corner);
    };

    outLevels[0] = cornerLevel(0, 0);
    outLevels[1] = cornerLevel(1, 0);
    outLevels[2] = cornerLevel(1, 1);
    outLevels[3] = cornerLevel(0, 1);
    return [
      aoBrightness(outLevels[0]),
      aoBrightness(outLevels[1]),
      aoBrightness(outLevels[2]),
      aoBrightness(outLevels[3]),
    ];
  }

  private meshDirection(
    view: VoxelView,
    axis: number,
    u: number,
    v: number,
    sign: number,
    pass: MeshPass,
    buf: Buffers,
  ): void {
    const du = DIMS[u];
    const dv = DIMS[v];
    const dd = DIMS[axis];

    // Scratch for AO levels; reused each cell to avoid per-cell allocation.
    const aoLevels: [number, number, number, number] = [0, 0, 0, 0];

    for (let i = 0; i < dd; i++) {
      // Reuse the pooled mask buffer — clear only the cells we will write.
      const sliceSize = du * dv;
      this._mask.fill(null, 0, sliceSize);
      const mask = this._mask;

      for (let b = 0; b < dv; b++) {
        for (let a = 0; a < du; a++) {
          // Write into pre-allocated scratch arrays instead of spreading new arrays.
          this._solid[axis] = i;
          this._solid[u] = a;
          this._solid[v] = b;

          const id = view.get(this._solid[0], this._solid[1], this._solid[2]);
          if (!pass.includes(id)) continue;

          this._neighbor[0] = this._solid[0];
          this._neighbor[1] = this._solid[1];
          this._neighbor[2] = this._solid[2];
          this._neighbor[axis] += sign;
          const neighborId = view.get(this._neighbor[0], this._neighbor[1], this._neighbor[2]);
          if (!pass.faceVisible(id, neighborId)) continue; // face hidden

          const layer = this.registry.faceLayer(id, faceFor(axis, sign));
          const ao = this.cornerAO(view, this._solid, axis, sign, u, v, aoLevels);
          const sky = view.skyLight(this._neighbor[0], this._neighbor[1], this._neighbor[2]);
          const block = view.blockLight(this._neighbor[0], this._neighbor[1], this._neighbor[2]);
          const light = sky * 16 + block;

          const category = this.registry.tintCategory(id, faceFor(axis, sign));
          const tintIndex = category
            ? tintIndexFor(view.biomeAt(this._solid[0], this._solid[2]), category)
            : 0;
          const tint = TINT_PALETTE[tintIndex] ?? WHITE;

          // Integer merge key (no string allocation):
          //   bits 31-24  tintIndex  (8 bits, 0 = untinted → key unchanged vs. pre-tint)
          //   bits 23-16  layer      (8 bits)
          //   bits 15-8   ao         (4×2 bits packed by packAoLevels)
          //   bits  7-0   light      (8 bits)
          const key =
            (tintIndex << 24) |
            (layer << 16) |
            (packAoLevels(aoLevels[0], aoLevels[1], aoLevels[2], aoLevels[3]) << 8) |
            light;
          mask[a + b * du] = { layer, ao, light, key, tint };
        }
      }

      this.emitMask(mask, du, dv, axis, u, v, sign, i, buf);
    }
  }

  private emitMask(
    mask: (MaskCell | null)[],
    du: number,
    dv: number,
    axis: number,
    u: number,
    v: number,
    sign: number,
    i: number,
    buf: Buffers,
  ): void {
    // Reuse the pooled visited buffer — zero only the cells we will inspect.
    const sliceSize = du * dv;
    this._visited.fill(0, 0, sliceSize);
    const visited = this._visited;

    for (let b = 0; b < dv; b++) {
      for (let a = 0; a < du; a++) {
        const idx = a + b * du;
        const cell = mask[idx];
        if (!cell || visited[idx]) continue;

        // Extend width along u.
        let w = 1;
        while (a + w < du) {
          const c2 = mask[a + w + b * du];
          if (!c2 || visited[a + w + b * du] || c2.key !== cell.key) break;
          w++;
        }

        // Extend height along v.
        let h = 1;
        let stop = false;
        while (b + h < dv && !stop) {
          for (let k = 0; k < w; k++) {
            const c2 = mask[a + k + (b + h) * du];
            if (!c2 || visited[a + k + (b + h) * du] || c2.key !== cell.key) {
              stop = true;
              break;
            }
          }
          if (!stop) h++;
        }

        for (let bb = 0; bb < h; bb++)
          for (let aa = 0; aa < w; aa++) visited[a + aa + (b + bb) * du] = 1;

        this.emitQuad(buf, axis, u, v, sign, i, a, b, w, h, cell);
      }
    }
  }

  private emitQuad(
    buf: Buffers,
    axis: number,
    u: number,
    v: number,
    sign: number,
    i: number,
    a: number,
    b: number,
    w: number,
    h: number,
    cell: MaskCell,
  ): void {
    const dCoord = sign > 0 ? i + 1 : i;
    const corner = (uc: number, vc: number): [number, number, number] => {
      const p: [number, number, number] = [0, 0, 0];
      p[axis] = dCoord;
      p[u] = uc;
      p[v] = vc;
      return p;
    };

    const p0 = corner(a, b);
    const p1 = corner(a + w, b);
    const p2 = corner(a + w, b + h);
    const p3 = corner(a, b + h);
    const ps = [p0, p1, p2, p3];

    const normal: [number, number, number] = [0, 0, 0];
    normal[axis] = sign;

    const uvs: [number, number][] = [
      [0, 0],
      [w, 0],
      [w, h],
      [0, h],
    ];

    const n = buf.vertCount;
    for (let k = 0; k < 4; k++) {
      buf.positions.push(ps[k][0], ps[k][1], ps[k][2]);
      buf.normals.push(normal[0], normal[1], normal[2]);
      buf.uvs.push(uvs[k][0], uvs[k][1]);
      buf.layers.push(cell.layer);
      buf.ao.push(cell.ao[k]);
      buf.light.push(cell.light);
      buf.tint.push(cell.tint[0], cell.tint[1], cell.tint[2]);
    }

    // AO seam-minimization: choose the diagonal split whose two triangles interpolate
    // AO more symmetrically. Flipping when the "off-diagonal" sum is greater ensures
    // the darker corners end up on the same triangle, reducing visible AO artifacts
    // at face boundaries.
    const flipped = cell.ao[0] + cell.ao[2] < cell.ao[1] + cell.ao[3];
    let tri = flipped ? [0, 1, 3, 1, 2, 3] : [0, 1, 2, 0, 2, 3];
    if (sign < 0) tri = [tri[0], tri[2], tri[1], tri[3], tri[5], tri[4]];
    for (const t of tri) buf.indices.push(n + t);

    buf.vertCount += 4;
  }
}
