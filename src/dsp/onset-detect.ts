// Pure TS onset-envelope detector — no Web Audio types. Runs inside the
// AudioWorklet on the mono-mixed input and in node unit tests.
//
// Model: 3 parallel bands (kick / mid / hat) via cascaded one-pole filters.
// Per 512-sample hop, each band contributes positive energy flux
// (rise in band RMS vs the previous hop). Frames align 1:1 with the waveform
// peak buckets (PEAK_BUCKET = 512), so frame index N covers absolute samples
// [N·512, (N+1)·512).

export const ONSET_HOP = 512;

/** One-pole lowpass: y += k·(x − y). */
class OnePole {
  private y = 0;
  private readonly k: number;

  constructor(sampleRate: number, cutoffHz: number) {
    this.k = 1 - Math.exp((-2 * Math.PI * cutoffHz) / sampleRate);
  }

  process(x: number): number {
    this.y += this.k * (x - this.y);
    return this.y;
  }
}

export class OnsetDetector {
  // Band filters (cascaded one-poles for steeper rolloff).
  private readonly low1: OnePole;
  private readonly low2: OnePole;
  private readonly mid1: OnePole;
  private readonly mid2: OnePole;
  private readonly hiSplit: OnePole;

  // Per-hop energy accumulators.
  private eLow = 0;
  private eMid = 0;
  private eHigh = 0;
  private fill = 0;

  // Previous hop band levels (for flux).
  private prevLow = 0;
  private prevMid = 0;
  private prevHigh = 0;

  private readonly frames: number[] = [];

  constructor(readonly sampleRate: number) {
    this.low1 = new OnePole(sampleRate, 150);
    this.low2 = new OnePole(sampleRate, 150);
    this.mid1 = new OnePole(sampleRate, 2000);
    this.mid2 = new OnePole(sampleRate, 2000);
    this.hiSplit = new OnePole(sampleRate, 5000);
  }

  /** Feed mono samples; completed hop frames accumulate internally. */
  process(mono: Float32Array, length = mono.length): void {
    for (let i = 0; i < length; i++) {
      const x = mono[i]!;
      const low = this.low2.process(this.low1.process(x));
      const midFull = this.mid2.process(this.mid1.process(x));
      const mid = midFull - low; // 150–2000 Hz
      const high = x - this.hiSplit.process(x); // > 5 kHz

      this.eLow += low * low;
      this.eMid += mid * mid;
      this.eHigh += high * high;

      if (++this.fill === ONSET_HOP) this.completeHop();
    }
  }

  private completeHop(): void {
    const low = Math.sqrt(this.eLow / ONSET_HOP);
    const mid = Math.sqrt(this.eMid / ONSET_HOP);
    const high = Math.sqrt(this.eHigh / ONSET_HOP);

    // Positive flux only — onsets are rises; decays carry no beat info.
    const flux =
      2.0 * Math.max(0, low - this.prevLow) +
      1.0 * Math.max(0, mid - this.prevMid) +
      1.5 * Math.max(0, high - this.prevHigh);

    this.frames.push(flux);
    this.prevLow = low;
    this.prevMid = mid;
    this.prevHigh = high;
    this.eLow = this.eMid = this.eHigh = 0;
    this.fill = 0;
  }

  /** Returns and clears completed envelope frames. */
  drainFrames(): number[] {
    return this.frames.splice(0, this.frames.length);
  }
}
