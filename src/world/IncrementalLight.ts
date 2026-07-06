import { CHUNK_SIZE_X, CHUNK_SIZE_Z, WORLD_HEIGHT } from '../core/constants';

/**
 * Incremental relighting for single-voxel edits. Instead of recomputing a whole chunk's
 * light from scratch ({@link computeChunkLight}), these routines re-propagate only in the
 * neighborhood of the changed voxel using the classic "remove-then-refill" flood-fill:
 *
 *   - On a light DECREASE (opaque placed, emitter removed/dimmed) a removal BFS clears the
 *     cells that were lit *by* the change while collecting still-valid brighter/equal cells
 *     as refill borders, then a normal add-propagate refills from those borders.
 *   - On a light INCREASE (emitter placed, an opaque block opened) an add-propagate raises
 *     the neighborhood from the new source.
 *
 * The result is byte-identical to a full recompute at every cell (verified by tests), because
 * both converge to the same max-attenuation flood-fill fixpoint. Work is proportional to the
 * cells whose light actually changes, not the chunk volume — the whole point of the exercise.
 *
 * Two channels, two topologies (mirroring the full pass):
 *   - Block light crosses chunk borders, so it runs over a world-coord {@link LightWorld}.
 *   - Sky light is chunk-local (the full pass never propagates sky across a seam), so it runs
 *     over a single-chunk {@link SkyChunk} in local coordinates.
 */

const MAX_LIGHT = 15;

/** The 6 axis-aligned face neighbours (dx, dy, dz). */
const FACE_OFFSETS: ReadonlyArray<readonly [number, number, number]> = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
];

/** The light-relevant properties of a voxel before/after an edit. */
export interface VoxelLightProps {
  /** Whether the voxel blocks light transmission (and holds no transmitted light). */
  opaque: boolean;
  /** The voxel's own emitted block-light level, 0..15. */
  emission: number;
}

/**
 * World-coordinate voxel + block-light grid the incremental block relighter reads and writes.
 * Reads outside loaded chunks or the world must be safe (AIR / 0); the BFS never propagates
 * into an unloaded column (guarded by {@link isLoaded}), matching the full pass which treats a
 * missing neighbor as exporting 0.
 */
export interface LightWorld {
  isOpaque(wx: number, wy: number, wz: number): boolean;
  emission(wx: number, wy: number, wz: number): number;
  /** Whether the chunk covering world column (wx,wz) is loaded (writable). */
  isLoaded(wx: number, wz: number): boolean;
  getBlockLight(wx: number, wy: number, wz: number): number;
  setBlockLight(wx: number, wy: number, wz: number, v: number): void;
  /** Record that the chunk covering (wx,wz) had its block light mutated. */
  markDirty(wx: number, wz: number): void;
}

/** Chunk-local sky-light grid (local coords 0..15 in x/z, 0..WORLD_HEIGHT-1 in y). */
export interface SkyChunk {
  /** The chunk's highest solid voxel (for the "open to sky above" scan). */
  readonly maxSolidY: number;
  isOpaque(x: number, y: number, z: number): boolean;
  getSky(x: number, y: number, z: number): number;
  setSky(x: number, y: number, z: number, v: number): void;
}

interface Cell {
  x: number;
  y: number;
  z: number;
}

interface RemovalCell extends Cell {
  /** The light level this cell held when it was enqueued for removal. */
  level: number;
}

function inYRange(y: number): boolean {
  return y >= 0 && y < WORLD_HEIGHT;
}

function inChunk(x: number, y: number, z: number): boolean {
  return x >= 0 && x < CHUNK_SIZE_X && y >= 0 && y < WORLD_HEIGHT && z >= 0 && z < CHUNK_SIZE_Z;
}

// ---------------------------------------------------------------------------
// Block light — cross-chunk
// ---------------------------------------------------------------------------

/**
 * Re-propagate block light after a single voxel at world (wx,wy,wz) changed from `before`
 * to `after`. Mutates the block-light arrays of every affected loaded chunk in-place and
 * marks each one dirty. No-op when neither opacity nor emission changed.
 */
