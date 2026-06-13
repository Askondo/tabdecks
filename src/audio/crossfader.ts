import { equalPowerPair } from '@/dsp/curves';
import { rampAt, rampTo } from './ramps';

/** Equal-power crossfader driving the two decks' xfade gain nodes. */
export class Crossfader {
  private pos = 0.5;

  constructor(
    private readonly ctx: AudioContext,
    private readonly gainA: AudioParam,
    private readonly gainB: AudioParam,
  ) {
    this.set(0.5);
  }

  /** x ∈ [0,1]: 0 = full A, 1 = full B. */
  set(x: number): void {
    this.pos = x;
    const [a, b] = equalPowerPair(x);
    rampTo(this.ctx, this.gainA, a);
    rampTo(this.ctx, this.gainB, b);
  }

  /** Instant cut to a side, optionally scheduled at a context time (quantized).
   *  Fast τ — a cut, not a fade. */
  cut(x: 0 | 1, atTime?: number): void {
    this.pos = x;
    const [a, b] = equalPowerPair(x);
    const tau = 0.003;
    if (atTime === undefined) {
      rampTo(this.ctx, this.gainA, a, tau);
      rampTo(this.ctx, this.gainB, b, tau);
    } else {
      rampAt(this.ctx, this.gainA, a, atTime, tau);
      rampAt(this.ctx, this.gainB, b, atTime, tau);
    }
  }

  get position(): number {
    return this.pos;
  }
}
