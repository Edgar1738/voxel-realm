import { parseVolume, type SoundFamily, type SoundKind } from './sounds';

const VOLUME_KEY = 'vr.volume';
const MUTED_KEY = 'vr.muted';
const DEFAULT_VOLUME = 0.6;

/** Per-family synth recipe: filtered noise burst plus an optional tonal thump. */
interface Recipe {
  /** Noise filter type and center/cutoff frequency (Hz). */
  filter: BiquadFilterType;
  freq: number;
  q?: number;
  /** Envelope length in seconds. */
  dur: number;
  /** Peak gain of the noise burst (pre-master). */
  gain: number;
  /** Optional tonal component underneath the noise. */
  tone?: { type: OscillatorType; freq: number; gain: number };
}

const RECIPES: Record<SoundFamily, Recipe> = {
  stone: {
    filter: 'lowpass',
    freq: 720,
    dur: 0.11,
    gain: 0.5,
    tone: { type: 'sine', freq: 170, gain: 0.22 },
  },
  dirt: { filter: 'lowpass', freq: 480, dur: 0.13, gain: 0.42 },
  sand: { filter: 'bandpass', freq: 1400, q: 0.8, dur: 0.16, gain: 0.38 },
  snow: { filter: 'lowpass', freq: 900, dur: 0.14, gain: 0.28 },
  grass: { filter: 'bandpass', freq: 2100, q: 0.6, dur: 0.13, gain: 0.32 },
  wood: {
    filter: 'bandpass',
    freq: 560,
    q: 2.2,
    dur: 0.12,
    gain: 0.48,
    tone: { type: 'triangle', freq: 240, gain: 0.2 },
  },
  glass: {
    filter: 'highpass',
    freq: 2600,
    dur: 0.18,
    gain: 0.42,
    tone: { type: 'sine', freq: 3400, gain: 0.12 },
  },
  water: { filter: 'bandpass', freq: 900, q: 1.2, dur: 0.24, gain: 0.4 },
};

/** Per-kind tweaks so break/place/step read as one material, not three sounds. */
const KIND_MODS: Record<SoundKind, { pitch: number; gain: number; dur: number }> = {
  break: { pitch: 1, gain: 1, dur: 1 },
  place: { pitch: 1.15, gain: 0.9, dur: 0.9 },
  step: { pitch: 1.05, gain: 0.4, dur: 0.65 },
};

/**
 * Procedural WebAudio sound engine — no asset files. All effects are short filtered-noise
 * bursts with Minecraft-style pitch randomization (±12% per play, so repeats never sound
 * identical). The AudioContext is created lazily on the first user gesture (autoplay policy)
 * and master volume/mute persist to localStorage.
 */
export class AudioEngine {
  private ctx: AudioContext | undefined;
  private master: GainNode | undefined;
  private noise: AudioBuffer | undefined;
  private volumeLevel: number;
  private mutedState: boolean;
  private readonly unlock = (): void => {
    void this.ensureContext()?.resume();
  };

  constructor() {
    let vol = DEFAULT_VOLUME;
    let muted = false;
    try {
      vol = parseVolume(localStorage.getItem(VOLUME_KEY), DEFAULT_VOLUME);
      muted = localStorage.getItem(MUTED_KEY) === 'on';
    } catch {
      /* localStorage unavailable — session defaults */
    }
    this.volumeLevel = vol;
    this.mutedState = muted;
    // Browsers block AudioContext until a gesture; these self-remove once it unlocks.
    window.addEventListener('pointerdown', this.unlock, { passive: true });
    window.addEventListener('keydown', this.unlock);
  }

  get volume(): number {
    return this.volumeLevel;
  }

  get muted(): boolean {
    return this.mutedState;
  }

  setVolume(v: number): void {
    this.volumeLevel = Math.max(0, Math.min(1, v));
    this.applyMaster();
    try {
      localStorage.setItem(VOLUME_KEY, String(this.volumeLevel));
    } catch {
      /* ignore persistence failure */
    }
  }

  setMuted(muted: boolean): void {
    this.mutedState = muted;
    this.applyMaster();
    try {
      localStorage.setItem(MUTED_KEY, muted ? 'on' : 'off');
    } catch {
      /* ignore persistence failure */
    }
  }

