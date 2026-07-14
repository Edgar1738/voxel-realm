/** Tuning for the adaptive view-distance governor. All frame times are in ms. */
export interface GovernorOptions {
  /** Lower bound on view distance (never shrink below). */
  minVd: number;
  /** Upper bound on view distance (never grow above). */
  maxVd: number;
  /** Grow when the window's p95 frame time is at or below this (still holding ~60 FPS). */
  growAtOrBelowMs: number;
  /** Shrink when the window's p95 frame time is at or above this (dropped below ~45 FPS). */
  shrinkAtOrAboveMs: number;
  /** Number of recent frames the p95 is computed over. */
  windowFrames: number;
  /** Frames to wait after a grow before evaluating again. */
  growCooldownFrames: number;
  /** Frames to wait after a shrink before evaluating again (longer, to avoid flapping). */
  shrinkCooldownFrames: number;
}

export const DEFAULT_GOVERNOR_OPTIONS: Omit<GovernorOptions, 'minVd' | 'maxVd'> = {
  growAtOrBelowMs: 18,
  shrinkAtOrAboveMs: 22,
  windowFrames: 60,
  growCooldownFrames: 90,
  shrinkCooldownFrames: 240,
};

/** Nearest-rank p95 of a numeric array (does not mutate the input). */
function p95(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil(0.95 * sorted.length);
  return sorted[Math.min(Math.max(rank - 1, 0), sorted.length - 1)];
}

/**
 * Adaptive view-distance controller. Grows the loaded radius while frames hold ~60 FPS and
 * shrinks it when they drop, converging on the largest radius the machine sustains. Pure and
 * framework-free: fed one frame time per tick, returns a new view distance the tick it changes.
 */
export class ViewDistanceGovernor {
  private readonly opts: GovernorOptions;
  private readonly window: number[] = [];
  private cooldown = 0;
  private current: number;

  constructor(
    bounds: { minVd: number; maxVd: number } & Partial<GovernorOptions>,
    initial: number,
  ) {
    this.opts = { ...DEFAULT_GOVERNOR_OPTIONS, ...bounds };
    this.current = Math.max(this.opts.minVd, Math.min(this.opts.maxVd, initial));
  }

  get viewDistance(): number {
    return this.current;
  }

  /**
   * Lower (or raise) the adaptive ceiling. Clamps the current distance into the new range and
   * clears the measurement window — samples taken under a different cap shouldn't decide the next
   * step. Returns the current view distance so the caller can apply it to the chunk manager + fog
   * in one place. Raising the cap lets the governor grow back up naturally over the next windows.
   */
  setMaxVd(maxVd: number): number {
    this.opts.maxVd = Math.max(this.opts.minVd, Math.floor(maxVd));
    if (this.current > this.opts.maxVd) this.current = this.opts.maxVd;
    this.window.length = 0;
    return this.current;
  }

  /**
   * Feeds one frame. Returns the new view distance if it changed this tick, else undefined.
   * Never adjusts while `streaming` (frame times are transiently inflated by chunk loading)
   * or during the post-change cooldown.
   */
  sample(frameMs: number, streaming: boolean): number | undefined {
    if (this.cooldown > 0) {
      this.cooldown--;
      return undefined;
    }

    if (streaming) return undefined;

    this.window.push(frameMs);
    if (this.window.length > this.opts.windowFrames) this.window.shift();

    if (this.window.length < this.opts.windowFrames) return undefined;

    const measured = p95(this.window);

    if (measured >= this.opts.shrinkAtOrAboveMs && this.current > this.opts.minVd) {
      this.current--;
      this.cooldown = this.opts.shrinkCooldownFrames;
      this.window.length = 0;
      return this.current;
    }
    if (measured <= this.opts.growAtOrBelowMs && this.current < this.opts.maxVd) {
      this.current++;
      this.cooldown = this.opts.growCooldownFrames;
      this.window.length = 0;
      return this.current;
    }
    return undefined;
  }
}
