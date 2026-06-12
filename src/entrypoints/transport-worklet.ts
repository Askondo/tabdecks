import { defineUnlistedScript } from '#imports';
import { TransportDsp } from '@/dsp/transport-dsp';

// Runs in AudioWorkletGlobalScope — no window/chrome/DOM. These globals are
// not in the DOM lib; declared minimally here.
declare const sampleRate: number;
declare const currentTime: number;
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
  | { type: 'release' };

export default defineUnlistedScript(() => {
  void currentTime; // keep the declared global referenced

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

    constructor(options?: unknown) {
      super(options);
      const historySeconds =
        (options as ProcessorOptions)?.processorOptions?.historySeconds ?? 300;
      this.dsp = new TransportDsp(sampleRate, historySeconds, 2);
      this.port.onmessage = (e: MessageEvent) => this.handle(e.data as TransportMessage);
    }

    private handle(msg: TransportMessage): void {
      try {
        if (msg.type === 'brake') this.dsp.brake();
        else if (msg.type === 'stutter') this.dsp.stutter((msg.sliceMs ?? 125) / 1000);
        else if (msg.type === 'release') this.dsp.release();
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

    private fail(e: unknown): void {
      if (this.broken) return;
      this.broken = true;
      this.port.postMessage({ type: 'error', message: String(e) });
    }
  }

  registerProcessor('tabdecks-transport', TransportProcessor);
});
