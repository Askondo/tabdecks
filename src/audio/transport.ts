// Main-thread control surface for the transport worklet.
import { BeatGrid } from './beatgrid';
import { ONSET_HOP } from '@/dsp/onset-detect';
import { TempoInducer } from '@/dsp/tempo-induction';
import type { ScheduleDomain, ScheduledAction, TransportStatus } from '@/dsp/transport-dsp';

export const TRANSPORT_WORKLET_URL = '/transport-worklet.js';
export const TRANSPORT_PROCESSOR = 'tabdecks-transport';
export const HISTORY_SECONDS = 300;
export const PEAK_BUCKET = 512;

/** Stutter slice lengths (ms) ≈ 1/2 … 1/32 note at 120 BPM. */
export const STUTTER_SLICES_MS = [500, 250, 125, 62, 31] as const;

/**
 * Rolling store of waveform peaks (one per PEAK_BUCKET samples), addressed by
 * absolute bucket index — mirrors the worklet's ring-buffer addressing.
 */
export class PeakStore {
  private readonly buckets: Float32Array;
  private maxBucket = -1;

  constructor(historySamples: number) {
    this.buckets = new Float32Array(Math.ceil(historySamples / PEAK_BUCKET) + 16);
  }

  set(firstBucket: number, values: Float32Array): void {
    for (let i = 0; i < values.length; i++) {
      this.buckets[(firstBucket + i) % this.buckets.length] = values[i]!;
    }
    this.maxBucket = Math.max(this.maxBucket, firstBucket + values.length - 1);
  }

  /** Max peak over an absolute sample range (0 outside retained history). */
  peakBetween(fromAbs: number, toAbs: number): number {
    const fromBucket = Math.max(0, Math.floor(fromAbs / PEAK_BUCKET));
    const toBucket = Math.min(this.maxBucket, Math.floor(toAbs / PEAK_BUCKET));
    const minKept = this.maxBucket - this.buckets.length + 1;
    let peak = 0;
    for (let b = Math.max(fromBucket, minKept); b <= toBucket; b++) {
      const v = this.buckets[b % this.buckets.length]!;
      if (v > peak) peak = v;
    }
    return peak;
  }
}

/** Run tempo estimation roughly once per second (every Nth status message). */
const ESTIMATE_EVERY_N_STATUS = 20;

export class DeckTransport {
  readonly node: AudioWorkletNode;
  readonly peaks: PeakStore;
  readonly grid: BeatGrid;
  /** Latest status snapshot from the worklet (~20 Hz). */
  status: TransportStatus | null = null;

  onStatus: ((status: TransportStatus) => void) | null = null;
  /** Worklet latched to passthrough after an internal error. */
  onError: ((message: string) => void) | null = null;

  private readonly inducer: TempoInducer;
  private statusCount = 0;
  private statusCtxTime = 0;
  private readonly sampleRate: number;

  constructor(ctx: AudioContext) {
    this.sampleRate = ctx.sampleRate;
    this.peaks = new PeakStore(HISTORY_SECONDS * ctx.sampleRate);
    this.grid = new BeatGrid(ctx.sampleRate);
    this.inducer = new TempoInducer(ctx.sampleRate / ONSET_HOP);
    this.node = new AudioWorkletNode(ctx, TRANSPORT_PROCESSOR, {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [2],
      processorOptions: { historySeconds: HISTORY_SECONDS },
    });
    this.node.port.onmessage = (e: MessageEvent) => {
      const data = e.data as
        | { type: 'error'; message?: string }
        | { type: 'status'; status: TransportStatus; ctxTime: number }
        | {
            type: 'peaks';
            firstBucket: number;
            values: Float32Array;
            onsetsFirstFrame: number;
            onsets: Float32Array;
          };
      if (data.type === 'error') {
        console.error('[transport] worklet latched to passthrough:', data.message);
        this.onError?.(data.message ?? 'unknown worklet error');
      } else if (data.type === 'status') {
        this.status = data.status;
        this.statusCtxTime = data.ctxTime;
        if (++this.statusCount % ESTIMATE_EVERY_N_STATUS === 0) {
          const est = this.inducer.estimate();
          if (est) this.grid.updateFromDetection(est);
        }
        this.onStatus?.(data.status);
      } else if (data.type === 'peaks') {
        this.peaks.set(data.firstBucket, data.values);
        if (data.onsets.length) this.inducer.addFrames(data.onsets, data.onsetsFirstFrame);
      }
    };
  }

  private post(msg: unknown): void {
    this.node.port.postMessage(msg);
  }

  brake(on: boolean): void {
    this.post(on ? { type: 'brake' } : { type: 'release' });
  }

  stutter(on: boolean, sliceMs: number): void {
    this.post(on ? { type: 'stutter', sliceMs } : { type: 'release' });
  }

  setBrakeTime(seconds: number): void {
    // k-rate param read per block; affects only the ramp slope — direct write is fine.
    const p = this.node.parameters.get('brakeTime');
    if (p) p.value = seconds;
  }

  pause(): void {
    this.post({ type: 'pause' });
  }

  play(): void {
    this.post({ type: 'play' });
  }

  setRate(rate: number): void {
    this.post({ type: 'setRate', rate });
  }

  seekBehind(seconds: number): void {
    this.post({ type: 'seekBehind', seconds });
  }

  seekAbs(pos: number): void {
    this.post({ type: 'seekAbs', pos });
  }

  jumpLive(): void {
    this.post({ type: 'jumpLive' });
  }

  trackMark(): void {
    this.post({ type: 'trackMark' });
  }

  trackRestart(): void {
    this.post({ type: 'trackRestart' });
  }

  trackExit(): void {
    this.post({ type: 'trackExit' });
  }

  // ── Quantize scheduling ───────────────────────────────────────────────

  scheduleAction(at: number, domain: ScheduleDomain, action: ScheduledAction): void {
    this.post({ type: 'schedule', at, domain, action });
  }

  cancelScheduled(kind?: ScheduledAction['type']): void {
    this.post({ type: 'cancelScheduled', kind });
  }

  /**
   * AudioContext time at which the PLAYHEAD will reach an absolute sample
   * position (for scheduling AudioParam moves on the audible beat).
   * Approximates with the user rate; null when unknowable (paused/no status).
   */
  ctxTimeAtPlayhead(targetAbs: number): number | null {
    const s = this.status;
    if (!s) return null;
    const pos = s.mode === 'live' ? s.written : s.readPos;
    const rate = s.mode === 'live' ? 1 : s.playing ? Math.max(0.05, s.rate) : 0;
    if (rate === 0) return null;
    return this.statusCtxTime + (targetAbs - pos) / (rate * this.sampleRate);
  }
}
