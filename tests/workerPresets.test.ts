import { describe, expect, it } from 'vitest';
import { applyOverlays } from '../src/worldgen/Generator';
import { createGenerator as createMainGenerator } from '../src/worldgen/Presets';
import { createGenerator as createWorkerGenerator } from '../src/worldgen/WorkerPresets';

const SEED = 1337;

describe('generation worker preset parity', () => {
  it.each([
    ['villages', 0, 0],
    ['frontier', -1, 1],
    ['canyon', 1, -1],
  ] as const)('%s matches the main-thread preset at chunk (%i, %i)', (preset, cx, cz) => {
    const main = createMainGenerator(preset);
    const worker = createWorkerGenerator(preset);
    const mainChunk = main.generator.generateBaseChunk(SEED, cx, cz);
    const workerChunk = worker.generator.generateBaseChunk(SEED, cx, cz);

    applyOverlays(mainChunk, cx, cz, SEED, main.overlays);
    applyOverlays(workerChunk, cx, cz, SEED, worker.overlays);

    expect(workerChunk.data).toEqual(mainChunk.data);
    expect(workerChunk.state).toEqual(mainChunk.state);
    expect(workerChunk.biomeData).toEqual(mainChunk.biomeData);
  });
});
