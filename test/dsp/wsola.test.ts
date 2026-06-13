import { describe, expect, it } from 'vitest';
import { Wsola } from '../../src/dsp/wsola';
import type { SampleFn } from '../../src/dsp/wsola';

const SR = 48000;

function sineReader(freq: number): SampleFn {
  return (_ch, pos) => Math.sin((2 * Math.PI * freq * pos) / SR);
}

/** Run WSOLA for `seconds` of output at a constant rate; return ch0 output. */
function render(freq: number, rate: number, seconds: number): Float32Array {
  const w = new Wsola(SR, 2);
  w.reset(0);
  const read = sineReader(freq);
  const total = Math.floor(seconds * SR);
  const out = new Float32Array(total);
  const block = 128;
  for (let off = 0; off < total; off += block) {
    const n = Math.min(block, total - off);
    const o = [new Float32Array(n), new Float32Array(n)];
    w.process(o, n, rate, read);
    out.set(o[0]!.subarray(0, n), off);
  }
  return out;
}

function zeroCrossings(data: Float32Array, from: number, to: number): number {
  let c = 0;
  for (let i = from + 1; i < to; i++) {
    if ((data[i - 1]! < 0 && data[i]! >= 0) || (data[i - 1]! >= 0 && data[i]! < 0)) c++;
  }
  return c;
}

describe('WSOLA pitch preservation', () => {
  // Frequency (≈ zero-crossing rate) must stay at the source pitch regardless
  // of consumption rate — that is the whole point of key-lock.
  for (const rate of [0.85, 1.15]) {
    it(`holds pitch at consumption rate ${rate}`, () => {
      const freq = 440;
      const out = render(freq, rate, 1.5);
      // Measure over a steady mid-section (skip onset + tail).
      const a = Math.floor(0.5 * SR);
      const b = Math.floor(1.4 * SR);
      const zc = zeroCrossings(out, a, b);
      const measuredFreq = (zc / 2 / (b - a)) * SR;
      expect(Math.abs(measuredFreq - freq) / freq).toBeLessThan(0.03);
    });
  }

  it('rate 1.0 reproduces the source pitch', () => {
    const out = render(330, 1.0, 1.0);
    const zc = zeroCrossings(out, 0.3 * SR, 0.9 * SR);
    const f = (zc / 2 / (0.6 * SR)) * SR;
    expect(Math.abs(f - 330) / 330).toBeLessThan(0.03);
  });
});

describe('WSOLA continuity', () => {
  it('has no silent gaps (energy stays up across frame seams)', () => {
    const out = render(440, 0.9, 1.5);
    const winN = 256;
    let minRms = Infinity;
    for (let i = Math.floor(0.4 * SR); i + winN < 1.4 * SR; i += winN) {
      let s = 0;
      for (let j = 0; j < winN; j++) s += out[i + j]! * out[i + j]!;
      minRms = Math.min(minRms, Math.sqrt(s / winN));
    }
    // A unit sine has RMS ≈ 0.707; OLA gain ~1. No window should collapse to silence.
    expect(minRms).toBeGreaterThan(0.4);
  });

  it('keeps sample-to-sample steps bounded (no seam clicks)', () => {
    const out = render(440, 1.1, 1.2);
    let maxStep = 0;
    for (let i = Math.floor(0.3 * SR) + 1; i < 1.1 * SR; i++) {
      maxStep = Math.max(maxStep, Math.abs(out[i]! - out[i - 1]!));
    }
    // 440 Hz at 48 k steps ≤ ~0.0576 naturally; allow generous headroom for OLA.
    expect(maxStep).toBeLessThan(0.2);
  });

  it('advances the input position at the consumption rate on average', () => {
    const w = new Wsola(SR, 2);
    w.reset(1000);
    const read = sineReader(440);
    const rate = 0.8;
    const n = SR; // 1 s of output
    const o = [new Float32Array(128), new Float32Array(128)];
    for (let i = 0; i < n; i += 128) w.process(o, Math.min(128, n - i), rate, read);
    // Consumed ≈ rate · output samples of input.
    expect(Math.abs(w.inputPos - 1000 - rate * n)).toBeLessThan(SR * 0.02);
  });
});
