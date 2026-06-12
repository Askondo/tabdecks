import { rampTo } from './ramps';

/**
 * Master bus: masterGain → limiter → analyser → destination.
 * The limiter is a brick-wall-ish safety net (not mastering) — it only acts
 * when two hot decks sum above -1 dBFS. Compressor lookahead latency is
 * acceptable on master only, never per-deck.
 */
export class MasterBus {
  readonly input: GainNode;
  readonly analyser: AnalyserNode;
  private readonly limiter: DynamicsCompressorNode;

  constructor(private readonly ctx: AudioContext) {
    this.input = ctx.createGain();
    this.input.gain.value = 1;

    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -1;
    this.limiter.knee.value = 0;
    this.limiter.ratio.value = 20;
    this.limiter.attack.value = 0.003;
    this.limiter.release.value = 0.25;

    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 2048;

    this.input.connect(this.limiter).connect(this.analyser).connect(ctx.destination);
  }

  /** v ∈ [0, 1.5] */
  setGain(v: number): void {
    rampTo(this.ctx, this.input.gain, v);
  }
}
