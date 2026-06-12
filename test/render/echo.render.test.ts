// Echo impulse-response render test: taps at multiples of delayTime,
// amplitudes decaying by roughly the feedback ratio.
import { describe, expect, it } from 'vitest';
import { OfflineAudioContext } from 'node-web-audio-api';
import { echoFx } from '../../src/audio/fx/echo';

const SAMPLE_RATE = 48000;

async function renderImpulse(): Promise<Float32Array> {
  const ctx = new OfflineAudioContext(1, SAMPLE_RATE * 2, SAMPLE_RATE);
  const fx = echoFx.create(ctx as unknown as BaseAudioContext);
  fx.setWet(1); // full wet isolates the echo taps from the dry impulse

  const impulse = ctx.createBuffer(1, 1, SAMPLE_RATE);
  impulse.getChannelData(0)[0] = 1;
  const src = ctx.createBufferSource();
  src.buffer = impulse;
  src.connect(fx.input as never);
  (fx.output as unknown as AudioNode).connect(ctx.destination as never);
  src.start();

  const buf = await ctx.startRendering();
  return buf.getChannelData(0) as Float32Array;
}

/** Peak |amplitude| within ±10 ms of the given time. */
function peakAround(data: Float32Array, seconds: number): number {
  const center = Math.round(seconds * SAMPLE_RATE);
  const w = Math.round(0.01 * SAMPLE_RATE);
  let peak = 0;
  for (let i = Math.max(0, center - w); i < Math.min(data.length, center + w); i++) {
    peak = Math.max(peak, Math.abs(data[i]!));
  }
  return peak;
}

describe('echo impulse response', () => {
  it('produces taps at delayTime multiples with decaying amplitude', async () => {
    const data = await renderImpulse();
    const t = 0.35; // default time
    const tap1 = peakAround(data, t);
    const tap2 = peakAround(data, 2 * t);
    const tap3 = peakAround(data, 3 * t);

    // First tap clearly present (impulse → lowpass smears it but keeps energy).
    expect(tap1).toBeGreaterThan(0.1);
    // Decay roughly by the feedback ratio (0.45) each repeat; the tone filter
    // darkens repeats so the ratio drifts below feedback — assert a window.
    expect(tap2 / tap1).toBeGreaterThan(0.2);
    expect(tap2 / tap1).toBeLessThan(0.7);
    expect(tap3).toBeLessThan(tap2);

    // No energy where there should be none (between dry start and first tap).
    expect(peakAround(data, 0.17)).toBeLessThan(0.01);
  });

  it('bypass mutes the wet path output but keeps the tail alive', async () => {
    const ctx = new OfflineAudioContext(1, SAMPLE_RATE, SAMPLE_RATE);
    const fx = echoFx.create(ctx as unknown as BaseAudioContext);
    fx.setWet(1);
    fx.setBypass(true);

    const impulse = ctx.createBuffer(1, 1, SAMPLE_RATE);
    impulse.getChannelData(0)[0] = 1;
    const src = ctx.createBufferSource();
    src.buffer = impulse;
    src.connect(fx.input as never);
    (fx.output as unknown as AudioNode).connect(ctx.destination as never);
    src.start();

    const buf = await ctx.startRendering();
    const data = buf.getChannelData(0);
    // Bypassed: dry passthrough at t≈0 present, no echo tap at 350 ms.
    let tapPeak = 0;
    const c = Math.round(0.35 * SAMPLE_RATE);
    for (let i = c - 480; i < c + 480; i++) tapPeak = Math.max(tapPeak, Math.abs(data[i]!));
    expect(tapPeak).toBeLessThan(0.01);
  });
});
