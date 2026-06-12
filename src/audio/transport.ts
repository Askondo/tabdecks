// Main-thread control surface for the transport worklet.

export const TRANSPORT_WORKLET_URL = '/transport-worklet.js';
export const TRANSPORT_PROCESSOR = 'tabdecks-transport';

/** Stutter slice lengths (ms) ≈ 1/2 … 1/32 note at 120 BPM. */
export const STUTTER_SLICES_MS = [500, 250, 125, 62, 31] as const;

export class DeckTransport {
  readonly node: AudioWorkletNode;
  /** Worklet latched to passthrough after an internal error. */
  onError: ((message: string) => void) | null = null;

  constructor(ctx: AudioContext) {
    this.node = new AudioWorkletNode(ctx, TRANSPORT_PROCESSOR, {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [2],
      processorOptions: { historySeconds: 300 },
    });
    this.node.port.onmessage = (e: MessageEvent) => {
      const data = e.data as { type?: string; message?: string };
      if (data?.type === 'error') {
        console.error('[transport] worklet latched to passthrough:', data.message);
        this.onError?.(data.message ?? 'unknown worklet error');
      }
    };
  }

  brake(on: boolean): void {
    this.node.port.postMessage(on ? { type: 'brake' } : { type: 'release' });
  }

  stutter(on: boolean, sliceMs: number): void {
    this.node.port.postMessage(on ? { type: 'stutter', sliceMs } : { type: 'release' });
  }

  setBrakeTime(seconds: number): void {
    // k-rate param read per block; affects only the ramp slope — direct write is fine.
    const p = this.node.parameters.get('brakeTime');
    if (p) p.value = seconds;
  }
}