  /** Block interaction sound: filtered noise + tonal thump for the material family. */
  playBlock(family: SoundFamily, kind: SoundKind, volumeScale = 1): void {
    const ctx = this.playableContext();
    if (!ctx || !this.master) return;
    const recipe = RECIPES[family];
    const mod = KIND_MODS[kind];
    const pitch = mod.pitch * (0.88 + Math.random() * 0.24);
    const dur = recipe.dur * mod.dur;
    const gain = recipe.gain * mod.gain * volumeScale;
    const now = ctx.currentTime;

    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer(ctx);
    src.playbackRate.value = pitch;

    const filter = ctx.createBiquadFilter();
    filter.type = recipe.filter;
    filter.frequency.value = recipe.freq * pitch;
    if (recipe.q !== undefined) filter.Q.value = recipe.q;

    const env = ctx.createGain();
    env.gain.setValueAtTime(gain, now);
    env.gain.exponentialRampToValueAtTime(0.001, now + dur);

    src.connect(filter).connect(env).connect(this.master);
    src.start(now, Math.random(), dur + 0.02);

    if (recipe.tone) {
      const osc = ctx.createOscillator();
      osc.type = recipe.tone.type;
      osc.frequency.value = recipe.tone.freq * pitch;
      const toneEnv = ctx.createGain();
      toneEnv.gain.setValueAtTime(recipe.tone.gain * mod.gain * volumeScale, now);
      toneEnv.gain.exponentialRampToValueAtTime(0.001, now + dur);
      osc.connect(toneEnv).connect(this.master);
      osc.start(now);
      osc.stop(now + dur + 0.02);
    }
  }

  /** Short UI tick for hotbar slot changes. */
  playTick(): void {
    const ctx = this.playableContext();
    if (!ctx || !this.master) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = 1900 + Math.random() * 200;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.08, now);
    env.gain.exponentialRampToValueAtTime(0.001, now + 0.045);
    osc.connect(env).connect(this.master);
    osc.start(now);
    osc.stop(now + 0.06);
  }

  /** Fall-landing thud: a pitch-dropping low tone under a soft noise puff. */
  playLanding(volume: number): void {
    if (volume <= 0) return;
    const ctx = this.playableContext();
    if (!ctx || !this.master) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(110, now);
    osc.frequency.exponentialRampToValueAtTime(45, now + 0.14);
    const oscEnv = ctx.createGain();
    oscEnv.gain.setValueAtTime(0.5 * volume, now);
    oscEnv.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
    osc.connect(oscEnv).connect(this.master);
    osc.start(now);
    osc.stop(now + 0.18);

    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer(ctx);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 400;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.3 * volume, now);
    env.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    src.connect(filter).connect(env).connect(this.master);
    src.start(now, Math.random(), 0.14);
  }

  dispose(): void {
    window.removeEventListener('pointerdown', this.unlock);
    window.removeEventListener('keydown', this.unlock);
    void this.ctx?.close();
    this.ctx = undefined;
    this.master = undefined;
  }

  private applyMaster(): void {
    if (!this.master || !this.ctx) return;
    // Squared for a perceptually even slider; hard 0 when muted.
    const target = this.mutedState ? 0 : this.volumeLevel * this.volumeLevel;
    this.master.gain.setTargetAtTime(target, this.ctx.currentTime, 0.01);
  }

  private ensureContext(): AudioContext | undefined {
    if (this.ctx) return this.ctx;
    if (typeof AudioContext === 'undefined') return undefined;
    this.ctx = new AudioContext();
    this.master = this.ctx.createGain();
    this.master.connect(this.ctx.destination);
    this.applyMaster();
    return this.ctx;
  }

  /** Context ready to play right now (created, running, not muted); skips work otherwise. */
  private playableContext(): AudioContext | undefined {
    if (this.mutedState || this.volumeLevel === 0) return undefined;
    const ctx = this.ensureContext();
    if (!ctx) return undefined;
    if (ctx.state === 'suspended') {
      void ctx.resume();
      return undefined; // this sound is dropped; the context is warm for the next one
    }
    return ctx.state === 'running' ? ctx : undefined;
  }

  /** One second of cached white noise; every effect plays a random slice of it. */
  private noiseBuffer(ctx: AudioContext): AudioBuffer {
    if (!this.noise) {
      const len = ctx.sampleRate;
      this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    return this.noise;
  }
}
