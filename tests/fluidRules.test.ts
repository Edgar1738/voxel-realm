import { describe, it, expect } from 'vitest';
import { tickCell, waterLevel, MAX_FLOW_LEVEL, type SimSampler } from '../src/world/fluidRules';
import { BlockTicker, TICK_INTERVAL } from '../src/world/BlockTicker';
import { AIR, SAND, STONE, WATER } from '../src/blocks/blocks';
import type { SetVoxel, VoxelChange } from '../src/edit/EditTypes';

/** Mutable mini-world with a stone floor at y=59 and everything loaded. */
class FakeWorld implements SimSampler {
  private readonly blocks = new Map<string, { id: number; state: number }>();
  loaded = (_x: number, _z: number): boolean => true;

  set(x: number, y: number, z: number, id: number, state = 0): void {
    this.blocks.set(`${x},${y},${z}`, { id, state });
  }

  getBlock(x: number, y: number, z: number): number {
    if (y === 59) return STONE;
    return this.blocks.get(`${x},${y},${z}`)?.id ?? AIR;
  }

  getState(x: number, y: number, z: number): number {
    return this.blocks.get(`${x},${y},${z}`)?.state ?? 0;
  }

  isLoaded(x: number, z: number): boolean {
    return this.loaded(x, z);
  }

  /** applyEdits mirror of ChunkManager: returns only real changes. */
  apply(edits: SetVoxel[]): VoxelChange[] {
    const changes: VoxelChange[] = [];
    for (const e of edits) {
      const before = this.getBlock(e.x, e.y, e.z);
      const beforeState = this.getState(e.x, e.y, e.z);
      const state = e.state ?? 0;
      if (before === e.id && beforeState === state) continue;
      this.set(e.x, e.y, e.z, e.id, state);
      changes.push({ x: e.x, y: e.y, z: e.z, before, after: e.id, beforeState, afterState: state });
    }
    return changes;
  }
}

function runTicker(world: FakeWorld, seedChanges: VoxelChange[], maxWaves = 200): BlockTicker {
  const ticker = new BlockTicker(world, (edits) => {
    const changes = world.apply(edits);
    ticker.notifyChanges(changes); // mirrors the ChunkManager.onEditsApplied wiring
    return changes;
  });
  ticker.notifyChanges(seedChanges);
  for (let i = 0; i < maxWaves && ticker.queued > 0; i++) ticker.update(TICK_INTERVAL);
  return ticker;
}

function placeWater(world: FakeWorld, x: number, y: number, z: number): VoxelChange[] {
  world.set(x, y, z, WATER, 0);
  return [{ x, y, z, before: AIR, after: WATER, beforeState: 0, afterState: 0 }];
}

describe('tickCell water rules', () => {
  it('a source on a floor spreads to all four sides at level 1', () => {
    const w = new FakeWorld();
    w.set(0, 60, 0, WATER, 0);
    const edits = tickCell(w, 0, 60, 0);
    expect(edits).toHaveLength(4);
    for (const e of edits) {
      expect(e.id).toBe(WATER);
      expect(e.state).toBe(1);
      expect(e.y).toBe(60);
    }
  });

  it('falls before spreading: air below wins and gets fresh level-1 water', () => {
    const w = new FakeWorld();
    w.set(0, 62, 0, WATER, 0); // floating source, air below
    const edits = tickCell(w, 0, 62, 0);
    expect(edits).toEqual([{ x: 0, y: 61, z: 0, id: WATER, state: 1 }]);
  });

  it('stops at MAX_FLOW_LEVEL: fed edge water never spreads further', () => {
    const w = new FakeWorld();
    w.set(0, 60, 0, WATER, MAX_FLOW_LEVEL - 1); // feed
    w.set(1, 60, 0, WATER, MAX_FLOW_LEVEL); // edge of the flow
    expect(tickCell(w, 1, 60, 0)).toEqual([]);
  });

  it('orphaned flowing water evaporates', () => {
    const w = new FakeWorld();
    w.set(0, 60, 0, WATER, 3); // no water neighbors at all
    expect(tickCell(w, 0, 60, 0)).toEqual([{ x: 0, y: 60, z: 0, id: AIR }]);
  });

  it('flow fed from above stays at level 1', () => {
    const w = new FakeWorld();
    w.set(0, 61, 0, WATER, 1);
    w.set(0, 60, 0, WATER, 5); // wrong level, but fed from above
    expect(tickCell(w, 0, 60, 0)).toEqual([{ x: 0, y: 60, z: 0, id: WATER, state: 1 }]);
  });

  it('stalls when any horizontal neighbor chunk is unloaded', () => {
    const w = new FakeWorld();
    w.set(0, 60, 0, WATER, 0);
    w.loaded = (x) => x <= 0; // +x frontier
    expect(tickCell(w, 0, 60, 0)).toEqual([]);
  });

  it('sources never evaporate', () => {
    const w = new FakeWorld();
    // A lone source with no neighbors: only tries to spread.
    w.set(5, 60, 5, WATER, 0);
    const edits = tickCell(w, 5, 60, 5);
    expect(edits.every((e) => e.id === WATER)).toBe(true);
  });
});

