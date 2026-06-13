import { describe, expect, it } from 'vitest';
import { LinkClockEstimator } from '../../src/dsp/clock-offset';

const BPM = 120;
const BPS = BPM / 60;

describe('LinkClockEstimator', () => {
  it('projects the Link beat after locking', () => {
    const est = new LinkClockEstimator(9);
    const truePhase = 3.5;
    // Clean samples: linkBeat = bps·t + truePhase.
    for (let t = 0; t < 1; t += 0.1) est.update(BPS * t + truePhase, BPM, t);
    expect(est.locked).toBe(true);
    expect(est.beatAt(2)).toBeCloseTo(BPS * 2 + truePhase, 6);
  });

  it('rejects transit jitter via the median', () => {
    const est = new LinkClockEstimator(9);
    const truePhase = 1.0;
    let seed = 42;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff - 0.5;
    };
    for (let i = 0; i < 40; i++) {
      const t = i * 0.05;
      const jitter = rand() * 0.02; // ±10 ms transit jitter in beat terms
      est.update(BPS * t + truePhase + jitter, BPM, t);
    }
    // Median estimate stays within the jitter band, not skewed by it.
    expect(Math.abs(est.beatAt(5) - (BPS * 5 + truePhase))).toBeLessThan(0.01);
  });

  it('is unmoved by a single large outlier', () => {
    const est = new LinkClockEstimator(9);
    const truePhase = 0;
    for (let i = 0; i < 9; i++) est.update(BPS * (i * 0.05) + truePhase, BPM, i * 0.05);
    const before = est.beatAt(10);
    // Inject one wildly wrong sample (e.g. a GC pause delayed the read).
    est.update(BPS * 0.5 + truePhase + 5, BPM, 0.5);
    const after = est.beatAt(10);
    expect(Math.abs(after - before)).toBeLessThan(0.2); // median absorbs it
  });

  it('re-locks after a tempo change instead of mixing stale phases', () => {
    const est = new LinkClockEstimator(5);
    for (let i = 0; i < 5; i++) est.update(BPS * (i * 0.05), BPM, i * 0.05);
    expect(est.locked).toBe(true);
    // Tempo jumps to 140; window resets.
    const newBps = 140 / 60;
    est.update(newBps * 1.0 + 2, 140, 1.0);
    expect(est.locked).toBe(false);
    expect(est.beatsPerSecond).toBeCloseTo(newBps, 6);
    for (let i = 1; i < 5; i++) est.update(newBps * (1 + i * 0.05) + 2, 140, 1 + i * 0.05);
    expect(est.beatAt(3)).toBeCloseTo(newBps * 3 + 2, 4);
  });
});
