import { defineUnlistedScript } from '#imports';
import { TransportDsp } from '@/dsp/transport-dsp';

// Runs in AudioWorkletGlobalScope — no window/chrome/DOM. These globals are
// not in the DOM lib; declared minimally here.
declare const sampleRate: number;
declare abstract class AudioWorkletProcessor {
  readonly port: MessagePort;
  constructor(options?: unknown);
}
declare function registerProcessor(
  name: string,
  ctor: new (options?: unknown) => AudioWorkletProcessor,
): void;

interface ProcessorOptions {
  processorOptions?: { historySeconds?: number };
}

export type TransportMessage =
  | { type: 'brake' }
  | { type: 'stutter'; sliceMs: number }
  | { type: 'release' }
  | { type: 'pause' }
  | { type: 'play' }
  | { type: 'setRate'; rate: number }
  | { type: 'seekBehind'; seconds: number }
  | { type: 'seekAbs'; pos: number }
  | { type: 'jumpLive' }
  | { type: 'trackMark' }
  | { type: 'trackRestart' }
  | { type: 'trackExit' };

/** Waveform peak bucket size in samples (≈10.7 ms at 48 kHz). */
export const PEAK_BUCKET = 512;
const STATUS_INTERVAL = 2400; // samples ≈ 50 ms
const PEAKS_PER_POST = 8;

export default defineUnlistedScript(() => {
  class TransportProcessor extends AudioWorkletProcessor {
    static get parameterDescriptors() {
      return [
        {
          name: 'brakeTime',
          defaultValue: 0.8,
          minValue: 0.05,
          maxValue: 4,
          automationRate: 'k-rate',
        },
      ];
    }

    private dsp: TransportDsp;
    /** STABILITY CONTRACT: after any internal error, latch to raw passthrough
     *  forever and report once — a DSP bug degrades, never silences. */
    private broken = false;

    // Waveform peak accumulation over the INPUT (recorded history).
    private absPos = 0;
    private peakAcc = 0;
    private bucketFill = 0;
    private pendingPeaks: number[] = [];
    private pendingFirstBucket = -1;
    private samplesSinceStatus = 0;

    constructor(options?: unknown) {
      super(options);
      const historySeconds =
        (options as ProcessorOptions)?.processorOptions?.historySeconds ?? 300;
      this.dsp = new TransportDsp(sampleRate, historySeconds, 2);
      this.port.onmessage = (e: MessageEvent) => this.handle(e.data as TransportMessage);
    }

    private handle(msg: TransportMessage): void {
      try {
        switch (msg.type) {
          case 'brake': this.dsp.brake(); break;
          case 'stutter': this.dsp.stutter((msg.sliceMs ?? 125) / 1000); break;
          case 'release': this.dsp.release(); break;
          case 'pause': this.dsp.pause(); break;
          case 'play': this.dsp.play(); break;
          case 'setRate': this.dsp.setRate(msg.rate); break;
          case 'seekBehind': this.dsp.seekBehind(msg.seconds); break;
          case 'seekAbs': this.dsp.seekAbs(msg.pos); break;
          case 'jumpLive': this.dsp.jumpLive(); break;
          case 'trackMark': this.dsp.trackMark(); break;
          case 'trackRestart': this.dsp.trackRestart(); break;
          case 'trackExit': this.dsp.trackExit(); break;
        }
      } catch (e) {
        this.fail(e);
      }
    }

    process(
      inputs: Float32Array[][],
      outputs: Float32Array[][],
      parameters: Record<string, Float32Array>,
    ): boolean {
      try {
        if (!this.broken) {
          const brakeTime = parameters.brakeTime?.[0];
          if (brakeTime !== undefined) this.dsp.setBrakeTime(brakeTime);
          const input = inputs[0]?.length ? inputs[0] : null;
          this.dsp.processBlock(input, outputs[0] ?? []);
          this.accumulatePeaks(input, outputs[0]?.[0]?.length ?? 128);
          this.maybePostStatus(outputs[0]?.[0]?.length ?? 128);
          return true;
        }
      } catch (e) {
        this.fail(e);
      }
      // Latched (or this block failed): raw passthrough.
      const inp = inputs[0] ?? [];
      const out = outputs[0] ?? [];
      for (let ch = 0; ch < out.length; ch++) {
        const src = inp[ch] ?? inp[0];
        if (src) out[ch]!.set(src);
      }
      return true;
    }

    private accumulatePeaks(input: Float32Array[] | null, n: number): void {
      const l = input?.[0];
      const r = input?.[1] ?? l;
      for (let i = 0; i < n; i++) {
        const v = l ? Math.max(Math.abs(l[i]!), Math.abs(r![i]!)) : 0;
        if (v > this.peakAcc) this.peakAcc = v;
        this.bucketFill++;
        this.absPos++;
        if (this.bucketFill === PEAK_BUCKET) {
          const bucket = Math.floor((this.absPos - 1) / PEAK_BUCKET);
          if (this.pendingFirstBucket < 0) this.pendingFirstBucket = bucket;
          this.pendingPeaks.push(this.peakAcc);
          this.peakAcc = 0;
          this.bucketFill = 0;
          if (this.pendingPeaks.length >= PEAKS_PER_POST) this.flushPeaks();
        }
      }
    }

    private flushPeaks(): void {
      if (!this.pendingPeaks.length) return;
      this.port.postMessage({
        type: 'peaks',
        firstBucket: this.pendingFirstBucket,
        values: Float32Array.from(this.pendingPeaks),
      });
      this.pendingPeaks = [];
      this.pendingFirstBucket = -1;
    }

    private maybePostStatus(n: number): void {
      this.samplesSinceStatus += n;
      if (this.samplesSinceStatus < STATUS_INTERVAL) return;
      this.samplesSinceStatus = 0;
      this.port.postMessage({ type: 'status', status: this.dsp.status });
    }

    private fail(e: unknown): void {
      if (this.broken) return;
      this.broken = true;
      this.port.postMessage({ type: 'error', message: String(e) });
    }
  }

  registerProcessor('tabdecks-transport', TransportProcessor);
});
