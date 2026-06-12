import { describe, expect, it } from 'vitest';
import { TransportDsp } from '../../src/dsp/transport-dsp';

const SR = 48000;
const BLOCK = 128;

/** Drives a TransportDsp with a generated signal, collecting output. */
class Harness {
  readonly dsp: TransportDsp;
  readonly out: number[] = [];
  readonly inp: number[] = [];
  private t = 0;

  constructor(private readonly gen: (t: number) => number) {
    this.dsp = new TransportDsp(SR, 10, 2);
  }

  run(blocks: number): void {
    for (let b = 0; b < blocks; b++) {
      const input = new Float32Array(BLOCK);
      for (let i = 0; i < BLOCK; i++) {
        input[i] = this.gen(this.t / SR);
        this.t++;
      }
      const outL = new Float32Array(BLOCK);
      const outR = new Float32Array(BLOCK);
      this.dsp.processBlock([input, input], [outL, outR]);
      for (let i = 0; i < BLOCK; i++) {
        this.inp.push(input[i]!);
        this.out.push(outL[i]!);
      }
    }
  }
}

function zeroCrossings(data: number[], from: number, to: number): number {
  let count = 0;
  for (let i = from + 1; i < to; i++) {
    if ((data[i - 1]! < 0 && data[i]! >= 0) || (data[i - 1]! >= 0 && data[i]! < 0)) count++;
  }
  return count;
}

const sine440 = (t: number) => Math.sin(2 * Math.PI * 440 * t);

describe('TransportDsp live passthrough', () => {
  it('outputs the input exactly (zero processing latency)', () => {
    const h = new Harness(sine440);
    h.run(20);
    expect(h.out).toEqual(h.inp);
  });
});

describe('TransportDsp brake', () => {
  it('drops pitch monotonically and reaches silence', () => {
    const h = new Harness(sine440);
    h.run(40); // build history
    h.dsp.setBrakeTime(0.5);
    h.dsp.brake();
    const start = h.out.length;
    h.run(Math.ceil((0.7 * SR) / BLOCK)); // run past the stop

    // Zero-crossing rate (≈ frequency) falls monotonically across windows.
    const win = Math.floor(0.1 * SR);
    const rates: number[] = [];
    for (let w = 0; w + win <= 0.5 * SR; w += win) {
      rates.push(zeroCrossings(h.out, start + w, start + w + win));
    }
    for (let i = 1; i < rates.length; i++) {
      expect(rates[i]!).toBeLessThan(rates[i - 1]!);
    }

    // Fully stopped: tail is silent.
    const tail = h.out.slice(-Math.floor(0.05 * SR));
    expect(Math.max(...tail.map(Math.abs))).toBeLessThan(1e-6);
  });

  it('release jump-cuts back to live within the fade window', () => {
    const h = new Harness(sine440);
    h.run(40);
    h.dsp.setBrakeTime(0.2);
    h.dsp.brake();
    h.run(Math.ceil((0.3 * SR) / BLOCK));
    h.dsp.release();
    h.run(20);

    // After the 5 ms fade, output tracks live input exactly.
    const n = h.out.length;
    const fade = Math.round(0.005 * SR) + BLOCK;
    for (let i = n - (20 * BLOCK - fade); i < n; i++) {
      expect(h.out[i]).toBeCloseTo(h.inp[i]!, 6);
    }
  });
});

describe('TransportDsp stutter', () => {
  it('repeats the captured slice periodically', () => {
    // Identifiable signal: slow ramp (no periodicity of its own).
    const h = new Harness((t) => (t * 1000) % 1);
    h.run(80);
    const sliceMs = 125;
    const sliceLen = Math.round((sliceMs / 1000) * SR);
    h.dsp.stutter(sliceMs / 1000);
    const start = h.out.length;
    h.run(Math.ceil((sliceLen * 3.5) / BLOCK));

    // Outside the 5 ms seam crossfades, loop iterations are identical.
    const xfade = Math.round(0.005 * SR);
    for (let i = 0; i < sliceLen - xfade; i += 7) {
      const first = h.out[start + i]!;
      const second = h.out[start + i + sliceLen]!;
      const third = h.out[start + i + 2 * sliceLen]!;
      expect(second).toBeCloseTo(first, 5);
      expect(third).toBeCloseTo(first, 5);
    }
  });

  it('has no large sample jumps at the loop seam', () => {
    const h = new Harness(sine440);
    h.run(80);
    h.dsp.stutter(0.0625);
    const start = h.out.length;
    h.run(60);

    // Max sample-to-sample step must stay near the sine's natural slope
    // (440 Hz at 48 kHz steps ≤ ~0.0576), allow 3× headroom for the seam.
    let maxStep = 0;
    for (let i = start + 1; i < h.out.length; i++) {
      maxStep = Math.max(maxStep, Math.abs(h.out[i]! - h.out[i - 1]!));
    }
    expect(maxStep).toBeLessThan(0.18);
  });

  it('release returns to live', () => {
    const h = new Harness(sine440);
    h.run(80);
    h.dsp.stutter(0.125);
    h.run(20);
    h.dsp.release();
    h.run(20);
    const n = h.out.length;
    for (let i = n - 5 * BLOCK; i < n; i++) {
      expect(h.out[i]).toBeCloseTo(h.inp[i]!, 6);
    }
  });
});

describe('TransportDsp disconnected input', () => {
  it('emits silence and keeps history time advancing', () => {
    const h = new Harness(sine440);
    h.run(10);
    const out = [new Float32Array(BLOCK), new Float32Array(BLOCK)];
    h.dsp.processBlock(null, out);
    expect(Math.max(...out[0]!.map(Math.abs))).toBe(0);
  });
});
