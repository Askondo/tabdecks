import { RAMP, rampTo } from '../ramps';
import { createFxShell } from './wrapper';
import type { FxDescriptor } from './types';

const BUTTERWORTH_Q_DB = 20 * Math.log10(Math.SQRT1_2);

/**
 * Echo/delay — native nodes only.
 *
 *   wetIn → delay → tone(lowpass) → wetOut
 *                     └→ feedback → delay   (repeats darken progressively)
 *
 * delayTime changes are ramped → tape-style pitch warble (intentional).
 */
export const echoFx: FxDescriptor = {
  id: 'echo',
  name: 'Echo',
  params: [
    { id: 'time', label: 'Time', min: 50, max: 1000, default: 350, unit: 'ms' },
    { id: 'feedback', label: 'Fdbk', min: 0, max: 0.9, default: 0.45 },
    { id: 'tone', label: 'Tone', min: 500, max: 8000, default: 3000, unit: 'Hz', scale: 'log' },
  ],
  create(ctx) {
    const wetIn = ctx.createGain();
    const delay = ctx.createDelay(2);
    delay.delayTime.value = 0.35;
    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = 3000;
    tone.Q.value = BUTTERWORTH_Q_DB;
    const feedback = ctx.createGain();
    feedback.gain.value = 0.45;

    wetIn.connect(delay).connect(tone);
    tone.connect(feedback).connect(delay);

    return createFxShell(ctx, {
      input: wetIn,
      output: tone,
      setParam(id, value) {
        if (id === 'time') rampTo(ctx, delay.delayTime, value / 1000, RAMP.fx);
        else if (id === 'feedback') rampTo(ctx, feedback.gain, value, RAMP.fx);
        else if (id === 'tone') rampTo(ctx, tone.frequency, value, RAMP.fx);
      },
      dispose() {
        wetIn.disconnect();
        delay.disconnect();
        tone.disconnect();
        feedback.disconnect();
      },
    });
  },
};
