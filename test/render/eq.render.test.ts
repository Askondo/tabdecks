// EQ render tests via node-web-audio-api's OfflineAudioContext — spec-compliant
// Web Audio in node, so the real DeckEq graph renders without a browser.
import { describe, expect, it } from 'vitest';
import { OfflineAudioContext } from 'node-web-audio-api';
import { DeckEq, type EqBand } from '../../src/audio/eq';

const SAMPLE_RATE = 48000;
const DURATION = 0.5; // seconds

/** Render a sine through DeckEq, return output RMS over the steady-state tail. */
async function renderSine(
  freq: number,
  configure: (eq: DeckEq) => void,
): Promise<number> {
  const ctx = new OfflineAudioContext(1, SAMPLE_RATE * DURATION, SAMPLE_RATE);
  const eq = new DeckEq(ctx as unknown as BaseAudioContext);
  configure(eq);

  const osc = ctx.createOscillator();
  osc.frequency.value = freq;
  osc.connect(eq.input as never);
  (eq.output as unknown as AudioNode).connect(ctx.destination as never);
  osc.start();

  const buf = await ctx.startRendering();
  const data = buf.getChannelData(0);
  // Skip the first 100 ms (filter settle + kill ramp), measure the tail.
  const start = Math.floor(0.1 * SAMPLE_RATE);
  let sum = 0;
  for (let i = start; i < data.length; i++) sum += data[i]! * data[i]!;
  return Math.sqrt(sum / (data.length - start));
}

const SINE_RMS = Math.SQRT1_2; // RMS of a unit sine

function db(rms: number): number {
  return 20 * Math.log10(rms / SINE_RMS);
}

describe('DeckEq unity flatness', () => {
  // Includes the crossover frequencies — LR4 bands must sum magnitude-flat.
  for (const freq of [60, 250, 1000, 2500, 8000]) {
    it(`is flat within ±1.5 dB at ${freq} Hz`, async () => {
      const rms = await renderSine(freq, () => {});
      expect(Math.abs(db(rms))).toBeLessThan(1.5);
    });
  }
});

describe('DeckEq kills', () => {
  // LR4 slopes are 24 dB/oct — kill depth depends on distance from the
  // crossover. Deep in-band these hold; mid is bounded by its band edges.
  const cases: Array<{ band: EqBand; freq: number; minAtten: number }> = [
    { band: 'low', freq: 40, minAtten: 50 },
    { band: 'mid', freq: 800, minAtten: 30 },
    { band: 'high', freq: 16000, minAtten: 45 },
  ];

  for (const { band, freq, minAtten } of cases) {
    it(`${band} kill attenuates ${freq} Hz by ≥ ${minAtten} dB`, async () => {
      const rms = await renderSine(freq, (eq) => eq.setKill(band, true));
      expect(db(rms)).toBeLessThan(-minAtten);
    });
  }

  it('kill + unkill restores the knob value', async () => {
    const rms = await renderSine(1000, (eq) => {
      eq.setBand('mid', 1);
      eq.setKill('mid', true);
      eq.setKill('mid', false);
    });
    expect(Math.abs(db(rms))).toBeLessThan(1.5);
  });

  it('band gain at 0.5 attenuates in-band by ~6 dB', async () => {
    const rms = await renderSine(1000, (eq) => eq.setBand('mid', 0.5));
    expect(db(rms)).toBeLessThan(-4.5);
    expect(db(rms)).toBeGreaterThan(-7.5);
  });
});
