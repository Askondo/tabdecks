// Pure TS tempo induction from an onset envelope — no Web Audio types.
//
// Input: onset envelope frames (one per ONSET_HOP samples, ~93.75 fps at 48 kHz).
// Method: autocorrelation over a sliding window with harmonic weighting picks
// the beat period (70–180 BPM); a comb alignment over recent frames picks the
// beat phase. Confidence reflects how dominant the periodicity is.

export interface TempoEstimate {
  bpm: number;
  /** Absolute frame index (fractional) of a recent beat. */
  anchorFrame: number;
  /** 0..1 — gate grid updates on this. */
  confidence: number;
}

export const BPM_MIN = 70;
export const BPM_MAX = 180;

export class TempoInducer {
  private readonly window: number[] = [];
  /** Absolute frame index of window[window.length-1]. */
  private lastFrame = -1;
  private readonly windowLen: number;

  constructor(
    /** Envelope frame rate in Hz (sampleRate / ONSET_HOP). */
    readonly frameRate: number,
    windowSeconds = 12,
  ) {
    this.windowLen = Math.round(windowSeconds * frameRate);
  }

  addFrames(values: number[] | Float32Array, firstFrame: number): void {
    // Tolerates gaps/replays by trusting the caller's absolute indexing only
    // for the anchor; envelope continuity assumes sequential feeding.
    for (let i = 0; i < values.length; i++) {
      this.window.push(values[i] as number);
      this.lastFrame = firstFrame + i;
    }
    const excess = this.window.length - this.windowLen;
    if (excess > 0) this.window.splice(0, excess);
  }

  estimate(): TempoEstimate | null {
    const n = this.window.length;
    const minLag = Math.max(2, Math.floor((60 * this.frameRate) / BPM_MAX));
    const maxLag = Math.ceil((60 * this.frameRate) / BPM_MIN);
    if (n < maxLag * 3) return null; // need ≥3 periods of the slowest tempo

    // Mean-removed envelope.
    let mean = 0;
    for (const v of this.window) mean += v;
    mean /= n;
    const env = this.window.map((v) => v - mean);

    // Energy for normalization.
    let energy = 0;
    for (const v of env) energy += v * v;
    if (energy < 1e-12) return null; // silence

    // Normalized ACF over the candidate lag range (+2× for harmonic scoring).
    const acf = new Float64Array(maxLag * 2 + 2);
    for (let lag = minLag; lag <= Math.min(maxLag * 2 + 1, n - 1); lag++) {
      let sum = 0;
      for (let i = lag; i < n; i++) sum += env[i]! * env[i - lag]!;
      acf[lag] = sum / energy;
    }

    // Harmonic-weighted period pick.
    let bestLag = minLag;
    let bestScore = -Infinity;
    let scoreSum = 0;
    let scoreCount = 0;
    for (let lag = minLag; lag <= maxLag; lag++) {
      const half = Math.round(lag / 2);
      const score =
        acf[lag]! +
        0.5 * (acf[lag * 2] ?? 0) +
        // Penalize half-tempo confusion: if the half lag is also strong, this
        // lag is probably the 2× harmonic of the true tempo.
        -0.25 * (half >= minLag ? acf[half]! : 0);
      scoreSum += score;
      scoreCount++;
      if (score > bestScore) {
        bestScore = score;
        bestLag = lag;
      }
    }

    // Parabolic interpolation around the ACF peak for sub-frame period.
    const y0 = acf[bestLag - 1] ?? acf[bestLag]!;
    const y1 = acf[bestLag]!;
    const y2 = acf[bestLag + 1] ?? acf[bestLag]!;
    const denom = y0 - 2 * y1 + y2;
    const shift = denom !== 0 ? Math.max(-0.5, Math.min(0.5, (0.5 * (y0 - y2)) / denom)) : 0;
    const period = bestLag + shift;

    // Phase: comb alignment over the most recent ~8 periods.
    const combPeriods = Math.min(8, Math.floor(n / bestLag) - 1);
    let bestOffset = 0;
    let bestComb = -Infinity;
    for (let offset = 0; offset < bestLag; offset++) {
      let sum = 0;
      for (let k = 0; k < combPeriods; k++) {
        const idx = n - 1 - offset - Math.round(k * period);
        if (idx >= 0) sum += this.window[idx]!;
      }
      if (sum > bestComb) {
        bestComb = sum;
        bestOffset = offset;
      }
    }

    const meanScore = scoreSum / Math.max(1, scoreCount);
    const spread = Math.max(0, bestScore - meanScore);
    // Confidence combines absolute periodicity strength (normalized ACF peak:
    // ~0.4–0.7 for beat-driven music, ~0.02 for noise — scale-invariant
    // because the ACF is energy-normalized) with peak dominance over the
    // candidate range. Calibrated by the unit tests.
    const peakStrength = Math.max(0, acf[bestLag]!);
    const confidence = Math.min(1, peakStrength * 2) * Math.min(1, spread * 8);

    return {
      bpm: (60 * this.frameRate) / period,
      anchorFrame: this.lastFrame - bestOffset,
      confidence,
    };
  }
}
