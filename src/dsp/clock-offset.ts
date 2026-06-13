// Pure clock-offset estimator — maps the extension's local clock to the
// Ableton Link beat timeline, rejecting localhost transit jitter with a
// median filter. No Web Audio types; unit-tested.

function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/**
 * Model: linkBeat(t) = bps·t + phase, where `phase` is the median of recent
 * (linkBeat − bps·t) samples. Transit-delay jitter perturbs each sample's
 * apparent phase; the median rejects it (and single outliers). The window is
 * reset on a tempo change so stale-tempo phases don't pollute the estimate.
 */
export class LinkClockEstimator {
  private bps = 2; // 120 BPM default
  private samples: number[] = [];
  private readonly window: number;

  constructor(window = 9) {
    this.window = Math.max(1, window);
  }

  /** Feed a status sample: Link beat position read at `localTime` (seconds). */
  update(linkBeat: number, bpm: number, localTime: number): void {
    const bps = bpm / 60;
    if (Math.abs(bps - this.bps) > 1e-4) {
      this.bps = bps;
      this.samples = []; // tempo changed — phases relative to old bps are stale
    }
    const phase = linkBeat - this.bps * localTime;
    this.samples.push(phase);
    if (this.samples.length > this.window) this.samples.shift();
  }

  get beatsPerSecond(): number {
    return this.bps;
  }

  private phase(): number {
    return median(this.samples);
  }

  /** Projected Link beat at a local time (seconds). */
  beatAt(localTime: number): number {
    return this.bps * localTime + this.phase();
  }

  /** True once enough samples have accumulated for a stable median. */
  get locked(): boolean {
    return this.samples.length >= this.window;
  }

  reset(): void {
    this.samples = [];
  }
}