describe('tickCell gravity rules', () => {
  it('sand over air falls one cell', () => {
    const w = new FakeWorld();
    w.set(0, 63, 0, SAND);
    expect(tickCell(w, 0, 63, 0)).toEqual([
      { x: 0, y: 63, z: 0, id: AIR },
      { x: 0, y: 62, z: 0, id: SAND, state: 0 },
    ]);
  });

  it('sand on sand (or any solid) is stable — pyramids stay up', () => {
    const w = new FakeWorld();
    w.set(0, 61, 0, SAND);
    w.set(0, 60, 0, SAND);
    expect(tickCell(w, 0, 61, 0)).toEqual([]);
    expect(tickCell(w, 0, 60, 0)).toEqual([]); // stone floor below
  });

  it('sand sinks through water', () => {
    const w = new FakeWorld();
    w.set(0, 61, 0, SAND);
    w.set(0, 60, 0, WATER, 0);
    const edits = tickCell(w, 0, 61, 0);
    expect(edits[1]).toEqual({ x: 0, y: 60, z: 0, id: SAND, state: 0 });
  });
});

describe('BlockTicker cascades', () => {
  it('a placed source floods a bounded 5x5 basin and goes quiet', () => {
    const w = new FakeWorld();
    // Basin walls at x/z = ±3, floor is the stone plane at 59.
    for (let x = -3; x <= 3; x++)
      for (let z = -3; z <= 3; z++) {
        if (Math.abs(x) === 3 || Math.abs(z) === 3) w.set(x, 60, z, STONE);
      }
    const ticker = runTicker(w, placeWater(w, 0, 60, 0));
    expect(ticker.queued).toBe(0); // converged
    let waterCells = 0;
    for (let x = -2; x <= 2; x++)
      for (let z = -2; z <= 2; z++) {
        if (w.getBlock(x, 60, z) === WATER) waterCells++;
      }
    expect(waterCells).toBe(25); // whole basin floor is wet (radius 4 < MAX level 7)
  });

  it('levels grow with distance from the source', () => {
    const w = new FakeWorld();
    const ticker = runTicker(w, placeWater(w, 0, 60, 0));
    expect(ticker.queued).toBe(0);
    expect(waterLevel(w.getState(0, 60, 0))).toBe(0);
    expect(waterLevel(w.getState(1, 60, 0))).toBe(1);
    expect(waterLevel(w.getState(2, 60, 0))).toBe(2);
    expect(w.getBlock(MAX_FLOW_LEVEL, 60, 0)).toBe(WATER);
    expect(w.getBlock(MAX_FLOW_LEVEL + 1, 60, 0)).toBe(AIR); // finite
  });

  it('removing the source drains the flow completely', () => {
    const w = new FakeWorld();
    runTicker(w, placeWater(w, 0, 60, 0));
    expect(w.getBlock(1, 60, 0)).toBe(WATER);
    // Break the source.
    const removal = w.apply([{ x: 0, y: 60, z: 0, id: AIR }]);
    const ticker = runTicker(w, removal);
    expect(ticker.queued).toBe(0);
    for (let x = -8; x <= 8; x++)
      for (let z = -8; z <= 8; z++) {
        expect(w.getBlock(x, 60, z)).toBe(AIR);
      }
  });

  it('water falls down a shaft and pools at the bottom', () => {
    const w = new FakeWorld();
    // Source high up; shaft of air below down to the stone floor at 59.
    const ticker = runTicker(w, placeWater(w, 0, 70, 0));
    if (ticker.queued !== 0) {
      const pending = (ticker as unknown as { pending: Map<string, [number, number, number]> })
        .pending;
      const dump = [...pending.values()]
        .map(
          ([x, y, z]) =>
            `${x},${y},${z} id=${w.getBlock(x, y, z)} lvl=${waterLevel(w.getState(x, y, z))} -> ${JSON.stringify(tickCell(w, x, y, z))}`,
        )
        .join(' | ');
      throw new Error(`ticker did not converge; pending: ${dump}`);
    }
    for (let y = 60; y <= 70; y++) expect(w.getBlock(0, y, 0)).toBe(WATER);
    expect(w.getBlock(1, 60, 0)).toBe(WATER); // spread at the floor
    expect(w.getBlock(1, 65, 0)).toBe(AIR); // no sideways spread mid-fall
  });

  it('a sand column collapses through air onto the floor', () => {
    const w = new FakeWorld();
    w.set(0, 68, 0, SAND);
    w.set(0, 67, 0, SAND);
    const seed: VoxelChange[] = [
      { x: 0, y: 68, z: 0, before: AIR, after: SAND, beforeState: 0, afterState: 0 },
      { x: 0, y: 67, z: 0, before: AIR, after: SAND, beforeState: 0, afterState: 0 },
    ];
    const ticker = runTicker(w, seed);
    expect(ticker.queued).toBe(0);
    expect(w.getBlock(0, 60, 0)).toBe(SAND);
    expect(w.getBlock(0, 61, 0)).toBe(SAND);
    expect(w.getBlock(0, 67, 0)).toBe(AIR);
    expect(w.getBlock(0, 68, 0)).toBe(AIR);
  });
});
