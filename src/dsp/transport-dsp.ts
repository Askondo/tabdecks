// Pure TS transport DSP — no Web Audio types. Runs inside the AudioWorklet
// (src/entrypoints/transport-worklet.ts) and in node unit tests.
import { RingBuffer } from './ring-buffer';

export type TransportGesture = 'none' | 'brake' | 'stutter';
export type TransportMode = 'live' | 'timeshift' | 'track';

export interface TransportStatus {
  mode: TransportMode;
  gesture: TransportGesture;
  /** Seconds the playhead is behind the live edge. */
  behind: number;
  /** User rate target (varispeed). */
  rate: number;
  playing: boolean;
  /** Absolute sample positions (for cues / waveform addressing). */
  readPos: number;
  written: number;
  oldest: number;
  trackStart: number | null;
  trackEnd: number | null;
}

/**
 * Per-deck transport: always records the incoming live stream into a rolling
 * history; output follows a playhead over that history.
 *
 * Modes:
 *  - live:      direct passthrough (zero added latency), playhead pinned.
 *  - timeshift: playhead anywhere in history — pause, scrub, varispeed.
 *               Speeding past 1× clamps at the live edge (can't read the future).
 *  - track:     a marked [start, end] region — random access, auto-pause at end.
 *
 * Gestures overlay any mode:
 *  - brake:   read-rate ramps →0 over brakeTime (linear deceleration = constant
 *             turntable braking torque); interpolated reads give the pitch drop.
 *  - stutter: loops the most recent slice with an equal-power seam crossfade.
 * Release returns to the pre-gesture mode (live edge in LIVE; in-place otherwise).
 *
 * All discontinuities (seek, jump-to-live, gesture release) pass through a
 * short fade; rate changes are smoothed — no clicks by construction.
 */
export class TransportDsp {
  private readonly rings: RingBuffer[];
  private readonly xfadeLen: number;
  private readonly lastOut: number[];
  private readonly rateSmoothing: number;
  private zeroBlock = new Float32Array(0);

  private mode: TransportMode = 'live';
  private gesture: TransportGesture = 'none';
  private preGestureMode: TransportMode = 'live';

  private readPos = 0;
  /** Smoothed actual rate the playhead moves at. */
  private currentRate = 1;
  /** User varispeed target while playing (timeshift/track). */
  private userRate = 1;
  private playing = true;

  private brakeTime = 0.8;
  private brakeRate = 0;

  /** Stutter loop: [loopEnd - loopLen, loopEnd) in absolute samples. */
  private loopEnd = 0;
  private loopLen = 0;
  private loopPos = 0;

  private trackStart: number | null = null;
  private trackEnd: number | null = null;

