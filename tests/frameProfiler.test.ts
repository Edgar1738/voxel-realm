import { describe, it, expect } from 'vitest';
import { FrameProfiler, type FrameSample } from '../src/app/FrameProfiler';

/** Four hand-picked frames with deterministic percentiles (nearest-rank). */
const SAMPLES: FrameSample[] = [
  { frameMs: 10, updateMs: 1, genCount: 2, meshCount: 2 },
  { frameMs: 20, updateMs: 2, genCount: 0, meshCount: 5 },
  { frameMs: 30, updateMs: 3, genCount: 1, meshCount: 0 },
  { frameMs: 100, updateMs: 4, genCount: 0, meshCount: 10 },
];

function pushAll(p: FrameProfiler, samples: FrameSample[]): void {
  for (const s of samples) p.push(s);
}

describe('FrameProfiler', () => {
  it('summarizes frame/update percentiles, totals, peaks, and long frames', () => {
    const p = new FrameProfiler();
    pushAll(p, SAMPLES);

    const s = p.summary();
    expect(s.framesSampled).toBe(4);
    // sum(frameMs) = 160ms over 4 frames -> 25 fps
    expect(s.meanFps).toBe(25);
    // sorted frameMs [10,20,30,100]: nearest-rank p50=20, p95=100, p99=100, max=100
    expect(s.frameMs).toEqual({ p50: 20, p95: 100, p99: 100, max: 100 });
    // sorted updateMs [1,2,3,4]: p50=2, p95=4, p99=4, max=4
    expect(s.updateMs).toEqual({ p50: 2, p95: 4, p99: 4, max: 4 });
    expect(s.totalGens).toBe(3);
    expect(s.totalMeshes).toBe(17);
    expect(s.peakGensPerFrame).toBe(2);
    expect(s.peakMeshesPerFrame).toBe(10);
    // >16.7ms: 20,30,100 -> 3 ; >33ms: 100 -> 1
    expect(s.longFrames16).toBe(3);
    expect(s.longFrames33).toBe(1);
  });

  it('returns a zeroed summary when empty', () => {
    const s = new FrameProfiler().summary();
    expect(s).toEqual({
      framesSampled: 0,
      meanFps: 0,
      frameMs: { p50: 0, p95: 0, p99: 0, max: 0 },
      updateMs: { p50: 0, p95: 0, p99: 0, max: 0 },
      totalGens: 0,
      totalMeshes: 0,
      peakGensPerFrame: 0,
      peakMeshesPerFrame: 0,
      longFrames16: 0,
      longFrames33: 0,
    });
  });

  it('reset() clears all samples', () => {
    const p = new FrameProfiler();
    pushAll(p, SAMPLES);
    p.reset();
    expect(p.size).toBe(0);
    expect(p.summary().framesSampled).toBe(0);
  });

  it('is a bounded ring buffer that keeps only the most recent samples', () => {
    const p = new FrameProfiler(2);
    pushAll(p, SAMPLES); // capacity 2 -> keeps the last two (30 and 100)
    expect(p.size).toBe(2);
    const s = p.summary();
    expect(s.framesSampled).toBe(2);
    expect(s.frameMs.max).toBe(100);
    expect(s.totalMeshes).toBe(10); // 0 + 10 from the last two frames
  });

  it('recentSummary(n) summarizes only the last n samples', () => {
    const p = new FrameProfiler();
    pushAll(p, SAMPLES);
    const s = p.recentSummary(2); // last two frames: 30 and 100
    expect(s.framesSampled).toBe(2);
    expect(s.frameMs.max).toBe(100);
    expect(s.peakMeshesPerFrame).toBe(10);
    expect(s.totalGens).toBe(1); // 1 + 0
  });
});