export function updateBlockLight(
  world: LightWorld,
  wx: number,
  wy: number,
  wz: number,
  before: VoxelLightProps,
  after: VoxelLightProps,
): void {
  if (before.opaque === after.opaque && before.emission === after.emission) return;

  const stored = world.getBlockLight(wx, wy, wz);
  // Removal is needed only when the cell's justified light can drop: it newly blocks
  // transmission, or its own emission decreased. A pure increase (emitter placed/raised, or an
  // opaque block opened) only ever raises light and skips the removal pass.
  const needRemoval = (after.opaque && !before.opaque) || after.emission < before.emission;

  if (needRemoval) {
    const borders = blockRemovalBFS(world, wx, wy, wz, stored);
    if (after.emission > 0) {
      // Re-seed the cell's own emission (an emitter holds its level even when opaque).
      world.setBlockLight(wx, wy, wz, after.emission);
      world.markDirty(wx, wz);
      borders.push({ x: wx, y: wy, z: wz });
    }
    blockPropagate(world, borders);
    return;
  }

  // Pure increase. The cell's new value is its own emission plus, if it can now transmit,
  // the best light arriving from a face neighbour.
  let v = after.emission;
  if (!after.opaque) {
    for (const [dx, dy, dz] of FACE_OFFSETS) {
      const nx = wx + dx;
      const ny = wy + dy;
      const nz = wz + dz;
      if (!inYRange(ny) || !world.isLoaded(nx, nz)) continue;
      const incoming = world.getBlockLight(nx, ny, nz) - 1;
      if (incoming > v) v = incoming;
    }
  }
  if (v > stored) {
    world.setBlockLight(wx, wy, wz, v);
    world.markDirty(wx, wz);
    blockPropagate(world, [{ x: wx, y: wy, z: wz }]);
  }
}

/**
 * Removal flood-fill for block light: zero the seed cell and every cell that was lit solely
 * by it, collecting cells with an independent (self-emitted or brighter-transmitted) source as
 * refill borders. Returns the borders for the subsequent add-propagate.
 */
function blockRemovalBFS(
  world: LightWorld,
  wx: number,
  wy: number,
  wz: number,
  stored: number,
): Cell[] {
  const borders: Cell[] = [];
  const queue: RemovalCell[] = [{ x: wx, y: wy, z: wz, level: stored }];
  world.setBlockLight(wx, wy, wz, 0);
  world.markDirty(wx, wz);

  let head = 0;
  while (head < queue.length) {
    const { x, y, z, level } = queue[head++];
    if (level <= 0) continue;
    for (const [dx, dy, dz] of FACE_OFFSETS) {
      const nx = x + dx;
      const ny = y + dy;
      const nz = z + dz;
      if (!inYRange(ny) || !world.isLoaded(nx, nz)) continue;
      const nl = world.getBlockLight(nx, ny, nz);
      if (nl === 0) continue;
      const nemit = world.emission(nx, ny, nz);
      if (nl <= nemit) {
        // Self-sustained (an emitter at/under its own floor) — independent source, keep + refill.
        borders.push({ x: nx, y: ny, z: nz });
        continue;
      }
      if (nl < level) {
        // Lit by us: drop to its own emission floor and keep unwinding what it lit.
        world.setBlockLight(nx, ny, nz, nemit);
        world.markDirty(nx, nz);
        if (nemit > 0) borders.push({ x: nx, y: ny, z: nz });
        queue.push({ x: nx, y: ny, z: nz, level: nl });
      } else {
        // Independent transmitted source at least as bright as us: refill border.
        borders.push({ x: nx, y: ny, z: nz });
      }
    }
  }
  return borders;
}