  /** Samples remaining of the post-discontinuity fade. */
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
    // ~10 ms time constant for rate changes (pause/play/varispeed).
    this.rateSmoothing = 1 - Math.exp(-1 / (0.01 * sampleRate));
  }

  // ── Status ───────────────────────────────────────────────────────────────

  get status(): TransportStatus {
    const written = this.rings[0]!.written;
    const readPos = this.mode === 'live' && this.gesture === 'none' ? written : this.readPos;
    return {
      mode: this.mode,
      gesture: this.gesture,
      behind: Math.max(0, (written - readPos) / this.sampleRate),
      rate: this.userRate,
      playing: this.playing,
      readPos,
      written,
      oldest: this.rings[0]!.oldest,
      trackStart: this.trackStart,
      trackEnd: this.trackEnd,
    };
  }

  // ── Gestures ─────────────────────────────────────────────────────────────

  setBrakeTime(seconds: number): void {
    this.brakeTime = Math.min(10, Math.max(0.05, seconds));
  }

  brake(): void {
    if (this.gesture !== 'none') return;
    this.preGestureMode = this.mode;
    if (this.mode === 'live') this.readPos = this.rings[0]!.written;
    // Brake decelerates from whatever speed the platter currently has.
    this.brakeRate = this.mode === 'live' ? 1 : this.currentRate;
    this.gesture = 'brake';
  }

  stutter(sliceSeconds: number): void {
    if (this.gesture === 'stutter') return;
    this.preGestureMode = this.gesture === 'none' ? this.mode : this.preGestureMode;
    const len = Math.max(this.xfadeLen * 2, Math.round(sliceSeconds * this.sampleRate));
    this.loopEnd = this.mode === 'live' ? this.rings[0]!.written : this.readPos;
    this.loopLen = len;
    this.loopPos = 0;
    this.gesture = 'stutter';
  }

  release(): void {
    if (this.gesture === 'none') return;
    const wasStutter = this.gesture === 'stutter';
    this.gesture = 'none';
    if (this.preGestureMode === 'live') {
      this.mode = 'live';
    } else {
      // Resume in place: brake left readPos where it stopped; stutter
      // continues from the loop end.
      this.mode = this.preGestureMode;
      if (wasStutter) this.readPos = this.loopEnd;
      this.currentRate = 0; // ramps back up to userRate if playing
    }
    this.startFade();
  }

  // ── Timeshift / track controls ───────────────────────────────────────────

  pause(): void {
    this.enterTimeshiftIfLive();
    this.playing = false;
  }

  play(): void {
    this.enterTimeshiftIfLive();
    this.playing = true;
  }

  /** Varispeed target, clamped to [0.5, 2]. Live mode is unaffected until
   *  the deck enters timeshift/track. */
  setRate(rate: number): void {
    this.userRate = Math.min(2, Math.max(0.5, rate));
  }

  /** Scrub to `seconds` behind the live edge (enters timeshift). */
  seekBehind(seconds: number): void {
    this.enterTimeshiftIfLive();
    const written = this.rings[0]!.written;
    this.readPos = this.clampToHistory(written - seconds * this.sampleRate);
    this.startFade();
  }

  /** Jump to an absolute sample position (cues, track seeking). */
  seekAbs(pos: number): void {
    this.enterTimeshiftIfLive();
    this.readPos = this.clampToHistory(pos);
    this.startFade();
  }

  jumpLive(): void {
    this.gesture = 'none';
    this.mode = 'live';
    this.playing = true;
    this.startFade();
  }

  /** First call marks the track start; second marks the end and flips the
   *  deck into track mode, paused at the start. */
  trackMark(): void {
    const written = this.rings[0]!.written;
    if (this.trackStart === null || this.trackEnd !== null) {
      this.trackStart = written;
      this.trackEnd = null;
      return;
    }
    this.trackEnd = written;
    this.mode = 'track';
    this.playing = false;
    this.readPos = this.clampToHistory(this.trackStart);
    this.startFade();
  }

  trackRestart(): void {
    if (this.mode !== 'track' || this.trackStart === null) return;
    this.readPos = this.clampToHistory(this.trackStart);
    this.startFade();
  }

  /** Leave track mode (markers kept), back to live. */
  trackExit(): void {
    if (this.mode === 'track') this.jumpLive();
  }

  // ── Processing ───────────────────────────────────────────────────────────

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
    if (this.gesture === 'brake') this.processBrake(output, n);
    else if (this.gesture === 'stutter') this.processStutter(output, n);
    else if (this.mode === 'live') this.processLive(input, output, n);
    else this.processPlayhead(output, n);

    for (let ch = 0; ch < this.channels; ch++) {
      this.lastOut[ch] = output[ch]?.[n - 1] ?? 0;
    }
  }

  // ── Internals ────────────────────────────────────────────────────────────

  private enterTimeshiftIfLive(): void {
    if (this.mode !== 'live') return;
    this.mode = 'timeshift';
    this.readPos = this.rings[0]!.written;
    this.currentRate = 1;
  }

  private clampToHistory(pos: number): number {
    const ring = this.rings[0]!;
    return Math.min(ring.written - 1, Math.max(ring.oldest, pos));
  }

  private startFade(): void {
    this.fadeRemaining = this.xfadeLen;
  }

  private fadeWeight(i: number): number {
    if (this.fadeRemaining <= 0) return 1;
    const w = 1 - (this.fadeRemaining - i) / this.xfadeLen;
    return w < 1 ? Math.max(0, w) : 1;
  }

  private processLive(input: Float32Array[] | null, output: Float32Array[], n: number): void {
    for (let ch = 0; ch < this.channels; ch++) {
      const out = output[ch];
      if (!out) continue;
      const src = input ? (input[ch] ?? input[0] ?? this.zeroBlock) : this.zeroBlock;
      const held = this.lastOut[ch]!;
      for (let i = 0; i < n; i++) {
        const w = this.fadeWeight(i);
        out[i] = w >= 1 ? src[i]! : held * (1 - w) + src[i]! * w;
      }
    }
    this.fadeRemaining = Math.max(0, this.fadeRemaining - n);
  }

  /** Timeshift/track playback: smoothed varispeed, live-edge / track-end clamps. */
  private processPlayhead(output: Float32Array[], n: number): void {
    const liveEdge = () => this.rings[0]!.written - n + 0; // conservative edge
    const trackEnd = this.mode === 'track' ? this.trackEnd : null;

    for (let i = 0; i < n; i++) {
      const target = this.playing ? this.userRate : 0;
      this.currentRate += (target - this.currentRate) * this.rateSmoothing;
      this.readPos += this.currentRate;

      // Can't read the future: pin to the live edge (writes advance 1/sample,
      // so a pinned playhead effectively rides at 1×).
      const edge = liveEdge() + i;
      if (this.readPos > edge) this.readPos = edge;

      // Track end: hold and auto-pause.
      if (trackEnd !== null && this.readPos >= trackEnd) {
        this.readPos = trackEnd;
        this.playing = false;
      }

      const gain = Math.min(1, Math.abs(this.currentRate) * 8) * this.fadeWeight(i);
      for (let ch = 0; ch < this.channels; ch++) {
        const out = output[ch];
        if (!out) continue;
        const v = this.rings[ch]!.readAt(this.readPos) * gain;
        const w = this.fadeWeight(i);
        out[i] = w >= 1 ? v : this.lastOut[ch]! * (1 - w) + v * w;
      }
    }
    this.fadeRemaining = Math.max(0, this.fadeRemaining - n);
  }

  private processBrake(output: Float32Array[], n: number): void {
    const dRate = 1 / (this.brakeTime * this.sampleRate);
    for (let i = 0; i < n; i++) {
      this.brakeRate = Math.max(0, this.brakeRate - dRate);
      this.readPos += this.brakeRate;
      // Unity gain until the platter nearly stops, then fade out the
      // sample-hold (a stopped needle is silent, not DC).
      const gain = Math.min(1, this.brakeRate * 8);
      for (let ch = 0; ch < this.channels; ch++) {
        const out = output[ch];
        if (out) out[i] = this.rings[ch]!.readAt(this.readPos) * gain;
      }
    }
    this.currentRate = this.brakeRate;
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
