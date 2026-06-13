import { describe, expect, it } from 'vitest';
import { TransportDsp } from '../../src/dsp/transport-dsp';

const SR = 48000;
const BLOCK = 128;

/** Ramp input: sample value == absolute sample index / SR (identifies time). */
class Harness {
  readonly dsp = new TransportDsp(SR, 10, 2);
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

  get written(): number {
    return this.dsp.status.written;
  }
}

describe('scheduled actions', () => {
  it('does not fire before the boundary', () => {
    const h = new Harness();
    h.runSeconds(1);
    const boundary = h.written + SR; // 1 s ahead
    h.dsp.schedule(boundary, 'written', { type: 'stutter', sliceSeconds: 0.125 });
    h.runSeconds(0.5); // still before the boundary
    expect(h.dsp.status.gesture).toBe('none');
    expect(h.dsp.status.pending).toBe(1);
  });

  it('stutter loop is anchored exactly at the boundary sample', () => {
    // Low sample rate makes the seam crossfade only 8 samples long, so loop
    // wraps are sharp and the anchor can be pinned to ±1 sample by value.
    const SR2 = 800;
    const dsp = new TransportDsp(SR2, 60, 2);
    const out: number[] = [];
    let t = 0;
    const run = (samples: number) => {
      for (let done = 0; done < samples; done += BLOCK) {
        const input = new Float32Array(BLOCK);
        for (let i = 0; i < BLOCK; i++) input[i] = t++ / SR2;
        const o = [new Float32Array(BLOCK), new Float32Array(BLOCK)];
        dsp.processBlock([input, input], o);
        for (let i = 0; i < BLOCK; i++) out.push(o[0]![i]!);
      }
    };

    run(SR2 * 4);
    const slice = 0.125; // 100 samples at SR2
    const sliceLen = slice * SR2;
    const boundary = dsp.status.written + 77; // NOT block-aligned
    dsp.schedule(boundary, 'written', { type: 'stutter', sliceSeconds: slice });
    run(SR2 * 2);
    expect(dsp.status.gesture).toBe('stutter');

    // Ramp input: the loop's first sample replays exactly the loop start
    // value lo = (boundary - sliceLen)/SR2. Find all exact lo-hits in the
    // tail; they must exist and be spaced exactly one slice apart.
    const tail = out.slice(-SR2);
    const lo = (boundary - sliceLen) / SR2;
    const hits: number[] = [];
    for (let i = 0; i < tail.length; i++) {
      if (Math.abs(tail[i]! - lo) < 1e-4 && (hits.length === 0 || i - hits[hits.length - 1]! > 2)) {
        hits.push(i);
      }
    }
    expect(hits.length).toBeGreaterThanOrEqual(3);
    for (let i = 1; i < hits.length; i++) {
      expect(hits[i]! - hits[i - 1]!).toBe(sliceLen);
    }
  });

  it('quantized seek lands in phase (target + elapsed-since-boundary)', () => {
    const h = new Harness();
    h.runSeconds(3);
    const boundary = h.written + 999; // not block-aligned
    const target = SR; // jump to t = 1.0 s in history
    h.dsp.schedule(boundary, 'written', { type: 'seekAbs', target });
    h.runSeconds(0.5);

    // After the jump, output value v at out-index k satisfies:
    // v·SR - target == (absNow - boundary)  → phase carried over exactly.
    const status = h.dsp.status;
    const expectedOffset = status.readPos - target;
    const actualElapsed = status.written - boundary;
    expect(expectedOffset).toBeCloseTo(actualElapsed, 0);
  });

  it('replaces a pending action of the same type and cancels on demand', () => {
    const h = new Harness();
    h.runSeconds(1);
    h.dsp.schedule(h.written + SR, 'written', { type: 'stutter', sliceSeconds: 0.125 });
    h.dsp.schedule(h.written + 2 * SR, 'written', { type: 'stutter', sliceSeconds: 0.25 });
    expect(h.dsp.status.pending).toBe(1); // replaced, not stacked
    h.dsp.cancelScheduled('stutter');
    expect(h.dsp.status.pending).toBe(0);
    h.runSeconds(2.5);
    expect(h.dsp.status.gesture).toBe('none'); // never fired
  });

  it('fires immediately when the boundary is already past', () => {
    const h = new Harness();
    h.runSeconds(1);
    h.dsp.schedule(h.written - 100, 'written', { type: 'pause' });
    h.run(1);
    expect(h.dsp.status.playing).toBe(false);
    expect(h.dsp.status.pending).toBe(0);
  });

  it('readPos-domain action waits for the playhead, not the wall clock', () => {
    const h = new Harness();
    h.runSeconds(3);
    h.dsp.seekBehind(2); // playhead 2 s behind live
    h.run(2);
    const boundary = h.dsp.status.readPos + 0.5 * SR;
    h.dsp.schedule(boundary, 'readPos', { type: 'pause' });
    h.runSeconds(0.25); // playhead advanced only ~0.25 s
    expect(h.dsp.status.playing).toBe(true);
    h.runSeconds(0.5);
    expect(h.dsp.status.playing).toBe(false);
    // Pause ramps the rate down over ~10 ms (click-free by design), so the
    // playhead coasts a little past the boundary — assert within ~20 ms.
    expect(Math.abs(h.dsp.status.readPos - boundary)).toBeLessThan(0.02 * SR);
  });
});
