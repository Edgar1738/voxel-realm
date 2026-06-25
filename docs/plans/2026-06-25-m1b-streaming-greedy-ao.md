# M1B — Streaming World + Greedy/AO Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stream chunks in/out around a moving camera with correct disposal, and upgrade meshing to greedy quad-merging with baked ambient occlusion and neighbor-aware border culling.

**Architecture:** A pure `ChunkStore` (data + lifecycle state) and pure `ChunkManager` diff a desired set (chunks within view distance of the camera column) against the loaded set each frame, generating/meshing newly desired chunks under a per-frame budget and disposing chunks that leave range. Meshing reads neighbors through a `VoxelView` so border faces cull correctly; when a neighbor loads, both touching chunks re-mesh. The manager talks to the renderer only through a pure `ChunkSink` interface, so all streaming/meshing logic stays three.js-free and unit-tested. `render/ChunkMeshRegistry` implements the sink (build/position/dispose `THREE.Mesh`).

**Tech Stack:** TypeScript (strict), three.js, Vitest. Builds on M1A.

---

## File Structure

```txt
src/
  core/
    constants.ts          MODIFY  + VIEW_DISTANCE, GEN_BUDGET, MESH_BUDGET
    coords.ts             MODIFY  + chunkKey / parseChunkKey
  world/
    VoxelView.ts          CREATE  neighbor-aware voxel accessor
    ChunkStore.ts         CREATE  ChunkState + per-chunk entry storage
    ChunkManager.ts       CREATE  desired/loaded diff, budgeted load, dispose, ChunkSink seam
  mesh/
    Ao.ts                 CREATE  vertex AO formula + brightness ramp
    GreedyMesher.ts       CREATE  greedy + AO + border culling
    MeshTypes.ts          MODIFY  + ao attribute
    BasicMesher.ts        DELETE  superseded by GreedyMesher
  render/
    ChunkMeshRegistry.ts  CREATE  implements ChunkSink (MeshData -> positioned THREE.Mesh)
    ChunkMaterial.ts      MODIFY  + ao vertex attribute in shader
    buildChunkMesh.ts     MODIFY  + ao attribute
    TextureArray.ts       MODIFY  + RepeatWrapping (greedy tiles UVs)
    Renderer.ts           MODIFY  start() accepts a per-frame callback
  app/
    TempPan.ts            CREATE  temporary WASD camera pan (removed in M1C)
    Game.ts               MODIFY  wire streaming + per-frame update
tests/
  coords.test.ts          MODIFY  + chunkKey round-trip
  voxelView.test.ts       CREATE
  ao.test.ts              CREATE
  greedyMesher.test.ts    CREATE
  chunkStore.test.ts      CREATE
  chunkManager.test.ts    CREATE
  basicMesher.test.ts     DELETE
```

---

## Task 1: Chunk keys + streaming constants

**Files:**
- Modify: `src/core/constants.ts`
- Modify: `src/core/coords.ts`
- Test: `tests/coords.test.ts` (append)

- [ ] **Step 1: Add the failing test**

Append to `tests/coords.test.ts`:
```ts
import { chunkKey, parseChunkKey } from '../src/core/coords';

describe('chunkKey', () => {
  it('round-trips chunk coords including negatives', () => {
    const cases: Array<[number, number]> = [
      [0, 0],
      [1, -1],
      [-5, 9],
      [-128, 256],
    ];
    for (const [cx, cz] of cases) {
      expect(parseChunkKey(chunkKey(cx, cz))).toEqual({ cx, cz });
    }
  });

  it('produces distinct keys for distinct coords', () => {
    expect(chunkKey(1, 2)).not.toBe(chunkKey(2, 1));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run coords`
Expected: FAIL — `chunkKey` is not exported.

- [ ] **Step 3: Add constants**

Append to `src/core/constants.ts`:
```ts
/** Chunk radius (Chebyshev) loaded around the camera column. */
export const VIEW_DISTANCE = 4;
/** Max chunks generated per frame (avoid hitches). */
export const GEN_BUDGET = 2;
/** Max chunks meshed per frame. */
export const MESH_BUDGET = 2;
```

- [ ] **Step 4: Add coord helpers**

Append to `src/core/coords.ts`:
```ts
/** Stable string key for a chunk column. */
export function chunkKey(cx: number, cz: number): string {
  return `${cx},${cz}`;
}

export function parseChunkKey(key: string): { cx: number; cz: number } {
  const comma = key.indexOf(',');
  return { cx: Number(key.slice(0, comma)), cz: Number(key.slice(comma + 1)) };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run coords`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/core tests/coords.test.ts
git commit -m "feat(core): add chunk keys and streaming budget constants"
```

---

## Task 2: VoxelView (neighbor-aware accessor)

**Files:**
- Create: `src/world/VoxelView.ts`
- Test: `tests/voxelView.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/voxelView.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { ChunkData } from '../src/world/ChunkData';
import { VoxelView } from '../src/world/VoxelView';
import { CHUNK_SIZE_X, WORLD_HEIGHT } from '../src/core/constants';
import { AIR, STONE, GRASS } from '../src/blocks/blocks';

