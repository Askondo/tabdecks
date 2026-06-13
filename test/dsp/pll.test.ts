import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PLL,
  phaseError,
  phaseOf,
  syncRate,
  type GridSnapshot,
} from '../../src/dsp/pll';

const SR = 48000;

describe('phase math', () => {
  const grid: GridSnapshot = { bpm: 120, anchor: 1000 };

  it('phaseOf wraps correctly', () => {
    expect(phaseOf(1000, grid, SR)).toBe(0);
    expect(phaseOf(1000 + 12000, grid, SR)).toBeCloseTo(0.5, 10);
    expect(phaseOf(1000 - 12000, grid, SR)).toBeCloseTo(0.5, 10); // negative side
  });

  it('phaseError takes the shortest path', () => {
    expect(phaseError(0.1, 0.9)).toBeCloseTo(0.2, 10);
    expect(phaseError(0.9, 0.1)).toBeCloseTo(-0.2, 10);
    expect(phaseError(0.5, 0.5)).toBe(0);
  });
});

describe('syncRate', () => {
  it('matches tempo including the master rate', () => {
    const out = syncRate({
      masterGrid: { bpm: 120, anchor: 0 },
      masterPos: 0,
      masterRate: 1.05,
      deckGrid: { bpm: 126, anchor: 0 },
      deckPos: 0,
      sampleRate: SR,
    });
    expect(out.ratio).toBeCloseTo((120 * 1.05) / 126, 10);
    expect(out.errorBeats).toBe(0);
    expect(out.rate).toBeCloseTo(out.ratio, 10);
  });

  it('clamps to 1 ± maxDev and reports out-of-range ratios', () => {
    const out = syncRate({
      masterGrid: { bpm: 174, anchor: 0 },
      masterPos: 0,
      masterRate: 1,
      deckGrid: { bpm: 120, anchor: 0 },
      deckPos: 0,
      sampleRate: SR,
    });
    expect(out.ratioInRange).toBe(false);
    expect(out.rate).toBe(1 + DEFAULT_PLL.maxDev);
  });
});

describe('closed-loop PLL simulation', () => {
  /** Simulate the real control loop: 20 Hz rate updates, playheads advance. */
  function simulate(opts: {
    masterBpm: number;
    deckBpm: number;
    startOffsetBeats: number;
    seconds: number;
    masterRateAt?: (t: number) => number;
  }) {
    const dt = 0.05; // 20 Hz status cadence
    const masterGrid: GridSnapshot = { bpm: opts.masterBpm, anchor: 0 };
    const deckGrid: GridSnapshot = { bpm: opts.deckBpm, anchor: 0 };
    const deckPeriod = (60 / opts.deckBpm) * SR;
    let masterPos = 0;
    let deckPos = opts.startOffsetBeats * deckPeriod;
    let rate = 1;
    const errors: number[] = [];
    for (let t = 0; t < opts.seconds; t += dt) {
      const masterRate = opts.masterRateAt?.(t) ?? 1;
      masterPos += masterRate * dt * SR;
      deckPos += rate * dt * SR;
      const out = syncRate({ masterGrid, masterPos, masterRate, deckGrid, deckPos, sampleRate: SR });
      rate = out.rate;
      errors.push(out.errorBeats);
    }
    return errors;
  }

  it('converges phase error below 10 ms within 4 bars at 120 BPM', () => {
    const errors = simulate({ masterBpm: 120, deckBpm: 120, startOffsetBeats: 0.4, seconds: 8 });
    // 4 bars at 120 BPM = 8 s; 10 ms = 0.02 beats.
    const tail = errors.slice(-20);
    for (const e of tail) expect(Math.abs(e)).toBeLessThan(0.02);
  });

  it('converges across a tempo difference (126 → synced to 120)', () => {
    const errors = simulate({ masterBpm: 120, deckBpm: 126, startOffsetBeats: -0.3, seconds: 10 });
    const tail = errors.slice(-20);
    for (const e of tail) expect(Math.abs(e)).toBeLessThan(0.02);
  });

  it('holds lock through master rate wobble (±0.5 BPM equivalent)', () => {
    const errors = simulate({
      masterBpm: 120,
      deckBpm: 120,
      startOffsetBeats: 0.1,
      seconds: 20,
      masterRateAt: (t) => 1 + (0.5 / 120) * Math.sin(t * 0.7),
    });
    const tail = errors.slice(-200); // last 10 s
    for (const e of tail) expect(Math.abs(e)).toBeLessThan(0.05);
  });

  it('never exceeds the rate clamp during convergence', () => {
    const dt = 0.05;
    let masterPos = 0;
    let deckPos = 0.5 * (60 / 120) * SR;
    let rate = 1;
    for (let t = 0; t < 8; t += dt) {
      masterPos += dt * SR;
      deckPos += rate * dt * SR;
      const out = syncRate({
        masterGrid: { bpm: 120, anchor: 0 },
        masterPos,
        masterRate: 1,
        deckGrid: { bpm: 120, anchor: 0 },
        deckPos,
        sampleRate: SR,
      });
      rate = out.rate;
      expect(rate).toBeGreaterThanOrEqual(1 - DEFAULT_PLL.maxDev);
      expect(rate).toBeLessThanOrEqual(1 + DEFAULT_PLL.maxDev);
    }
  });
});
