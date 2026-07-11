import { createGenerator, isWorldPreset } from '../worldgen/Presets';
import { setSharedChunkBuffers } from './chunkBuffers';
import { runGenJob } from './genJob';
import type { GenJobResult, GenWorkerMessage } from './genJob';
import type { Generator, Overlay } from '../worldgen/Generator';
import type { WorldSeed } from '../core/types';

/**
 * Generation worker: rebuilds the deterministic generator from (preset, seed) — overlays are
 * closures and cannot cross the worker boundary — then produces base chunks through the same
 * `runGenJob` path as the synchronous fallback. Chunk buffers allocate as SharedArrayBuffers
 * when the page is cross-origin isolated (mesh workers keep zero-copy reads) and transfer as
 * plain ArrayBuffers otherwise, so generation workers do NOT require COOP/COEP headers.
 */

let generator: Generator | undefined;
let overlays: Overlay[] = [];
let seed: WorldSeed = 0;
let shared = false;

self.onmessage = (event: MessageEvent<GenWorkerMessage>) => {
  const msg = event.data;
  if (msg.kind === 'init') {
    if (!isWorldPreset(msg.preset)) throw new Error(`gen worker: unknown preset "${msg.preset}"`);
    setSharedChunkBuffers(msg.sharedBuffers);
    shared = msg.sharedBuffers && typeof SharedArrayBuffer !== 'undefined';
    seed = msg.seed;
    ({ generator, overlays } = createGenerator(msg.preset));
    return;
  }
  if (!generator) throw new Error('gen worker: job before init');
  const chunk = runGenJob(generator, overlays, seed, msg.cx, msg.cz);
  const result: GenJobResult = { cx: msg.cx, cz: msg.cz, buffer: chunk.buffer };
  // A SharedArrayBuffer is posted by reference (it cannot be transferred); a plain
  // ArrayBuffer moves, avoiding the ~512 KB copy.
  (self as unknown as Worker).postMessage(result, shared ? [] : [result.buffer as ArrayBuffer]);
};
