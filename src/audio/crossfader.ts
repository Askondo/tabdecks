import { equalPowerPair } from '@/dsp/curves';
import { rampTo } from './ramps';

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

  get position(): number {
    return this.pos;
  }
}
