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

  runSeconds(s: number): void {
    this.run(Math.ceil((s * SR) / BLOCK));
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
/** Monotonic ramp — sample value identifies its recording time. */
const ramp = (t: number) => t;

describe('timeshift pause/play', () => {
  it('pause silences output and play resumes from the held position', () => {
    const h = new Harness(ramp);
    h.runSeconds(2);
    h.dsp.pause();
    h.runSeconds(0.5);

    // Paused: output settles to silence (rate-gain fade).
    const tail = h.out.slice(-Math.floor(0.1 * SR));
    expect(Math.max(...tail.map(Math.abs))).toBeLessThan(1e-3);

    const pausedAt = h.dsp.status.readPos;
    h.dsp.play();
    h.runSeconds(0.3);

    // Resumed content corresponds to the paused position (≈ value 2.0s),
    // ~0.8 s behind the live edge (now ≈ 2.8s).
    const resumed = h.out.slice(-Math.floor(0.2 * SR));
    const mid = resumed[Math.floor(resumed.length / 2)]!;
    expect(mid).toBeGreaterThan(pausedAt / SR - 0.1);
    expect(mid).toBeLessThan(pausedAt / SR + 0.5);
    // Definitely NOT live content:
    expect(mid).toBeLessThan(2.6);
    expect(h.dsp.status.behind).toBeGreaterThan(0.3);
  });
});

describe('timeshift seek + jump to live', () => {
  it('seekBehind plays content from that long ago', () => {
    const h = new Harness(ramp);
    h.runSeconds(3);
    h.dsp.seekBehind(2);
    h.runSeconds(0.2);
    // Live edge ≈ 3.2 s; playhead should output values around 1.0–1.3 s.
    const recent = h.out.slice(-Math.floor(0.1 * SR));
    const mid = recent[Math.floor(recent.length / 2)]!;
    expect(mid).toBeGreaterThan(0.9);
    expect(mid).toBeLessThan(1.5);
  });

  it('jumpLive returns to exact passthrough', () => {
    const h = new Harness(sine440);
    h.runSeconds(2);
    h.dsp.seekBehind(1);
    h.runSeconds(0.3);
    h.dsp.jumpLive();
    h.runSeconds(0.3);
    const n = h.out.length;
    for (let i = n - 5 * BLOCK; i < n; i++) {
      expect(h.out[i]).toBeCloseTo(h.inp[i]!, 6);
    }
  });
});

describe('varispeed', () => {
  it('halves the pitch at rate 0.5', () => {
    const h = new Harness(sine440);
    h.runSeconds(3);
    h.dsp.seekBehind(2);
    h.dsp.setRate(0.5);
    h.runSeconds(1);
    const start = h.out.length - Math.floor(0.5 * SR);
    const zc = zeroCrossings(h.out, start, h.out.length);
    // 440 Hz at half speed → 220 Hz → ~220 crossings in 0.5 s.
    expect(zc).toBeGreaterThan(190);
    expect(zc).toBeLessThan(250);
  });

  it('clamps at the live edge when rate > 1 catches up', () => {
    const h = new Harness(sine440);
    h.runSeconds(3);
    h.dsp.seekBehind(0.5);
    h.dsp.setRate(2);
    h.runSeconds(2); // would overtake live by 1.5 s without the clamp
    const status = h.dsp.status;
    expect(status.behind).toBeLessThan(0.05);
    // Riding the edge: effective rate is 1× — pitch back to ~440.
    const start = h.out.length - Math.floor(0.5 * SR);
    const zc = zeroCrossings(h.out, start, h.out.length);
    expect(zc).toBeGreaterThan(390);
    expect(zc).toBeLessThan(490);
  });
});

describe('key-lock (WSOLA)', () => {
  function zc(data: number[], from: number, to: number): number {
    let c = 0;
    for (let i = from + 1; i < to; i++) {
      if ((data[i - 1]! < 0 && data[i]! >= 0) || (data[i - 1]! >= 0 && data[i]! < 0)) c++;
    }
    return c;
  }

  it('preserves pitch under varispeed when engaged (vs. pitch drop without)', () => {
    const make = (keylock: boolean) => {
      const h = new Harness(sine440);
      h.runSeconds(4);
      h.dsp.seekBehind(2); // playhead 2 s behind live → safe WSOLA headroom
      if (keylock) h.dsp.setKeylock(true);
      h.dsp.setRate(0.8);
      h.runSeconds(1.5);
      const start = h.out.length - Math.floor(0.8 * SR);
      return zc(h.out, start, h.out.length);
    };
    const plain = make(false); // varispeed → ~0.8×440 ≈ 352 Hz
    const locked = make(true); // key-lock → ~440 Hz preserved
    const plainHz = (plain / 2 / (0.8 * SR)) * SR;
    const lockedHz = (locked / 2 / (0.8 * SR)) * SR;
    expect(plainHz).toBeGreaterThan(330);
    expect(plainHz).toBeLessThan(375);
    expect(Math.abs(lockedHz - 440) / 440).toBeLessThan(0.05);
  });
});

describe('track mode', () => {
  it('marks a region, plays it, auto-pauses at the end, restarts', () => {
    const h = new Harness(ramp);
    h.runSeconds(1);
    h.dsp.trackMark(); // start ≈ 1.0 s
    h.runSeconds(2);
    h.dsp.trackMark(); // end ≈ 3.0 s → track mode, paused at start

    let status = h.dsp.status;
    expect(status.mode).toBe('track');
    expect(status.playing).toBe(false);
    expect(status.readPos).toBeCloseTo(status.trackStart!, -2);

    h.dsp.play();
    h.runSeconds(0.5);
    // Playing track content from ≈1.0 s while live is ≈3.5 s.
    const mid = h.out[h.out.length - Math.floor(0.1 * SR)]!;
    expect(mid).toBeGreaterThan(1.0);
    expect(mid).toBeLessThan(1.7);

    // Run past the end: auto-pause at trackEnd.
    h.runSeconds(2.5);
    status = h.dsp.status;
    expect(status.playing).toBe(false);
    expect(status.readPos).toBeCloseTo(status.trackEnd!, -2);

    h.dsp.trackRestart();
    h.dsp.play();
    h.runSeconds(0.2);
    const afterRestart = h.out[h.out.length - 1]!;
    expect(afterRestart).toBeGreaterThan(0.9);
    expect(afterRestart).toBeLessThan(1.5);
  });

  it('brake during track resumes in place, not at live', () => {
    const h = new Harness(ramp);
    h.runSeconds(1);
    h.dsp.trackMark();
    h.runSeconds(1);
    h.dsp.trackMark();
    h.dsp.play();
    h.runSeconds(0.3);

    h.dsp.setBrakeTime(0.2);
    h.dsp.brake();
    h.runSeconds(0.4);
    h.dsp.release();
    h.runSeconds(0.3);

    const status = h.dsp.status;
    expect(status.mode).toBe('track');
    // Still in the track region (1.0–2.0 s), nowhere near live (≈3.2 s).
    expect(status.readPos / SR).toBeGreaterThan(1.0);
    expect(status.readPos / SR).toBeLessThan(2.1);
  });
});
