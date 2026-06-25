/** Parameters for fractal (fBm) accumulation of a noise sampler. */
export interface FbmOptions {
  octaves: number;
  persistence: number; // amplitude falloff per octave (0..1)
  lacunarity: number; // frequency growth per octave (>1)
  frequency: number; // base frequency
}

/**
 * Fractal Brownian motion over a 2D noise `sample` in [-1, 1]. Sums octaves of
 * decreasing amplitude / increasing frequency and normalizes back into [-1, 1].
 * Pure and library-agnostic (the caller supplies the noise sampler).
 */
export function fbm2D(
  sample: (x: number, z: number) => number,
  x: number,
  z: number,
  opts: FbmOptions,
): number {
  let amplitude = 1;
  let frequency = opts.frequency;
  let sum = 0;
  let amplitudeSum = 0;
  for (let o = 0; o < opts.octaves; o++) {
    sum += amplitude * sample(x * frequency, z * frequency);
    amplitudeSum += amplitude;
    amplitude *= opts.persistence;
    frequency *= opts.lacunarity;
  }
  return sum / amplitudeSum;
}
