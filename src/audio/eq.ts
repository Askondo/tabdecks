import { RAMP, rampTo } from './ramps';

export type EqBand = 'low' | 'mid' | 'high';
export const EQ_BANDS: EqBand[] = ['low', 'mid', 'high'];

const LOW_X = 250; // Hz, low/mid crossover
const HIGH_X = 2500; // Hz, mid/high crossover
// For lowpass/highpass biquads the spec interprets Q in dB. Butterworth is
// linear Q = 1/√2 → 20·log10(1/√2) ≈ -3.0103 dB. Two cascaded = LR4 edge.
const BUTTERWORTH_Q_DB = 20 * Math.log10(Math.SQRT1_2);

/**
 * DJ-style 3-band EQ as a parallel LR4 crossover split. Unlike shelving EQs,
 * killing a band gain truly removes that frequency range (true kill).
 * Bands sum magnitude-flat at unity (crossovers are ~3.3 octaves apart).
 *
 *   input ─┬─ lp(250)×2 ───────────────── lowGain  ─┬─ output
 *          ├─ hp(250)×2 → lp(2500)×2 ──── midGain  ─┤
 *          └─ hp(2500)×2 ───────────────── highGain ─┘
 */
export class DeckEq {
  readonly input: GainNode;
  readonly output: GainNode;

  private readonly gains: Record<EqBand, GainNode>;
  /** Knob values [0..2]; preserved across kill/unkill. */
  private readonly values: Record<EqBand, number> = { low: 1, mid: 1, high: 1 };
  private readonly killed: Record<EqBand, boolean> = { low: false, mid: false, high: false };

  constructor(private readonly ctx: BaseAudioContext) {
    this.input = ctx.createGain();
    this.output = ctx.createGain();

    const low = this.chain(filters(ctx, 'lowpass', LOW_X, 2));
    const mid = this.chain([
      ...filters(ctx, 'highpass', LOW_X, 2),
      ...filters(ctx, 'lowpass', HIGH_X, 2),
    ]);
    const high = this.chain(filters(ctx, 'highpass', HIGH_X, 2));

    this.gains = { low, mid, high };
  }

  /** Connects input → filterChain → bandGain → output; returns the band gain. */
  private chain(chain: BiquadFilterNode[]): GainNode {
    const gain = this.ctx.createGain();
    let node: AudioNode = this.input;
    for (const f of chain) {
      node.connect(f);
      node = f;
    }
    node.connect(gain).connect(this.output);
    return gain;
  }

  /** v ∈ [0,2] — 0 = kill, 1 = unity, 2 = +6 dB. */
  setBand(band: EqBand, v: number): void {
    this.values[band] = v;
    if (!this.killed[band]) {
      rampTo(this.ctx, this.gains[band].gain, v, RAMP.eq);
    }
  }

  setKill(band: EqBand, on: boolean): void {
    this.killed[band] = on;
    rampTo(this.ctx, this.gains[band].gain, on ? 0 : this.values[band], RAMP.eq);
  }

  getBand(band: EqBand): { value: number; killed: boolean } {
    return { value: this.values[band], killed: this.killed[band] };
  }
}

function filters(
  ctx: BaseAudioContext,
  type: 'lowpass' | 'highpass',
  freq: number,
  count: number,
): BiquadFilterNode[] {
  return Array.from({ length: count }, () => {
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = BUTTERWORTH_Q_DB;
    return f;
  });
}
