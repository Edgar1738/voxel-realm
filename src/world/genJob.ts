import { applyOverlays } from '../worldgen/Generator';
import type { Generator, Overlay } from '../worldgen/Generator';
import type { ChunkData } from './ChunkData';
import type { WorldSeed } from '../core/types';

/**
 * A request to generate one base chunk (terrain + overlays, pre-deltas, pre-light).
 * No staleness tag is needed: base chunks are deterministic from (preset, seed, cx, cz),
 * so a duplicate in-flight job yields identical bytes and the manager keeps the first.
 */
export interface GenJob {
  cx: number;
  cz: number;
}

/** A finished base chunk: the raw backing buffer at the canonical chunk layout. */
export interface GenJobResult {
  cx: number;
  cz: number;
  buffer: ArrayBufferLike;
}

/** The worker's init payload: everything needed to rebuild the deterministic generator. */
export interface GenWorkerInit {
  kind: 'init';
  preset: string;
  seed: WorldSeed;
  /** Allocate chunks over SharedArrayBuffers (so mesh workers keep zero-copy reads). */
  sharedBuffers: boolean;
}

export interface GenWorkerJobMessage extends GenJob {
  kind: 'job';
}

export type GenWorkerMessage = GenWorkerInit | GenWorkerJobMessage;

/**
 * Runs one generation job: base terrain + overlay stamps. Deterministic from
 * (generator, seed, cx, cz) — the exact code path `ChunkManager.ensureGenerated` uses,
 * shared by the worker and the synchronous fallback so output stays byte-identical.
 * Deltas, hasShaped/maxSolidY recompute, and lighting stay on the main thread (they
 * depend on saved edits and already-loaded neighbors).
 */
export function runGenJob(
  generator: Generator,
  overlays: Overlay[],
  seed: WorldSeed,
  cx: number,
  cz: number,
): ChunkData {
  const chunk = generator.generateBaseChunk(seed, cx, cz);
  applyOverlays(chunk, cx, cz, seed, overlays);
  return chunk;
}
