/**
 * Dev-only per-frame performance accumulator for the roam-smoothness work (P0).
 * Collects one {@link FrameSample} per rendered frame and summarizes them into
 * percentiles, totals, peaks, and long-frame counts. Pure and frame-rate agnostic:
 * the live HUD reads {@link recentSummary} each tick and `__vr.bench` reads
 * {@link summary} after a scripted roam.
 */
export interface FrameSample {
  /** Wall-clock time of the whole frame (inter-frame dt, in ms). */
  frameMs: number;
  /** Time spent inside ChunkManager.update this frame (ms). */
  updateMs: number;
  /** Chunks generated this frame. */
  genCount: number;
  /** meshChunk calls this frame (includes unbudgeted neighbor remeshes). */
  meshCount: number;
}

export interface PercentileSummary {
  p50: number;
  p95: number;
  p99: number;
  max: number;
}

export interface ProfilerSummary {
  framesSampled: number;
  meanFps: number;
  frameMs: PercentileSummary;
  updateMs: PercentileSummary;
  totalGens: number;
  totalMeshes: number;
  peakGensPerFrame: number;
  peakMeshesPerFrame: number;
  /** Frames slower than 16.7ms (below 60fps). */
  longFrames16: number;
  /** Frames slower than 33ms (below 30fps). */
  longFrames33: number;
}

const DEFAULT_CAPACITY = 4096;
const FRAME_16 = 1000 / 60; // 16.67ms
const FRAME_33 = 1000 / 30; // 33.33ms

/** Nearest-rank percentile of an already-sorted ascending array; 0 for empty. */
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const rank = Math.ceil((p / 100) * sorted.length);
  const index = Math.min(Math.max(rank - 1, 0), sorted.length - 1);
  return sorted[index];
}

function emptyPercentiles(): PercentileSummary {
  return { p50: 0, p95: 0, p99: 0, max: 0 };
}

function percentiles(values: number[]): PercentileSummary {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    p99: percentile(sorted, 99),
    max: percentile(sorted, 100),
  };
}

export class FrameProfiler {
  private samples: FrameSample[] = [];

  constructor(private readonly capacity = DEFAULT_CAPACITY) {}

  push(sample: FrameSample): void {
    this.samples.push(sample);
    if (this.samples.length > this.capacity) this.samples.shift();
  }

  reset(): void {
    this.samples = [];
  }

  get size(): number {
    return this.samples.length;
  }

  /** Summary over every retained sample. */
  summary(): ProfilerSummary {
    return summarize(this.samples);
  }

  /** Summary over the most recent `count` samples (used by the live HUD). */
  recentSummary(count: number): ProfilerSummary {
    return summarize(this.samples.slice(-Math.max(0, count)));
  }
}

function summarize(samples: readonly FrameSample[]): ProfilerSummary {
  if (samples.length === 0) {
    return {
      framesSampled: 0,
      meanFps: 0,
      frameMs: emptyPercentiles(),
      updateMs: emptyPercentiles(),
      totalGens: 0,
      totalMeshes: 0,
      peakGensPerFrame: 0,
      peakMeshesPerFrame: 0,
      longFrames16: 0,
      longFrames33: 0,
    };
  }

  let frameMsSum = 0;
  let totalGens = 0;
  let totalMeshes = 0;
  let peakGensPerFrame = 0;
  let peakMeshesPerFrame = 0;
  let longFrames16 = 0;
  let longFrames33 = 0;
  const frameMsValues: number[] = [];
  const updateMsValues: number[] = [];

  for (const s of samples) {
    frameMsSum += s.frameMs;
    totalGens += s.genCount;
    totalMeshes += s.meshCount;
    if (s.genCount > peakGensPerFrame) peakGensPerFrame = s.genCount;
    if (s.meshCount > peakMeshesPerFrame) peakMeshesPerFrame = s.meshCount;
    if (s.frameMs > FRAME_16) longFrames16++;
    if (s.frameMs > FRAME_33) longFrames33++;
    frameMsValues.push(s.frameMs);
    updateMsValues.push(s.updateMs);
  }

  return {
    framesSampled: samples.length,
    meanFps: frameMsSum > 0 ? (1000 * samples.length) / frameMsSum : 0,
    frameMs: percentiles(frameMsValues),
    updateMs: percentiles(updateMsValues),
    totalGens,
    totalMeshes,
    peakGensPerFrame,
    peakMeshesPerFrame,
    longFrames16,
    longFrames33,
  };
}
