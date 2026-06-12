import { equalPowerPair } from '@/dsp/curves';
import { RAMP, rampTo } from '../ramps';
import type { FxInstance } from './types';

export interface WetSubgraph {
  input: AudioNode;
  output: AudioNode;
  setParam(id: string, value: number): void;
  dispose?(): void;
}

/**
 * Standard FX shell shared by every insert FX:
 *
 *   input ─┬→ dryGain ──────────────────┬→ output
 *          └→ [wet subgraph] → wetGain ──┘
 *
 * setWet is equal-power. setBypass crossfades to dry but keeps the wet path
 * connected and processing (echo tails survive, re-enable is instant).
 */
export function createFxShell(ctx: BaseAudioContext, wet: WetSubgraph): FxInstance {
  const input = ctx.createGain();
  const output = ctx.createGain();
  const dryGain = ctx.createGain();
  const wetGain = ctx.createGain();

  input.connect(dryGain).connect(output);
  input.connect(wet.input);
  wet.output.connect(wetGain);
  wetGain.connect(output);

  let mix = 0.5;
  let bypassed = false;

  function apply(): void {
    const effective = bypassed ? 0 : mix;
    const [dry, wetLevel] = equalPowerPair(effective);
    rampTo(ctx, dryGain.gain, dry, RAMP.fx);
    rampTo(ctx, wetGain.gain, wetLevel, RAMP.fx);
  }
  apply();

  return {
    input,
    output,
    setParam: (id, value) => wet.setParam(id, value),
    setWet(m: number) {
      mix = m;
      apply();
    },
    setBypass(b: boolean) {
      bypassed = b;
      apply();
    },
    dispose() {
      wet.dispose?.();
      input.disconnect();
      dryGain.disconnect();
      wetGain.disconnect();
      output.disconnect();
    },
  };
}
