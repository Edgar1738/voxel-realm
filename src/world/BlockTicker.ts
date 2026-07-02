import type { SetVoxel, VoxelChange } from '../edit/EditTypes';
import { tickCell, type SimSampler } from './fluidRules';

/** Seconds between simulation waves; sets the visible flow speed. */
export const TICK_INTERVAL = 0.18;
/** Max cells simulated per wave — hard frame-cost ceiling. */
export const TICK_BUDGET = 128;
/** Queue cap; beyond this, new activations are dropped (fail-safe, not correctness). */
const MAX_QUEUE = 8192;

const OFFSETS: readonly [number, number, number][] = [
  [0, 0, 0],
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
];

/**
 * Budgeted block-update scheduler: cells activated by edits are ticked in waves
 * (water flow, falling sand). Every edit — player, builder, undo, or the sim's own
 * writes — re-activates the changed cells and their neighbors, so cascades sustain
 * themselves and stable cells simply produce no edits and go quiet.
 */
export class BlockTicker {
  private readonly pending = new Map<string, [number, number, number]>();
  private timer = 0;

  constructor(
    private readonly sampler: SimSampler,
    private readonly applyEdits: (edits: SetVoxel[]) => VoxelChange[],
  ) {}

  /** Cells waiting for a tick (dev/test introspection). */
  get queued(): number {
    return this.pending.size;
  }

  /** Activates the changed cells and their neighbors for the next wave. */
  notifyChanges(changes: readonly VoxelChange[]): void {
    for (const c of changes) {
      for (const [dx, dy, dz] of OFFSETS) {
        this.activate(c.x + dx, c.y + dy, c.z + dz);
      }
    }
  }

  /** Advances the clock; runs at most one wave per call. */
  update(dt: number): void {
    this.timer += dt;
    if (this.timer < TICK_INTERVAL) return;
    this.timer = 0;
    if (this.pending.size === 0) return;

    const cells: [number, number, number][] = [];
    for (const [key, cell] of this.pending) {
      cells.push(cell);
      this.pending.delete(key);
      if (cells.length >= TICK_BUDGET) break;
    }

    // Last write wins per cell so one wave never sends conflicting edits.
    const edits = new Map<string, SetVoxel>();
    for (const [x, y, z] of cells) {
      for (const edit of tickCell(this.sampler, x, y, z)) {
        edits.set(`${edit.x},${edit.y},${edit.z}`, edit);
      }
    }
    if (edits.size === 0) return;
    const changes = this.applyEdits([...edits.values()]);
    // The ChunkManager callback also routes these changes back into notifyChanges;
    // activation is idempotent, so the double notification is harmless.
    this.notifyChanges(changes);
  }

  private activate(x: number, y: number, z: number): void {
    if (this.pending.size >= MAX_QUEUE) return;
    const key = `${x},${y},${z}`;
    if (!this.pending.has(key)) this.pending.set(key, [x, y, z]);
  }
}
