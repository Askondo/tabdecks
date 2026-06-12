import { describe, expect, it } from 'vitest';
import { clamp01, dbToGain, equalPowerPair, faderGain, gainToDb } from '../../src/dsp/curves';

describe('equalPowerPair', () => {
  it('preserves total power across the sweep (a² + b² = 1)', () => {
    for (let x = 0; x <= 1.0001; x += 0.01) {
      const [a, b] = equalPowerPair(x);
      expect(a * a + b * b).toBeCloseTo(1, 10);
    }
  });

  it('is full A at 0, full B at 1, equal at center', () => {
    expect(equalPowerPair(0)).toEqual([1, 0]);
    const [a1, b1] = equalPowerPair(1);
    expect(a1).toBeCloseTo(0, 10);
    expect(b1).toBeCloseTo(1, 10);
    const [ac, bc] = equalPowerPair(0.5);
    expect(ac).toBeCloseTo(bc, 10);
    expect(ac).toBeCloseTo(Math.SQRT1_2, 10);
  });

  it('clamps out-of-range positions', () => {
    expect(equalPowerPair(-1)).toEqual(equalPowerPair(0));
    expect(equalPowerPair(2)).toEqual(equalPowerPair(1));
  });

  it('A falls and B rises monotonically', () => {
    let prevA = Infinity;
    let prevB = -Infinity;
    for (let x = 0; x <= 1.0001; x += 0.05) {
      const [a, b] = equalPowerPair(x);
      expect(a).toBeLessThanOrEqual(prevA);
      expect(b).toBeGreaterThanOrEqual(prevB);
      prevA = a;
      prevB = b;
    }
  });
});

describe('faderGain', () => {
  it('is silent at 0 and unity at 1', () => {
    expect(faderGain(0)).toBe(0);
    expect(faderGain(1)).toBe(1);
  });

  it('is monotonic and below-linear in the middle (quadratic taper)', () => {
    let prev = -1;
    for (let x = 0; x <= 1.0001; x += 0.05) {
      const g = faderGain(x);
      expect(g).toBeGreaterThan(prev);
      prev = g;
    }
    expect(faderGain(0.5)).toBeLessThan(0.5);
  });

  it('clamps out-of-range input', () => {
    expect(faderGain(-0.5)).toBe(0);
    expect(faderGain(1.5)).toBe(1);
  });
});

describe('dB conversion', () => {
  it('round-trips', () => {
    for (const db of [-60, -20, -6, 0, 6]) {
      expect(gainToDb(dbToGain(db))).toBeCloseTo(db, 10);
    }
  });

  it('has the expected anchors', () => {
    expect(dbToGain(0)).toBe(1);
    expect(dbToGain(-6)).toBeCloseTo(0.5012, 3);
  });
});

describe('clamp01', () => {
  it('clamps', () => {
    expect(clamp01(-1)).toBe(0);
    expect(clamp01(0.25)).toBe(0.25);
    expect(clamp01(7)).toBe(1);
  });
});
