import { CHUNK_SIZE_X, CHUNK_SIZE_Z, WORLD_HEIGHT } from '../core/constants';
import type { ChunkData } from '../world/ChunkData';
import type { BlockId } from '../core/types';

/**
 * Writes axis-aligned world-space primitives into a single chunk, clipping every primitive to
 * that chunk's column. The fortress is described once per chunk in absolute world coordinates;
 * each `Stamp` keeps only the voxels that land inside its chunk, so a wall or tower spanning a
 * chunk border is stamped seamlessly and each chunk only pays for the voxels it actually owns
 * (loop bounds are clipped up front — features entirely outside the chunk cost ~nothing).
 */
export class CitadelStamp {
  /** Inclusive world-x range owned by this chunk. */
  readonly wx0: number;
  readonly wx1: number;
  /** Inclusive world-z range owned by this chunk. */
  readonly wz0: number;
  readonly wz1: number;

  constructor(
    private readonly chunk: ChunkData,
    cx: number,
    cz: number,
  ) {
    this.wx0 = cx * CHUNK_SIZE_X;
    this.wx1 = this.wx0 + CHUNK_SIZE_X - 1;
    this.wz0 = cz * CHUNK_SIZE_Z;
    this.wz1 = this.wz0 + CHUNK_SIZE_Z - 1;
  }

  /**
   * Sets a single world voxel, ignoring it if out of this chunk or the world's vertical range.
   * An optional orientation `state` (see VoxelState — facing + half bits) is written for shaped
   * blocks such as stairs; the default 0 leaves the state untouched, so plain cube stamps behave
   * exactly as before.
   */
  set(wx: number, wy: number, wz: number, id: BlockId, state = 0): void {
    if (wy < 0 || wy >= WORLD_HEIGHT) return;
    if (wx < this.wx0 || wx > this.wx1 || wz < this.wz0 || wz > this.wz1) return;
    const lx = wx - this.wx0;
    const lz = wz - this.wz0;
    this.chunk.set(lx, wy, lz, id);
    if (state !== 0) this.chunk.setState(lx, wy, lz, state);
  }

  /** Reads a world voxel; returns -1 for anything outside this chunk (cross-chunk reads aren't safe). */
  get(wx: number, wy: number, wz: number): number {
    if (wy < 0 || wy >= WORLD_HEIGHT) return -1;
    if (wx < this.wx0 || wx > this.wx1 || wz < this.wz0 || wz > this.wz1) return -1;
    return this.chunk.get(wx - this.wx0, wy, wz - this.wz0);
  }

  /** Solid axis-aligned box [x0..x1] x [y0..y1] x [z0..z1] (corners in any order), clipped. */
  fill(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, id: BlockId): void {
    const ax = Math.max(Math.min(x0, x1), this.wx0);
    const bx = Math.min(Math.max(x0, x1), this.wx1);
    const az = Math.max(Math.min(z0, z1), this.wz0);
    const bz = Math.min(Math.max(z0, z1), this.wz1);
    const ay = Math.max(Math.min(y0, y1), 0);
    const by = Math.min(Math.max(y0, y1), WORLD_HEIGHT - 1);
    for (let wy = ay; wy <= by; wy++) {
      for (let wz = az; wz <= bz; wz++) {
        for (let wx = ax; wx <= bx; wx++) {
          this.chunk.set(wx - this.wx0, wy, wz - this.wz0, id);
        }
      }
    }
  }

  /** A horizontal rectangle (single y layer) — floors, ceilings, paving. */
  slab(x0: number, z0: number, x1: number, z1: number, y: number, id: BlockId): void {
    this.fill(x0, y, z0, x1, y, z1, id);
  }

  /** The four vertical wall faces of a box (no floor/ceiling), from y0..y1 — a hollow shaft. */
  walls(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, id: BlockId): void {
    const lo = (a: number, b: number): number => Math.min(a, b);
    const hi = (a: number, b: number): number => Math.max(a, b);
    const X0 = lo(x0, x1);
    const X1 = hi(x0, x1);
    const Z0 = lo(z0, z1);
    const Z1 = hi(z0, z1);
    this.fill(X0, y0, Z0, X1, y1, Z0, id); // -z face
    this.fill(X0, y0, Z1, X1, y1, Z1, id); // +z face
    this.fill(X0, y0, Z0, X0, y1, Z1, id); // -x face
    this.fill(X1, y0, Z0, X1, y1, Z1, id); // +x face
  }

  /** A rectangular outline at a single height (railings, merlon bases, plot borders). */
  outline(x0: number, z0: number, x1: number, z1: number, y: number, id: BlockId): void {
    this.walls(x0, y, z0, x1, y, z1, id);
  }
}

/** Deterministic [0,1) hash of world coords + salt (MurmurHash3 finalizer, 32-bit safe). */
export function hash2(wx: number, wz: number, salt: number): number {
  let x =
    (Math.imul(wx | 0, 73856093) ^ Math.imul(wz | 0, 19349663) ^ Math.imul(salt | 0, 83492791)) >>>
    0;
  x = (x ^ (x >>> 16)) >>> 0;
  x = Math.imul(x, 0x45d9f3b) >>> 0;
  x = (x ^ (x >>> 16)) >>> 0;
  x = Math.imul(x, 0x45d9f3b) >>> 0;
  x = (x ^ (x >>> 16)) >>> 0;
  return x / 0x100000000;
}

const SPIRAL_RING: ReadonlyArray<readonly [number, number]> = [
  [-1, -1],
  [0, -1],
  [1, -1],
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
];

/**
 * A compact 3x3 spiral staircase wrapping a solid newel post, one full-block step per height
 * around the ring (1 rise, adjacent run, 8 blocks of headroom) so the player's auto step-up
 * carries them up — or walks them down — reliably. Works for ascent or descent (baseY < topY).
 * The caller keeps the 3x3 footprint clear of floors so the shaft stays open.
 */
export function spiralStair(
  s: CitadelStamp,
  cx: number,
  cz: number,
  baseY: number,
  topY: number,
  step: BlockId,
  post: BlockId,
): void {
  s.fill(cx, baseY, cz, cx, topY, cz, post);
  for (let y = baseY; y <= topY; y++) {
    const [dx, dz] = SPIRAL_RING[(y - baseY) % SPIRAL_RING.length];
    s.set(cx + dx, y, cz + dz, step);
  }
}

/** A solid floor over [x0..x1]x[z0..z1] at height y, leaving a clear 3x3 hole for a stair shaft. */
export function floorWithStairHole(
  s: CitadelStamp,
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  y: number,
  holeX: number,
  holeZ: number,
  block: BlockId,
): void {
  const ax = Math.max(Math.min(x0, x1), s.wx0);
  const bx = Math.min(Math.max(x0, x1), s.wx1);
  const az = Math.max(Math.min(z0, z1), s.wz0);
  const bz = Math.min(Math.max(z0, z1), s.wz1);
  for (let wz = az; wz <= bz; wz++) {
    for (let wx = ax; wx <= bx; wx++) {
      if (Math.abs(wx - holeX) <= 1 && Math.abs(wz - holeZ) <= 1) continue;
      s.set(wx, y, wz, block);
    }
  }
}
