// Pure TS transport DSP — no Web Audio types. Runs inside the AudioWorklet
// (src/entrypoints/transport-worklet.ts) and in node unit tests.
import { RingBuffer } from './ring-buffer';

export type TransportGesture = 'none' | 'brake' | 'stutter';

/**
 * Per-deck transport: always records the incoming live stream into a rolling
 * history; output follows a playhead over that history.
 *
 * Phase 5 scope — LIVE passthrough plus two gestures:
 *  - brake:   read-rate ramps 1→0 over brakeTime (linear deceleration =
 *             constant turntable braking torque); fractional interpolated
 *             reads produce the pitch drop. Output gain fades only at
 *             near-zero rates to avoid a DC sample-hold.
 *  - stutter: loops the most recent slice with an equal-power seam crossfade
 *             (the fade-in leg reads the pre-roll before the slice).
 * Release jump-cuts back to live through a short fade (no clicks).
 */
export class TransportDsp {
  private readonly rings: RingBuffer[];
  private readonly xfadeLen: number;
  private readonly lastOut: number[];
  private zeroBlock = new Float32Array(0);

  private gesture: TransportGesture = 'none';
  private rate = 1;
  private readPos = 0;
  private brakeTime = 0.8;
  /** Stutter loop: [loopEnd - loopLen, loopEnd) in absolute samples. */
  private loopEnd = 0;
  private loopLen = 0;
  private loopPos = 0;
  /** Samples remaining of the post-discontinuity fade back to live. */
  private fadeRemaining = 0;

  constructor(
    readonly sampleRate: number,
    historySeconds: number,
    readonly channels = 2,
  ) {
    const capacity = Math.ceil(historySeconds * sampleRate);
    this.rings = Array.from({ length: channels }, () => new RingBuffer(capacity));
    this.lastOut = new Array<number>(channels).fill(0);
    this.xfadeLen = Math.max(8, Math.round(0.005 * sampleRate));
  }

  get currentGesture(): TransportGesture {
    return this.gesture;
  }

  setBrakeTime(seconds: number): void {
    this.brakeTime = Math.min(10, Math.max(0.05, seconds));
  }

  brake(): void {
    if (this.gesture === 'brake') return;
    // Starts from the live edge at rate 1 — seamless from passthrough.
    this.readPos = this.rings[0]!.written;
    this.rate = 1;
    this.gesture = 'brake';
  }

  stutter(sliceSeconds: number): void {
    const len = Math.max(this.xfadeLen * 2, Math.round(sliceSeconds * this.sampleRate));
    this.loopEnd = this.rings[0]!.written;
    this.loopLen = len;
    this.loopPos = 0;
    this.gesture = 'stutter';
  }

  release(): void {
    if (this.gesture === 'none') return;
    this.gesture = 'none';
    this.fadeRemaining = this.xfadeLen;
  }

  /**
   * input: per-channel blocks (null = source disconnected → silence is
   * recorded so history time stays continuous). output: per-channel blocks.
   */
  processBlock(input: Float32Array[] | null, output: Float32Array[]): void {
    const n = output[0]?.length ?? 0;
    if (n === 0) return;

    if (this.zeroBlock.length !== n) this.zeroBlock = new Float32Array(n);

    // 1. Record. Mono input feeds both channels.
    for (let ch = 0; ch < this.channels; ch++) {
      const src = input ? (input[ch] ?? input[0] ?? this.zeroBlock) : this.zeroBlock;
      this.rings[ch]!.write(src, n);
    }

    // 2. Play.
    switch (this.gesture) {
      case 'none':
        this.processLive(input, output, n);
        break;
      case 'brake':
        this.processBrake(output, n);
        break;
      case 'stutter':
        this.processStutter(output, n);
        break;
    }

    for (let ch = 0; ch < this.channels; ch++) {
      this.lastOut[ch] = output[ch]?.[n - 1] ?? 0;
    }
  }

  private processLive(input: Float32Array[] | null, output: Float32Array[], n: number): void {
    for (let ch = 0; ch < this.channels; ch++) {
      const out = output[ch];
      if (!out) continue;
      const src = input ? (input[ch] ?? input[0] ?? this.zeroBlock) : this.zeroBlock;
      const held = this.lastOut[ch]!;
      for (let i = 0; i < n; i++) {
        let v = src[i]!;
        if (this.fadeRemaining > 0) {
          const w = 1 - (this.fadeRemaining - i) / this.xfadeLen;
          if (w < 1) v = held * (1 - w) + v * w;
        }
        out[i] = v;
      }
    }
    this.fadeRemaining = Math.max(0, this.fadeRemaining - n);
  }

  private processBrake(output: Float32Array[], n: number): void {
    const dRate = 1 / (this.brakeTime * this.sampleRate);
    for (let i = 0; i < n; i++) {
      this.rate = Math.max(0, this.rate - dRate);
      this.readPos += this.rate;
      // Unity gain until the platter nearly stops, then fade out the
      // sample-hold (a stopped needle is silent, not DC).
      const gain = Math.min(1, this.rate * 8);
      for (let ch = 0; ch < this.channels; ch++) {
        const out = output[ch];
        if (out) out[i] = this.rings[ch]!.readAt(this.readPos) * gain;
      }
    }
  }

  private processStutter(output: Float32Array[], n: number): void {
    const loopStart = this.loopEnd - this.loopLen;
    const fadeStart = this.loopLen - this.xfadeLen;
    for (let i = 0; i < n; i++) {
      const pos = loopStart + this.loopPos;
      let a = 1;
      let b = 0;
      if (this.loopPos >= fadeStart) {
        const w = ((this.loopPos - fadeStart) / this.xfadeLen) * (Math.PI / 2);
        a = Math.cos(w);
        b = Math.sin(w);
      }
      for (let ch = 0; ch < this.channels; ch++) {
        const out = output[ch];
        if (!out) continue;
        const ring = this.rings[ch]!;
        out[i] =
          b === 0
            ? ring.readAt(pos)
            : ring.readAt(pos) * a + ring.readAt(pos - this.loopLen) * b;
      }
      this.loopPos++;
      if (this.loopPos >= this.loopLen) this.loopPos = 0;
    }
  }
}