describe('VoxelView', () => {
  it('reads voxels from the center chunk', () => {
    const center = new ChunkData(0, 0);
    center.set(3, 10, 5, STONE);
    const view = new VoxelView(center, () => undefined);
    expect(view.get(3, 10, 5)).toBe(STONE);
  });

  it('reads across the +X border into a neighbor chunk', () => {
    const center = new ChunkData(0, 0);
    const east = new ChunkData(1, 0);
    east.set(0, 10, 5, GRASS); // local (0,..) of east == world x = 16
    const view = new VoxelView(center, (dcx, dcz) =>
      dcx === 1 && dcz === 0 ? east : undefined,
    );
    expect(view.get(CHUNK_SIZE_X, 10, 5)).toBe(GRASS);
  });

  it('reads across the -X border into a neighbor chunk', () => {
    const center = new ChunkData(0, 0);
    const west = new ChunkData(-1, 0);
    west.set(CHUNK_SIZE_X - 1, 10, 5, GRASS); // world x = -1
    const view = new VoxelView(center, (dcx, dcz) =>
      dcx === -1 && dcz === 0 ? west : undefined,
    );
    expect(view.get(-1, 10, 5)).toBe(GRASS);
  });

  it('treats a missing neighbor as air', () => {
    const center = new ChunkData(0, 0);
    const view = new VoxelView(center, () => undefined);
    expect(view.get(-1, 10, 5)).toBe(AIR);
    expect(view.get(CHUNK_SIZE_X, 10, 5)).toBe(AIR);
  });

  it('treats out-of-vertical-range as air', () => {
    const center = new ChunkData(0, 0);
    const view = new VoxelView(center, () => undefined);
    expect(view.get(0, -1, 0)).toBe(AIR);
    expect(view.get(0, WORLD_HEIGHT, 0)).toBe(AIR);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run voxelView`
Expected: FAIL — cannot resolve `../src/world/VoxelView`.

- [ ] **Step 3: Write the implementation**

`src/world/VoxelView.ts`:
```ts
import { CHUNK_SIZE_X, CHUNK_SIZE_Z, WORLD_HEIGHT } from '../core/constants';
import { AIR } from '../blocks/blocks';
import type { BlockId } from '../core/types';
import type { ChunkData } from './ChunkData';

/** Looks up a horizontal neighbor chunk by its offset (each in -1..1). */
export type NeighborLookup = (dcx: number, dcz: number) => ChunkData | undefined;

/**
 * Voxel accessor spanning a chunk and its 8 horizontal neighbors. Coordinates x/z
 * may range one voxel outside the chunk (for border culling + AO). Out-of-vertical
 * range and missing neighbors both read as AIR (the spec's border-meshing rule).
 */
export class VoxelView {
  constructor(
    private readonly center: ChunkData,
    private readonly neighbor: NeighborLookup,
  ) {}

  get(x: number, y: number, z: number): BlockId {
    if (y < 0 || y >= WORLD_HEIGHT) return AIR;

    const dcx = Math.floor(x / CHUNK_SIZE_X);
    const dcz = Math.floor(z / CHUNK_SIZE_Z);
    const lx = x - dcx * CHUNK_SIZE_X;
    const lz = z - dcz * CHUNK_SIZE_Z;

    if (dcx === 0 && dcz === 0) return this.center.get(lx, y, lz);

    const nb = this.neighbor(dcx, dcz);
    return nb ? nb.get(lx, y, lz) : AIR;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run voxelView`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/world/VoxelView.ts tests/voxelView.test.ts
git commit -m "feat(world): add neighbor-aware VoxelView accessor"
```

---

## Task 3: Ambient occlusion formula

**Files:**
- Create: `src/mesh/Ao.ts`
- Test: `tests/ao.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/ao.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { vertexAO, aoBrightness } from '../src/mesh/Ao';

describe('vertexAO', () => {
  it('is fully occluded (0) when both sides are solid', () => {
    expect(vertexAO(1, 1, 0)).toBe(0);
    expect(vertexAO(1, 1, 1)).toBe(0);
  });

  it('is unoccluded (3) with no neighbors', () => {
    expect(vertexAO(0, 0, 0)).toBe(3);
  });

  it('decreases with each occluder', () => {
    expect(vertexAO(1, 0, 0)).toBe(2);
    expect(vertexAO(0, 1, 0)).toBe(2);
    expect(vertexAO(0, 0, 1)).toBe(2);
    expect(vertexAO(1, 0, 1)).toBe(1);
  });
});

describe('aoBrightness', () => {
  it('maps occlusion levels to an increasing brightness ramp in (0,1]', () => {
    const ramp = [0, 1, 2, 3].map(aoBrightness);
    expect(ramp[0]).toBeGreaterThan(0);
    expect(ramp[3]).toBe(1);
    for (let i = 1; i < ramp.length; i++) expect(ramp[i]).toBeGreaterThan(ramp[i - 1]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run ao`
Expected: FAIL — cannot resolve `../src/mesh/Ao`.

- [ ] **Step 3: Write the implementation**

`src/mesh/Ao.ts`:
```ts
/**
 * Standard voxel vertex AO. `side1`/`side2` are the two edge-adjacent occluders and
 * `corner` is the diagonal one (each 1 if opaque, else 0). Returns 0 (dark) .. 3 (lit).
 */
export function vertexAO(side1: number, side2: number, corner: number): number {
  if (side1 && side2) return 0;
  return 3 - (side1 + side2 + corner);
}

const AO_BRIGHTNESS = [0.45, 0.65, 0.85, 1.0];

/** Maps an AO level (0..3) to a brightness multiplier baked into the mesh. */
export function aoBrightness(level: number): number {
  return AO_BRIGHTNESS[level];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run ao`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/mesh/Ao.ts tests/ao.test.ts
git commit -m "feat(mesh): add vertex ambient occlusion formula and brightness ramp"
```

---

## Task 4: Add AO to the MeshData payload

**Files:**
- Modify: `src/mesh/MeshTypes.ts`

- [ ] **Step 1: Add the `ao` field**

Replace `src/mesh/MeshTypes.ts` with:
```ts
/** Renderer-agnostic mesh payload (no three.js). Consumed by render/buildChunkMesh. */
export interface MeshData {
  positions: Float32Array;
  normals: Float32Array;
  uvs: Float32Array;
  /** Texture array layer index per vertex. */
  layers: Float32Array;
  /** Baked ambient-occlusion brightness multiplier per vertex (0..1). */
  ao: Float32Array;
  indices: Uint32Array;
}
```

- [ ] **Step 2: Commit** (compiles only once Task 5 produces `ao`; commit together with Task 5)

No standalone commit — bundled into Task 5's commit since the producer/consumer land together.

---

## Task 5: GreedyMesher (greedy + AO + border culling)

**Files:**
- Create: `src/mesh/GreedyMesher.ts`
- Test: `tests/greedyMesher.test.ts`
- Delete: `src/mesh/BasicMesher.ts`, `tests/basicMesher.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/greedyMesher.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { ChunkData } from '../src/world/ChunkData';
import { VoxelView } from '../src/world/VoxelView';
import { GreedyMesher } from '../src/mesh/GreedyMesher';
import { BlockRegistry } from '../src/blocks/BlockRegistry';
import { CHUNK_SIZE_X, CHUNK_SIZE_Z } from '../src/core/constants';
import { GRASS, STONE, TextureLayer, AIR } from '../src/blocks/blocks';

const reg = new BlockRegistry();
const mesher = new GreedyMesher(reg);

function faceCount(mesh: { indices: Uint32Array }): number {
  return mesh.indices.length / 6;
}

function viewOf(center: ChunkData, neighbor = () => undefined as ChunkData | undefined) {
  return new VoxelView(center, neighbor);
}

function layerForNormal(
  mesh: { normals: Float32Array; layers: Float32Array },
  n: [number, number, number],
): number {
  for (let v = 0; v < mesh.layers.length; v++) {
    if (
      mesh.normals[v * 3] === n[0] &&
      mesh.normals[v * 3 + 1] === n[1] &&
      mesh.normals[v * 3 + 2] === n[2]
    )
      return mesh.layers[v];
  }
  throw new Error(`no vertex with normal ${n.join(',')}`);
}

function minAoForNormal(
  mesh: { normals: Float32Array; ao: Float32Array },
  n: [number, number, number],
): number {
  let min = Infinity;
  for (let v = 0; v < mesh.ao.length; v++) {
    if (
      mesh.normals[v * 3] === n[0] &&
      mesh.normals[v * 3 + 1] === n[1] &&
      mesh.normals[v * 3 + 2] === n[2]
    )
      min = Math.min(min, mesh.ao[v]);
  }
  return min;
}

describe('GreedyMesher', () => {
  it('emits nothing for an all-air chunk', () => {
    expect(faceCount(mesher.mesh(viewOf(new ChunkData(0, 0))))).toBe(0);
  });

  it('emits 6 quads for a single isolated voxel', () => {
    const c = new ChunkData(0, 0);
    c.set(8, 10, 8, STONE);
    const mesh = mesher.mesh(viewOf(c));
    expect(faceCount(mesh)).toBe(6);
    expect(mesh.positions.length).toBe(6 * 4 * 3);
    expect(mesh.ao.length).toBe(6 * 4);
  });

  it('merges a full flat slab layer into 6 quads (top, bottom, 4 sides)', () => {
    const c = new ChunkData(0, 0);
    for (let x = 0; x < CHUNK_SIZE_X; x++)
      for (let z = 0; z < CHUNK_SIZE_Z; z++) c.set(x, 0, z, GRASS);
    const mesh = mesher.mesh(viewOf(c));
    expect(faceCount(mesh)).toBe(6);
    expect(layerForNormal(mesh, [0, 1, 0])).toBe(TextureLayer.GrassTop);
  });

  it('culls the +X border faces when an east neighbor is present', () => {
    const c = new ChunkData(0, 0);
    const east = new ChunkData(1, 0);
    for (let x = 0; x < CHUNK_SIZE_X; x++)
      for (let z = 0; z < CHUNK_SIZE_Z; z++) {
        c.set(x, 0, z, GRASS);
        east.set(x, 0, z, GRASS);
      }
    const withNb = mesher.mesh(
      viewOf(c, (dcx, dcz) => (dcx === 1 && dcz === 0 ? east : undefined)),
    );
    const noNb = mesher.mesh(viewOf(c));
    // The east neighbor removes the +X side quad.
    expect(faceCount(withNb)).toBe(faceCount(noNb) - 1);
  });

  it('darkens AO in a corner next to an occluder', () => {
    const c = new ChunkData(0, 0);
    c.set(8, 10, 8, GRASS); // the lit voxel
    c.set(8, 11, 9, GRASS); // occluder above-and-+Z, shades the +Z top edge
    const mesh = mesher.mesh(viewOf(c));
    // The +Y face of the lit voxel should have at least one darkened corner.
    expect(minAoForNormal(mesh, [0, 1, 0])).toBeLessThan(1);
  });

  it('does not emit faces between two stacked voxels', () => {
    const c = new ChunkData(0, 0);
    c.set(8, 10, 8, STONE);
    c.set(8, 11, 8, STONE);
    const mesh = mesher.mesh(viewOf(c));
    // 2 voxels: 6+6 minus the 2 shared faces = 10.
    expect(faceCount(mesh)).toBe(10);
    expect(layerForNormal(mesh, [0, 0, 1])).toBe(TextureLayer.Stone);
    expect(AIR).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run greedyMesher`
Expected: FAIL — cannot resolve `../src/mesh/GreedyMesher`.

- [ ] **Step 3: Write the implementation**

`src/mesh/GreedyMesher.ts`:
```ts
import { CHUNK_SIZE_X, CHUNK_SIZE_Z, WORLD_HEIGHT } from '../core/constants';
import { AIR, Face } from '../blocks/blocks';
import { vertexAO, aoBrightness } from './Ao';
import type { BlockRegistry } from '../blocks/BlockRegistry';
import type { VoxelView } from '../world/VoxelView';
import type { MeshData } from './MeshTypes';

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
  /** Merge key combining layer + the four AO values. */
  key: string;
}

interface Buffers {
  positions: number[];
  normals: number[];
  uvs: number[];
  layers: number[];
  ao: number[];
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

  mesh(view: VoxelView): MeshData {
    const buf: Buffers = {
      positions: [],
      normals: [],
      uvs: [],
      layers: [],
      ao: [],
      indices: [],
      vertCount: 0,
    };

    for (let axis = 0; axis < 3; axis++) {
      const u = (axis + 1) % 3;
      const v = (axis + 2) % 3;
      this.meshDirection(view, axis, u, v, 1, buf);
      this.meshDirection(view, axis, u, v, -1, buf);
    }

    return {
      positions: new Float32Array(buf.positions),
      normals: new Float32Array(buf.normals),
      uvs: new Float32Array(buf.uvs),
      layers: new Float32Array(buf.layers),
      ao: new Float32Array(buf.ao),
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
          if (id === AIR || !this.registry.isOpaque(id)) continue;

          const neighbor = [...solid];
          neighbor[axis] += sign;
          if (this.opaqueAt(view, neighbor)) continue; // face hidden

          const layer = this.registry.faceLayer(id, faceFor(axis, sign));
          const ao = this.cornerAO(view, solid, axis, sign, u, v);
          mask[a + b * du] = { layer, ao, key: `${layer}|${ao.join(',')}` };
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
    }

    // Flip the split diagonal to keep AO interpolation symmetric (0fps rule).
    const flipped = cell.ao[0] + cell.ao[2] < cell.ao[1] + cell.ao[3];
    let tri = flipped ? [0, 1, 3, 1, 2, 3] : [0, 1, 2, 0, 2, 3];
    if (sign < 0) tri = [tri[0], tri[2], tri[1], tri[3], tri[5], tri[4]];
    for (const t of tri) buf.indices.push(n + t);

    buf.vertCount += 4;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run greedyMesher`
Expected: PASS (6 tests).

- [ ] **Step 5: Delete the superseded mesher**

```bash
git rm src/mesh/BasicMesher.ts tests/basicMesher.test.ts
```

- [ ] **Step 6: Run the full suite + type-check**

Run: `npx vitest run && npx tsc --noEmit`
Expected: all tests pass; no type errors. (`Game.ts` still imports `BasicMesher` and will be rewired in Task 9 — if `tsc` flags it here, that is expected; proceed and it resolves at Task 9. To keep this commit green, leave Task 5's commit to bundle with the Game rewire OR temporarily keep `Game.ts` compiling by not deleting until Task 9. See Step 7.)

- [ ] **Step 7: Commit**

Because `Game.ts` (M1A) imports `BasicMesher`, deleting it now breaks the type-check until Task 9. To keep every commit green, **defer the `git rm` of `BasicMesher.ts` to Task 9** and commit only the additions here:

```bash
git add src/mesh/GreedyMesher.ts src/mesh/MeshTypes.ts tests/greedyMesher.test.ts
git commit -m "feat(mesh): add greedy mesher with baked AO and border culling"
```

(Undo the Step 5 deletion if you ran it early: `git checkout src/mesh/BasicMesher.ts tests/basicMesher.test.ts`. It is removed for real in Task 9.)

---

## Task 6: ChunkStore (state + storage)

**Files:**
- Create: `src/world/ChunkStore.ts`
- Test: `tests/chunkStore.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/chunkStore.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { ChunkStore, ChunkState } from '../src/world/ChunkStore';
import { ChunkData } from '../src/world/ChunkData';

describe('ChunkStore', () => {
  it('starts empty', () => {
    const store = new ChunkStore();
    expect(store.has(0, 0)).toBe(false);
    expect(store.get(0, 0)).toBeUndefined();
    expect([...store.keys()]).toEqual([]);
  });

  it('stores data with a state and reads it back', () => {
    const store = new ChunkStore();
    const data = new ChunkData(2, -1);
    store.set(2, -1, data, ChunkState.Generated);
    const entry = store.get(2, -1);
    expect(entry?.data).toBe(data);
    expect(entry?.state).toBe(ChunkState.Generated);
    expect(store.has(2, -1)).toBe(true);
  });

  it('updates state in place', () => {
    const store = new ChunkStore();
    store.set(0, 0, new ChunkData(0, 0), ChunkState.Generated);
    store.setState(0, 0, ChunkState.Meshed);
    expect(store.get(0, 0)?.state).toBe(ChunkState.Meshed);
  });

  it('deletes entries', () => {
    const store = new ChunkStore();
    store.set(0, 0, new ChunkData(0, 0), ChunkState.Generated);
    store.delete(0, 0);
    expect(store.has(0, 0)).toBe(false);
  });

  it('enumerates loaded coordinates', () => {
    const store = new ChunkStore();
    store.set(0, 0, new ChunkData(0, 0), ChunkState.Generated);
    store.set(1, 0, new ChunkData(1, 0), ChunkState.Meshed);
    expect(new Set(store.keys())).toEqual(new Set(['0,0', '1,0']));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run chunkStore`
Expected: FAIL — cannot resolve `../src/world/ChunkStore`.

- [ ] **Step 3: Write the implementation**

`src/world/ChunkStore.ts`:
```ts
import { chunkKey } from '../core/coords';
import type { ChunkData } from './ChunkData';

/** Chunk pipeline lifecycle (full set per spec; M1 uses Generated/Meshed/Disposed). */
export enum ChunkState {
  Missing = 'missing',
  Generating = 'generating',
  Generated = 'generated',
  Meshing = 'meshing',
  Meshed = 'meshed',
  Disposed = 'disposed',
}

export interface ChunkEntry {
  data: ChunkData;
  state: ChunkState;
}

/** In-memory store of loaded chunks keyed by (cx, cz). */
export class ChunkStore {
  private readonly entries = new Map<string, ChunkEntry>();

  has(cx: number, cz: number): boolean {
    return this.entries.has(chunkKey(cx, cz));
  }

  get(cx: number, cz: number): ChunkEntry | undefined {
    return this.entries.get(chunkKey(cx, cz));
  }

  set(cx: number, cz: number, data: ChunkData, state: ChunkState): void {
    this.entries.set(chunkKey(cx, cz), { data, state });
  }

  setState(cx: number, cz: number, state: ChunkState): void {
    const entry = this.entries.get(chunkKey(cx, cz));
    if (entry) entry.state = state;
  }

  delete(cx: number, cz: number): void {
    this.entries.delete(chunkKey(cx, cz));
  }

  keys(): IterableIterator<string> {
    return this.entries.keys();
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run chunkStore`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/world/ChunkStore.ts tests/chunkStore.test.ts
git commit -m "feat(world): add ChunkStore with lifecycle state"
```

---

## Task 7: ChunkManager (streaming + budget + sink seam)

**Files:**
- Create: `src/world/ChunkManager.ts`
- Test: `tests/chunkManager.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/chunkManager.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { ChunkManager, type ChunkSink } from '../src/world/ChunkManager';
import { HeightmapGenerator } from '../src/worldgen/HeightmapGenerator';
import { GreedyMesher } from '../src/mesh/GreedyMesher';
import { BlockRegistry } from '../src/blocks/BlockRegistry';
import type { MeshData } from '../src/mesh/MeshTypes';

const SEED = 1337;

class FakeSink implements ChunkSink {
  uploads = new Map<string, number>();
  disposed: string[] = [];
  upload(key: string, _mesh: MeshData): void {
    this.uploads.set(key, (this.uploads.get(key) ?? 0) + 1);
  }
  dispose(key: string): void {
    this.disposed.push(key);
  }
}

function makeManager(sink: ChunkSink, viewDistance: number, genBudget: number, meshBudget: number) {
  return new ChunkManager(
    new HeightmapGenerator(),
    new GreedyMesher(new BlockRegistry()),
    sink,
    SEED,
    [],
    { viewDistance, genBudget, meshBudget },
  );
}

/** Runs update repeatedly so all budgeted work converges. */
function settle(mgr: ChunkManager, cx: number, cz: number, frames = 100): void {
  for (let i = 0; i < frames; i++) mgr.update(cx, cz);
}

describe('ChunkManager', () => {
  it('loads exactly the chunks within view distance (Chebyshev)', () => {
    const sink = new FakeSink();
    const mgr = makeManager(sink, 1, 64, 64); // 3x3 = 9 chunks
    settle(mgr, 0, 0);
    expect(sink.uploads.size).toBe(9);
    expect(sink.uploads.has('0,0')).toBe(true);
    expect(sink.uploads.has('1,1')).toBe(true);
    expect(sink.uploads.has('2,0')).toBe(false);
  });

  it('respects the per-frame generation budget', () => {
    const sink = new FakeSink();
    const mgr = makeManager(sink, 1, 1, 64); // 1 generated per frame
    mgr.update(0, 0);
    expect(sink.uploads.size).toBeLessThanOrEqual(1);
    settle(mgr, 0, 0);
    expect(sink.uploads.size).toBe(9);
  });

  it('disposes chunks that leave view distance', () => {
    const sink = new FakeSink();
    const mgr = makeManager(sink, 1, 64, 64);
    settle(mgr, 0, 0);
    settle(mgr, 100, 0); // move far away
    expect(sink.disposed).toContain('0,0');
    expect(sink.uploads.has('100,0')).toBe(true);
  });

  it('re-meshes an existing chunk when a new neighbor loads (seam resolves)', () => {
    const sink = new FakeSink();
    const mgr = makeManager(sink, 1, 1, 1); // force sequential loading
    settle(mgr, 0, 0);
    // The center chunk is meshed first (with missing neighbors), then re-meshed as
    // each neighbor loads, so it is uploaded more than once.
    expect((sink.uploads.get('0,0') ?? 0)).toBeGreaterThan(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run chunkManager`
Expected: FAIL — cannot resolve `../src/world/ChunkManager`.

- [ ] **Step 3: Write the implementation**

`src/world/ChunkManager.ts`:
```ts
import { VIEW_DISTANCE, GEN_BUDGET, MESH_BUDGET } from '../core/constants';
import { chunkKey, parseChunkKey } from '../core/coords';
import { ChunkStore, ChunkState } from './ChunkStore';
import { VoxelView } from './VoxelView';
import type { Generator, Overlay } from '../worldgen/Generator';
import { applyOverlays } from '../worldgen/Generator';
import type { GreedyMesher } from '../mesh/GreedyMesher';
import type { MeshData } from '../mesh/MeshTypes';
import type { WorldSeed } from '../core/types';
import type { ChunkData } from './ChunkData';

/** Pure seam to the renderer: upload/dispose chunk meshes by key. */
export interface ChunkSink {
  upload(key: string, mesh: MeshData): void;
  dispose(key: string): void;
}

export interface ChunkManagerOptions {
  viewDistance: number;
  genBudget: number;
  meshBudget: number;
}

const EDGE_NEIGHBORS: ReadonlyArray<[number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/**
 * Diffs the desired set (chunks within view distance of the camera column) against the
 * loaded set each update: disposes chunks that left range, then generates and meshes
 * newly desired chunks under a per-frame budget, nearest first. When a chunk meshes,
 * its already-meshed edge neighbors re-mesh so border seams resolve.
 */
export class ChunkManager {
  private readonly store = new ChunkStore();
  private readonly opts: ChunkManagerOptions;

  constructor(
    private readonly generator: Generator,
    private readonly mesher: GreedyMesher,
    private readonly sink: ChunkSink,
    private readonly seed: WorldSeed,
    private readonly overlays: Overlay[],
    options?: Partial<ChunkManagerOptions>,
  ) {
    this.opts = {
      viewDistance: options?.viewDistance ?? VIEW_DISTANCE,
      genBudget: options?.genBudget ?? GEN_BUDGET,
      meshBudget: options?.meshBudget ?? MESH_BUDGET,
    };
  }

  update(centerCx: number, centerCz: number): void {
    const desired = this.desiredSet(centerCx, centerCz);

    // Unload chunks that left range.
    for (const key of [...this.store.keys()]) {
      if (!desired.has(key)) {
        const { cx, cz } = parseChunkKey(key);
        this.sink.dispose(key);
        this.store.delete(cx, cz);
      }
    }

    // Nearest-first ordering for pleasant load-in.
    const ordered = [...desired.values()].sort(
      (a, b) =>
        (a.cx - centerCx) ** 2 +
        (a.cz - centerCz) ** 2 -
        ((b.cx - centerCx) ** 2 + (b.cz - centerCz) ** 2),
    );

    // Generate pass.
    let gen = 0;
    for (const { cx, cz } of ordered) {
      if (gen >= this.opts.genBudget) break;
      if (this.store.has(cx, cz)) continue;
      const data = this.generator.generateBaseChunk(this.seed, cx, cz);
      applyOverlays(data, cx, cz, this.seed, this.overlays);
      this.store.set(cx, cz, data, ChunkState.Generated);
      gen++;
    }

    // Mesh pass.
    let meshed = 0;
    for (const { cx, cz } of ordered) {
      if (meshed >= this.opts.meshBudget) break;
      const entry = this.store.get(cx, cz);
      if (!entry || entry.state !== ChunkState.Generated) continue;
      this.meshChunk(cx, cz);
      meshed++;
      // Re-mesh meshed neighbors so the shared border resolves.
      for (const [dx, dz] of EDGE_NEIGHBORS) {
        const nb = this.store.get(cx + dx, cz + dz);
        if (nb && nb.state === ChunkState.Meshed) this.meshChunk(cx + dx, cz + dz);
      }
    }
  }

  private desiredSet(
    centerCx: number,
    centerCz: number,
  ): Map<string, { cx: number; cz: number }> {
    const vd = this.opts.viewDistance;
    const desired = new Map<string, { cx: number; cz: number }>();
    for (let dz = -vd; dz <= vd; dz++) {
      for (let dx = -vd; dx <= vd; dx++) {
        const cx = centerCx + dx;
        const cz = centerCz + dz;
        desired.set(chunkKey(cx, cz), { cx, cz });
      }
    }
    return desired;
  }

  private meshChunk(cx: number, cz: number): void {
    const entry = this.store.get(cx, cz);
    if (!entry) return;
    const view = new VoxelView(entry.data, (dcx, dcz) => this.neighborData(cx + dcx, cz + dcz));
    const mesh = this.mesher.mesh(view);
    this.sink.upload(chunkKey(cx, cz), mesh);
    this.store.setState(cx, cz, ChunkState.Meshed);
  }

  private neighborData(cx: number, cz: number): ChunkData | undefined {
    return this.store.get(cx, cz)?.data;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run chunkManager`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/world/ChunkManager.ts tests/chunkManager.test.ts
git commit -m "feat(world): add streaming ChunkManager with budget, disposal, neighbor re-mesh"
```

---

## Task 8: Renderer wiring — AO attribute, repeat wrapping, mesh registry

**Files:**
- Modify: `src/mesh` consumers in `src/render/buildChunkMesh.ts`, `src/render/ChunkMaterial.ts`, `src/render/TextureArray.ts`, `src/render/Renderer.ts`
- Create: `src/render/ChunkMeshRegistry.ts`

No unit tests (three.js); verified visually in Task 9.

- [ ] **Step 1: Add the `ao` attribute to the geometry**

Replace `src/render/buildChunkMesh.ts` with:
```ts
import { BufferGeometry, BufferAttribute, Mesh, type Material } from 'three';
import type { MeshData } from '../mesh/MeshTypes';

/** Converts renderer-agnostic MeshData into a THREE.Mesh with the given material. */
export function buildChunkMesh(mesh: MeshData, material: Material): Mesh {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(mesh.positions, 3));
  geometry.setAttribute('normal', new BufferAttribute(mesh.normals, 3));
  geometry.setAttribute('uv', new BufferAttribute(mesh.uvs, 2));
  geometry.setAttribute('layer', new BufferAttribute(mesh.layers, 1));
  geometry.setAttribute('ao', new BufferAttribute(mesh.ao, 1));
  geometry.setIndex(new BufferAttribute(mesh.indices, 1));
  return new Mesh(geometry, material);
}
```

- [ ] **Step 2: Multiply AO in the shader**

In `src/render/ChunkMaterial.ts`, add the `ao` attribute + varying and apply it. Replace the vertex shader's attribute/varying block and `main`, and the fragment shader's lighting line:

Vertex shader — add after `in float layer;`:
```glsl
in float ao;
```
add after `out float vLayer;`:
```glsl
out float vAo;
```
add inside `main()` after `vLayer = layer;`:
```glsl
  vAo = ao;
```

Fragment shader — add after `in float vLayer;`:
```glsl
in float vAo;
```
and change the lighting line from:
```glsl
  float light = 0.45 + 0.55 * diff;
```
to:
```glsl
  float light = (0.45 + 0.55 * diff) * vAo;
```

- [ ] **Step 3: Tile the texture array for greedy quads**

In `src/render/TextureArray.ts`, import `RepeatWrapping` and set wrapping so UVs > 1 tile per voxel. Change the import line:
```ts
import {
  DataArrayTexture,
  RGBAFormat,
  UnsignedByteType,
  NearestFilter,
  RepeatWrapping,
} from 'three';
```
and add before `tex.needsUpdate = true;`:
```ts
  tex.wrapS = RepeatWrapping;
  tex.wrapT = RepeatWrapping;
```

- [ ] **Step 4: Add a per-frame callback to the renderer**

In `src/render/Renderer.ts`, change `start()` to accept an optional callback:
```ts
  start(onFrame?: (dtSeconds: number) => void): void {
    let last = performance.now();
    const tick = (): void => {
      const now = performance.now();
      const dt = (now - last) / 1000;
      last = now;
      if (onFrame) onFrame(dt);
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
```

- [ ] **Step 5: Create the mesh registry (ChunkSink impl)**

`src/render/ChunkMeshRegistry.ts`:
```ts
import { type Scene, type Material, type Mesh } from 'three';
import { buildChunkMesh } from './buildChunkMesh';
import { parseChunkKey } from '../core/coords';
import { CHUNK_SIZE_X, CHUNK_SIZE_Z } from '../core/constants';
import type { ChunkSink } from '../world/ChunkManager';
import type { MeshData } from '../mesh/MeshTypes';

/** Owns chunk THREE.Meshes; positions them at their world origin; disposes geometry. */
export class ChunkMeshRegistry implements ChunkSink {
  private readonly meshes = new Map<string, Mesh>();

  constructor(
    private readonly scene: Scene,
    private readonly material: Material,
  ) {}

  upload(key: string, mesh: MeshData): void {
    this.remove(key); // replace any prior mesh for this chunk
    const obj = buildChunkMesh(mesh, this.material);
    const { cx, cz } = parseChunkKey(key);
    obj.position.set(cx * CHUNK_SIZE_X, 0, cz * CHUNK_SIZE_Z);
    this.meshes.set(key, obj);
    this.scene.add(obj);
  }

  dispose(key: string): void {
    this.remove(key);
  }

  private remove(key: string): void {
    const existing = this.meshes.get(key);
    if (!existing) return;
    this.scene.remove(existing);
    existing.geometry.dispose();
    this.meshes.delete(key);
  }
}
```

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: errors only from `Game.ts` still referencing `BasicMesher` (fixed in Task 9). All `render/` files type-clean.

- [ ] **Step 7: Commit**

```bash
git add src/render
git commit -m "feat(render): bake AO in shader, tile texture array, add chunk mesh registry"
```

---

## Task 9: Wire streaming into the app

**Files:**
- Create: `src/app/TempPan.ts`
- Modify: `src/app/Game.ts`
- Delete: `src/mesh/BasicMesher.ts`, `tests/basicMesher.test.ts` (deferred from Task 5)

- [ ] **Step 1: Temporary WASD camera pan**

`src/app/TempPan.ts`:
```ts
import { Vector3, type PerspectiveCamera } from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

const SPEED = 40; // world units / second

/**
 * TEMPORARY: pans the orbit camera + target horizontally with WASD so streaming can be
 * exercised before the player controller exists. Removed in M1C (PlayerController).
 */
export function setupTempPan(
  camera: PerspectiveCamera,
  controls: OrbitControls,
): (dt: number) => void {
  const pressed = new Set<string>();
  window.addEventListener('keydown', (e) => pressed.add(e.code));
  window.addEventListener('keyup', (e) => pressed.delete(e.code));

  const forward = new Vector3();
  const right = new Vector3();
  const move = new Vector3();

  return (dt: number): void => {
    move.set(0, 0, 0);
    camera.getWorldDirection(forward);
    forward.y = 0;
    forward.normalize();
    right.crossVectors(forward, camera.up).normalize();

    if (pressed.has('KeyW')) move.add(forward);
    if (pressed.has('KeyS')) move.sub(forward);
    if (pressed.has('KeyD')) move.add(right);
    if (pressed.has('KeyA')) move.sub(right);
    if (pressed.has('Space')) move.y += 1;
    if (pressed.has('ShiftLeft')) move.y -= 1;

    if (move.lengthSq() === 0) return;
    move.normalize().multiplyScalar(SPEED * dt);
    camera.position.add(move);
    controls.target.add(move);
  };
}
```

- [ ] **Step 2: Rewrite Game to stream**

Replace `src/app/Game.ts` with:
```ts
import { Renderer } from '../render/Renderer';
import { createTextureArray } from '../render/TextureArray';
import { createChunkMaterial } from '../render/ChunkMaterial';
import { ChunkMeshRegistry } from '../render/ChunkMeshRegistry';
import { ChunkManager } from '../world/ChunkManager';
import { HeightmapGenerator } from '../worldgen/HeightmapGenerator';
import { GreedyMesher } from '../mesh/GreedyMesher';
import { BlockRegistry } from '../blocks/BlockRegistry';
import { worldToChunkCoord } from '../core/coords';
import { setupTempPan } from './TempPan';
import type { Overlay } from '../worldgen/Generator';
import type { WorldSeed } from '../core/types';

const SEED: WorldSeed = 1337;
const OVERLAYS: Overlay[] = []; // M1: empty (castle is a P4 overlay)

/** Composition root: stream chunks around a (temporarily WASD-panned) camera. */
export class Game {
  static boot(canvas: HTMLCanvasElement): void {
    const registry = new BlockRegistry();
    const renderer = new Renderer(canvas);
    const texture = createTextureArray();
    const material = createChunkMaterial(texture);

    const sink = new ChunkMeshRegistry(renderer.scene, material);
    const manager = new ChunkManager(
      new HeightmapGenerator(),
      new GreedyMesher(registry),
      sink,
      SEED,
      OVERLAYS,
    );

    const pan = setupTempPan(renderer.camera, renderer.controls);

    renderer.start((dt) => {
      pan(dt);
      const cx = worldToChunkCoord(Math.floor(renderer.camera.position.x));
      const cz = worldToChunkCoord(Math.floor(renderer.camera.position.z));
      manager.update(cx, cz);
    });
  }
}
```

- [ ] **Step 3: Expose `controls` on the Renderer**

`setupTempPan` needs `renderer.controls`. In `src/render/Renderer.ts`, change the field declaration from:
```ts
  private readonly controls: OrbitControls;
```
to:
```ts
  readonly controls: OrbitControls;
```

- [ ] **Step 4: Delete the superseded mesher (now safe)**

```bash
git rm src/mesh/BasicMesher.ts tests/basicMesher.test.ts
```

- [ ] **Step 5: Full gate**

Run: `npm run lint && npx vitest run && npx tsc --noEmit && npm run build`
Expected: lint clean, all tests pass, no type errors, build succeeds.

- [ ] **Step 6: Manual visual verification (Edgar)**

Run: `npm run dev`
**Ask Edgar to confirm:**
- Multiple chunks fill the view (not just one), forming continuous rolling terrain.
- WASD pans across the world; new chunks stream in ahead and old ones disappear behind (watch for no permanent holes between chunks — borders line up).
- Greedy meshing looks correct: flat areas are large merged faces, no z-fighting/gaps.
- Ambient occlusion darkens crevices/block bases subtly.
- Space/Shift move up/down; orbit drag still rotates, scroll zooms.

Edgar judges the render; do not self-assess. (You may screenshot via the preview tool to sanity-check for console/shader errors, but final visual sign-off is Edgar's.)

- [ ] **Step 7: Commit**

```bash
git add src/app src/render/Renderer.ts
git commit -m "feat(app): stream chunks around a WASD-panned camera (M1B done)"
```

---

## Self-Review

**Spec coverage (M1B scope):**
- `ChunkManager` load/unload around the camera → Task 7.
- Per-frame budget (avoid hitches) → Task 7 (`genBudget`/`meshBudget`).
- Correct geometry disposal on unload → Task 7 (`dispose`) + Task 8 (`ChunkMeshRegistry.remove` → `geometry.dispose()`).
- Deterministic seams / border meshing rule (missing neighbor = air; re-mesh both on neighbor load) → Task 2 (VoxelView) + Task 7 (neighbor re-mesh) + greedy culling test in Task 5.
- Greedy meshing (merge coplanar same-block faces) → Task 5 (`emitMask` rectangle merge; flat-slab→6-quads test).
- AO baked at mesh time → Tasks 3 + 5 (`cornerAO`) + Task 8 (shader multiply).
- Border culling (neighbor-aware) → Task 5 (+X-neighbor culling test) + Task 2.
- Chunk lifecycle states gating work → Task 6 (`ChunkState`) + Task 7 transitions.
- Pure logic stays three.js-free (manager/mesher/store/view/AO) with the `ChunkSink` seam → Tasks 2–7; only Task 8 `render/` imports three.

**Placeholder scan:** No TBD/TODO. Every code step shows full code or an exact, located edit. The one deferred action (deleting `BasicMesher`) is explicitly sequenced to keep each commit green (Task 5 Step 7 → Task 9 Step 4).

**Type consistency:** `chunkKey`/`parseChunkKey` (string ↔ {cx,cz}); `VoxelView(center, neighbor)` with `NeighborLookup(dcx,dcz)`; `vertexAO(s1,s2,corner)`→0..3 and `aoBrightness(level)`→0..1; `MeshData` now includes `ao: Float32Array` (producer GreedyMesher, consumer buildChunkMesh + shader `in float ao`); `GreedyMesher.mesh(view: VoxelView)`; `ChunkStore`/`ChunkState`/`ChunkEntry{data,state}`; `ChunkManager(generator, mesher, sink, seed, overlays, options?)` with `ChunkSink.upload(key, mesh)/dispose(key)`; `ChunkMeshRegistry implements ChunkSink`; `Renderer.controls` made public and `Renderer.start(onFrame?)`. Names align across all tasks.

**Carried-forward note:** The greedy quad winding (`sign`) and AO-flip diagonal are the two details most likely to need a tweak; they are covered by unit tests for counts/culling/AO and by the Task 9 browser check for correct face orientation (if faces render inside-out, flip the `sign < 0` winding branch in `emitQuad`).
