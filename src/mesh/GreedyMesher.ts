import { CHUNK_SIZE_X, CHUNK_SIZE_Z, WORLD_HEIGHT } from '../core/constants';
import { Face } from '../blocks/blocks';
import { vertexAO, aoBrightness } from './Ao';
import type { BlockRegistry } from '../blocks/BlockRegistry';
import type { VoxelView } from '../world/VoxelView';
import type { MeshData } from './MeshTypes';
import type { MeshPass } from './MeshPass';

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
  /** Merge key combining layer + the four AO values + light. */
  key: string;
}

interface Buffers {
  positions: number[];
  normals: number[];
  uvs: number[];
  layers: number[];
  ao: number[];
  light: number[];
  indices: number[];
  vertCount: number;
}

/**
 * Greedy mesher: for each of the 6 face directions, sweeps voxel slices, builds a 2D
 * mask of exposed faces (with per-corner AO), and merges equal cells into rectangles.
 * Reads neighbors through VoxelView so chunk-border faces cull correctly (missing
 * neighbor => air => border face emitted). AO is baked into a per-vertex brightness.
 */
export class GreedyMesher {
  constructor(private readonly registry: BlockRegistry) {}

  mesh(view: VoxelView, pass: MeshPass): MeshData {
    const buf: Buffers = {
      positions: [],
      normals: [],
      uvs: [],
      layers: [],
      ao: [],
      light: [],
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
      indices: new Uint32Array(buf.indices),
    };
  }

  private opaqueAt(view: VoxelView, c: number[]): boolean {
    return this.registry.isOpaque(view.get(c[0], c[1], c[2]));
  }

  /** AO for the 4 corners of a face, sampled on the air side of the solid voxel. */
  private cornerAO(
    view: VoxelView,
    solid: number[],
    axis: number,
    sign: number,
    u: number,
    v: number,
  ): [number, number, number, number] {
    const air = [...solid];
    air[axis] += sign;

    const sample = (du: number, dv: number): number => {
      const p = [...air];
      p[u] += du;
      p[v] += dv;
      return this.opaqueAt(view, p) ? 1 : 0;
    };

    const cornerLevel = (i: number, j: number): number => {
      const su = i === 1 ? 1 : -1;
      const sv = j === 1 ? 1 : -1;
      const side1 = sample(su, 0);
      const side2 = sample(0, sv);
      const corner = sample(su, sv);
      return vertexAO(side1, side2, corner);
    };

    return [
      aoBrightness(cornerLevel(0, 0)),
      aoBrightness(cornerLevel(1, 0)),
      aoBrightness(cornerLevel(1, 1)),
      aoBrightness(cornerLevel(0, 1)),
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

    for (let i = 0; i < dd; i++) {
      const mask: (MaskCell | null)[] = new Array(du * dv).fill(null);

      for (let b = 0; b < dv; b++) {
        for (let a = 0; a < du; a++) {
          const solid = [0, 0, 0];
          solid[axis] = i;
          solid[u] = a;
          solid[v] = b;

          const id = view.get(solid[0], solid[1], solid[2]);
          if (!pass.includes(id)) continue;

          const neighbor = [...solid];
          neighbor[axis] += sign;
          const neighborId = view.get(neighbor[0], neighbor[1], neighbor[2]);
          if (!pass.faceVisible(id, neighborId)) continue; // face hidden

          const layer = this.registry.faceLayer(id, faceFor(axis, sign));
          const ao = this.cornerAO(view, solid, axis, sign, u, v);
          const sky = view.skyLight(neighbor[0], neighbor[1], neighbor[2]);
          const block = view.blockLight(neighbor[0], neighbor[1], neighbor[2]);
          const light = sky * 16 + block;
          mask[a + b * du] = { layer, ao, light, key: `${layer}|${ao.join(',')}|${light}` };
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
    const visited = new Uint8Array(du * dv);

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
    }

    // Flip the split diagonal to keep AO interpolation symmetric (0fps rule).
    const flipped = cell.ao[0] + cell.ao[2] < cell.ao[1] + cell.ao[3];
    let tri = flipped ? [0, 1, 3, 1, 2, 3] : [0, 1, 2, 0, 2, 3];
    if (sign < 0) tri = [tri[0], tri[2], tri[1], tri[3], tri[5], tri[4]];
    for (const t of tri) buf.indices.push(n + t);

    buf.vertCount += 4;
  }
}
