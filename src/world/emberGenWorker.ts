import { createEmberWorkerPreset } from '../worldgen/emberWorkerPreset';
import { setSharedChunkBuffers } from './chunkBuffers';
import { runGenJob } from './genJob';
import type { GenJobResult, GenWorkerMessage } from './genJob';
import type { Generator, Overlay } from '../worldgen/Generator';
import type { WorldSeed } from '../core/types';

/** Dedicated Ember worker entry keeps its large authored site out of every other world worker. */
let generator: Generator | undefined;
let overlays: Overlay[] = [];
let seed: WorldSeed = 0;
let shared = false;

self.onmessage = (event: MessageEvent<GenWorkerMessage>) => {
  const msg = event.data;
  if (msg.kind === 'init') {
    if (msg.preset !== 'ember-spire')
      throw new Error(`ember gen worker: unexpected preset "${msg.preset}"`);
    setSharedChunkBuffers(msg.sharedBuffers);
    shared = msg.sharedBuffers && typeof SharedArrayBuffer !== 'undefined';
    seed = msg.seed;
    ({ generator, overlays } = createEmberWorkerPreset(msg.worldgenVersion));
    return;
  }
  if (!generator) throw new Error('ember gen worker: job before init');
  const chunk = runGenJob(generator, overlays, seed, msg.cx, msg.cz);
  const result: GenJobResult = { cx: msg.cx, cz: msg.cz, buffer: chunk.buffer };
  (self as unknown as Worker).postMessage(result, shared ? [] : [result.buffer as ArrayBuffer]);
};
