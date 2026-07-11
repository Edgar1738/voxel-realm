import { describe, it, expect } from 'vitest';
import { BootStats } from '../src/app/bootStats';

/** A controllable clock: each now() call returns the next scripted value (then the last). */
function clock(...times: number[]): () => number {
  let i = 0;
  return () => times[Math.min(i++, times.length - 1)];
}

describe('BootStats', () => {
  it('records begin/end phases with durations', () => {
    const stats = new BootStats(clock(0, 10, 25)); // t0=0, begin=10, end=25
    stats.begin('load');
    stats.end('load');
    const report = stats.report();
    expect(report.phases).toEqual([{ name: 'load', ms: 15 }]);
    expect(report.totalMs).toBe(25);
  });

  it('span times an async step and still ends the phase on rejection', async () => {
    const stats = new BootStats(clock(0, 5, 12, 20, 30));
    await stats.span('ok', async () => 'value');
    await expect(stats.span('fails', () => Promise.reject(new Error('boom')))).rejects.toThrow(
      'boom',
    );
    const names = stats.report().phases.map((p) => p.name);
    expect(names).toEqual(['ok', 'fails']);
  });

  it('end without begin is ignored', () => {
    const stats = new BootStats(clock(0));
    stats.end('never-started');
    expect(stats.report().phases).toEqual([]);
  });

  it('events record ms since boot start and only the first occurrence counts', () => {
    const stats = new BootStats(clock(100, 140, 900));
    stats.event('first-frame'); // at 140 → 40ms after t0
    stats.event('first-frame'); // at 900 → ignored
    expect(stats.report().events).toEqual([{ name: 'first-frame', atMs: 40 }]);
    expect(stats.has('first-frame')).toBe(true);
    expect(stats.has('streamed')).toBe(false);
  });

  it('totalMs tracks the latest phase end or event', () => {
    const stats = new BootStats(clock(0, 10, 20, 300));
    stats.begin('a');
    stats.end('a'); // ends at 20
    stats.event('late'); // at 300
    expect(stats.report().totalMs).toBe(300);
  });
});