/** Add flood-fill for block light: raise-only propagation from already-set seed cells. */
function blockPropagate(world: LightWorld, seeds: Cell[]): void {
  const queue = seeds;
  let head = 0;
  while (head < queue.length) {
    const { x, y, z } = queue[head++];
    const level = world.getBlockLight(x, y, z);
    if (level <= 1) continue;
    const next = level - 1;
    for (const [dx, dy, dz] of FACE_OFFSETS) {
      const nx = x + dx;
      const ny = y + dy;
      const nz = z + dz;
      if (!inYRange(ny) || !world.isLoaded(nx, nz)) continue;
      if (world.isOpaque(nx, ny, nz)) continue;
      if (next > world.getBlockLight(nx, ny, nz)) {
        world.setBlockLight(nx, ny, nz, next);
        world.markDirty(nx, nz);
        queue.push({ x: nx, y: ny, z: nz });
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Sky light — chunk-local
// ---------------------------------------------------------------------------

/**
 * Re-propagate sky light within one chunk after a single voxel's opacity changed. Sky depends
 * only on opacity (no emission), and never crosses a chunk seam — so this stays entirely within
 * `sky`. No-op when opacity is unchanged.
 */
export function updateSkyLight(
  sky: SkyChunk,
  x: number,
  y: number,
  z: number,
  before: VoxelLightProps,
  after: VoxelLightProps,
): void {
  if (before.opaque === after.opaque) return;

  if (after.opaque) {
    // Placed opaque. If the cell was open to the sky (seeded 15), the whole open column
    // segment at/below y loses its direct seed and must be removed. Equal-15 columns don't
    // cascade via the "== parent-1" rule, so the band is enumerated explicitly.
    const seeds: RemovalCell[] = [];
    if (sky.getSky(x, y, z) === MAX_LIGHT) {
      for (let yy = y; yy >= 0; yy--) {
        if (sky.getSky(x, yy, z) !== MAX_LIGHT) break;
        seeds.push({ x, y: yy, z, level: MAX_LIGHT });
      }
    } else {
      seeds.push({ x, y, z, level: sky.getSky(x, y, z) });
    }
    const borders = skyRemovalBFS(sky, seeds);
    skyPropagate(sky, borders);
    return;
  }

  // Removed opaque (now transparent). Did this re-open the column to the sky?
  let openAbove = true;
  for (let yy = y + 1; yy <= sky.maxSolidY; yy++) {
    if (sky.isOpaque(x, yy, z)) {
      openAbove = false;
      break;
    }
  }
  if (openAbove) {
    // Newly sky-open band: from y down to the next opaque below, seed 15 and add-propagate.
    const seeds: Cell[] = [];
    for (let yy = y; yy >= 0; yy--) {
      if (sky.isOpaque(x, yy, z)) break;
      sky.setSky(x, yy, z, MAX_LIGHT);
      seeds.push({ x, y: yy, z });
    }
    skyPropagate(sky, seeds);
  } else {
    // Still shadowed above: the cell just became a transparent spread-receiver.
    let v = 0;
    for (const [dx, dy, dz] of FACE_OFFSETS) {
      const nx = x + dx;
      const ny = y + dy;
      const nz = z + dz;
      if (!inChunk(nx, ny, nz)) continue;
      const incoming = sky.getSky(nx, ny, nz) - 1;
      if (incoming > v) v = incoming;
    }
    if (v > sky.getSky(x, y, z)) {
      sky.setSky(x, y, z, v);
      skyPropagate(sky, [{ x, y, z }]);
    }
  }
}

/** Removal flood-fill for sky light (chunk-local). Mirrors {@link blockRemovalBFS}, no emitters. */
function skyRemovalBFS(sky: SkyChunk, seeds: RemovalCell[]): Cell[] {
  const borders: Cell[] = [];
  for (const s of seeds) sky.setSky(s.x, s.y, s.z, 0);

  const queue = seeds;
  let head = 0;
  while (head < queue.length) {
    const { x, y, z, level } = queue[head++];
    if (level <= 0) continue;
    for (const [dx, dy, dz] of FACE_OFFSETS) {
      const nx = x + dx;
      const ny = y + dy;
      const nz = z + dz;
      if (!inChunk(nx, ny, nz)) continue;
      const nl = sky.getSky(nx, ny, nz);
      if (nl === 0) continue;
      if (nl < level) {
        sky.setSky(nx, ny, nz, 0);
        queue.push({ x: nx, y: ny, z: nz, level: nl });
      } else {
        // Still open / independently brighter: refill border.
        borders.push({ x: nx, y: ny, z: nz });
      }
    }
  }
  return borders;
}

/** Add flood-fill for sky light (chunk-local). Mirrors {@link blockPropagate}. */
function skyPropagate(sky: SkyChunk, seeds: Cell[]): void {
  const queue = seeds;
  let head = 0;
  while (head < queue.length) {
    const { x, y, z } = queue[head++];
    const level = sky.getSky(x, y, z);
    if (level <= 1) continue;
    const next = level - 1;
    for (const [dx, dy, dz] of FACE_OFFSETS) {
      const nx = x + dx;
      const ny = y + dy;
      const nz = z + dz;
      if (!inChunk(nx, ny, nz)) continue;
      if (sky.isOpaque(nx, ny, nz)) continue;
      if (next > sky.getSky(nx, ny, nz)) {
        sky.setSky(nx, ny, nz, next);
        queue.push({ x: nx, y: ny, z: nz });
      }
    }
  }
}
