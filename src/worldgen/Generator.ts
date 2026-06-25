import type { WorldSeed } from '../core/types';
import type { ChunkData } from '../world/ChunkData';

/** Produces base terrain for a chunk. Pure & deterministic in (seed, cx, cz). */
export interface Generator {
  generateBaseChunk(seed: WorldSeed, cx: number, cz: number): ChunkData;
}

/** A deterministic structure stamp applied after base terrain (e.g. the P4 castle). */
export type Overlay = (chunk: ChunkData, cx: number, cz: number, seed: WorldSeed) => void;

/** Applies overlays in order. M1 passes an empty list (the seam exists; no stamps yet). */
export function applyOverlays(
  chunk: ChunkData,
  cx: number,
  cz: number,
  seed: WorldSeed,
  overlays: Overlay[],
): void {
  for (const overlay of overlays) overlay(chunk, cx, cz, seed);
}
