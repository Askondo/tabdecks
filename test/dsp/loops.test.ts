import { describe, expect, it } from 'vitest';
import { TransportDsp } from '../../src/dsp/transport-dsp';

const SR = 48000;
const BLOCK = 128;

/** Ramp input: sample value == absolute sample index / SR. */
class Harness {
  readonly dsp = new TransportDsp(SR, 20, 2);
  readonly out: number[] = [];
  private t = 0;

  run(blocks: number): void {
    for (let b = 0; b < blocks; b++) {
      const input = new Float32Array(BLOCK);
      for (let i = 0; i < BLOCK; i++) input[i] = this.t++ / SR;
      const outL = new Float32Array(BLOCK);
      const outR = new Float32Array(BLOCK);
      this.dsp.processBlock([input, input], [outL, outR]);
      for (let i = 0; i < BLOCK; i++) this.out.push(outL[i]!);
    }
  }

  runSeconds(s: number): void {
    this.run(Math.ceil((s * SR) / BLOCK));
  }
}

describe('bar loops', () => {
  // 120 BPM, 4 beats/bar → 1 bar = 2 s = 96000 samples.
  const BAR = 96000;

  it('wraps exactly at the region length and stays inside the region', () => {
    const h = new Harness();
    h.runSeconds(6);
    const start = 2 * SR;
    const end = start + BAR; // 1 bar
    h.dsp.setLoop(start, end);
    h.runSeconds(5); // 2.5 loop passes

    expect(h.dsp.status.loopStart).toBe(start);
    // Output values stay within the region (modulo the short wrap fade
    // blending toward in-region values).
    const tail = h.out.slice(-SR);
    for (const v of tail) {
      expect(v).toBeGreaterThanOrEqual(start / SR - 0.006);
      expect(v).toBeLessThanOrEqual(end / SR + 0.006);
    }
    // Loop periodicity: values one region-length apart match (outside fades).
    const probe = h.out.length - SR;
    for (let k = 0; k < 1000; k += 7) {
      const a = h.out[probe + k]!;
      const b = h.out[probe + k - BAR]!;
      expect(Math.abs(a - b)).toBeLessThan(0.01);
    }
  });

  it('engaging from LIVE enters timeshift and keeps the playhead in place', () => {
    const h = new Harness();
    h.runSeconds(6);
    expect(h.dsp.status.mode).toBe('live');
    const before = h.dsp.status.written;
    // Region = current bar (contains the playhead).
    const start = before - 10000;
    h.dsp.setLoop(start, start + BAR);
    expect(h.dsp.status.mode).toBe('timeshift');
    // Playhead stayed at the live position (inside the region — no snap).
    expect(Math.abs(h.dsp.status.readPos - before)).toBeLessThan(BLOCK * 2);
  });

  it('snaps to the loop start when the playhead is outside the region', () => {
    const h = new Harness();
    h.runSeconds(6);
    const start = SR; // far behind
    h.dsp.setLoop(start, start + BAR);
    expect(Math.abs(h.dsp.status.readPos - start)).toBeLessThan(2);
  });

  it('varispeed inside the loop preserves the region bounds', () => {
    const h = new Harness();
    h.runSeconds(8);
    const start = 2 * SR;
    const end = start + BAR;
    h.dsp.setLoop(start, end);
    h.dsp.setRate(0.5);
    h.runSeconds(6);
    const tail = h.out.slice(-SR);
    for (const v of tail) {
      expect(v).toBeGreaterThanOrEqual(start / SR - 0.006);
      expect(v).toBeLessThanOrEqual(end / SR + 0.006);
    }
  });

  it('clearLoop continues from the current in-loop position', () => {
    const h = new Harness();
    h.runSeconds(6);
    const start = 2 * SR;
    h.dsp.setLoop(start, start + BAR);
    h.runSeconds(1);
    const inLoop = h.dsp.status.readPos;
    h.dsp.clearLoop();
    h.runSeconds(0.5);
    expect(h.dsp.status.loopStart).toBeNull();
    // Continued forward from where it was — no jump to live or loop start.
    expect(h.dsp.status.readPos).toBeGreaterThan(inLoop);
    expect(h.dsp.status.readPos).toBeLessThan(inLoop + 0.6 * SR);
  });

  it('jumpLive clears the loop', () => {
    const h = new Harness();
    h.runSeconds(6);
    h.dsp.setLoop(2 * SR, 2 * SR + BAR);
    h.dsp.jumpLive();
    expect(h.dsp.status.loopStart).toBeNull();
    expect(h.dsp.status.mode).toBe('live');
  });
});
