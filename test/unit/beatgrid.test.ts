import { describe, expect, it } from 'vitest';
import { BeatGrid } from '../../src/audio/beatgrid';

const SR = 48000;

function manualGrid(bpm = 120, anchor = 1000): BeatGrid {
  const g = new BeatGrid(SR);
  g.setManualBpm(bpm, anchor);
  return g;
}

describe('BeatGrid math', () => {
  it('round-trips beat index ↔ sample', () => {
    const g = manualGrid(120, 1000); // period = 24000
    expect(g.beatSamples).toBe(24000);
    expect(g.beatIndexAt(1000)).toBe(0);
    expect(g.beatIndexAt(1000 + 24000 * 2.5)).toBeCloseTo(2.5, 10);
    expect(g.sampleAtBeat(3)).toBe(1000 + 72000);
  });

  it('nearestBeat snaps both directions', () => {
    const g = manualGrid(120, 0);
    expect(g.nearestBeat(11000)).toBe(0); // < half period
    expect(g.nearestBeat(13000)).toBe(24000);
    expect(g.nearestBeat(24000)).toBe(24000);
  });

  it('nextBoundary is strictly after the position', () => {
    const g = manualGrid(120, 0);
    expect(g.nextBoundary(0, 1)).toBe(24000); // exactly on a boundary → next one
    expect(g.nextBoundary(1, 1)).toBe(24000);
    expect(g.nextBoundary(24000, 1)).toBe(48000);
    // 4-beat (1-bar) quantum
    expect(g.nextBoundary(30000, 4)).toBe(96000);
    // quarter-beat quantum
    expect(g.nextBoundary(3000, 0.25)).toBe(6000);
  });

  it('returns null without a grid', () => {
    const g = new BeatGrid(SR);
    expect(g.beatIndexAt(0)).toBeNull();
    expect(g.nextBoundary(0, 1)).toBeNull();
    expect(g.state.bpm).toBeNull();
  });
});

describe('BeatGrid tap + nudge + modes', () => {
  it('tap tempo sets a manual grid from intervals', () => {
    const g = new BeatGrid(SR);
    const period = (60 / 128) * SR;
    for (let i = 0; i < 4; i++) g.tap(100000 + i * period);
    expect(g.state.source).toBe('manual');
    expect(g.state.bpm).toBeCloseTo(128, 1);
    expect(g.state.anchor).toBeCloseTo(100000 + 3 * period, 0);
    expect(g.state.confidence).toBe(1);
  });

  it('stale taps are discarded (3 s window)', () => {
    const g = new BeatGrid(SR);
    g.tap(0);
    g.tap(SR * 10); // 10 s later — first tap dropped, still only 1 live tap
    expect(g.state.bpm).toBeNull();
  });

  it('nudge shifts the anchor by milliseconds', () => {
    const g = manualGrid(120, 1000);
    g.nudge(10);
    expect(g.state.anchor).toBe(1000 + 480);
    g.nudge(-20);
    expect(g.state.anchor).toBe(1000 - 480);
  });

  it('manual mode ignores detections; clearManual re-enables auto', () => {
    const g = manualGrid(120, 0);
    g.updateFromDetection({ bpm: 174, anchorFrame: 100, confidence: 0.9 });
    expect(g.state.bpm).toBe(120);
    g.clearManual();
    g.updateFromDetection({ bpm: 174, anchorFrame: 100, confidence: 0.9 });
    expect(g.state.bpm).toBeCloseTo(174, 5);
    expect(g.state.source).toBe('auto');
  });

  it('auto smoothing: small phase drift keeps the old anchor', () => {
    const g = new BeatGrid(SR);
    g.updateFromDetection({ bpm: 120, anchorFrame: 1000, confidence: 0.8 });
    const anchor1 = g.state.anchor!;
    // Same tempo, phase off by ~10 ms (< 30 ms threshold) → anchor unchanged.
    const driftFrames = 1000 + (0.01 * SR) / 512;
    g.updateFromDetection({ bpm: 120, anchorFrame: driftFrames, confidence: 0.8 });
    expect(g.state.anchor).toBe(anchor1);
  });

  it('low-confidence estimates decay confidence but keep the grid', () => {
    const g = new BeatGrid(SR);
    g.updateFromDetection({ bpm: 120, anchorFrame: 1000, confidence: 0.8 });
    g.updateFromDetection({ bpm: 90, anchorFrame: 5, confidence: 0.05 });
    expect(g.state.bpm).toBeCloseTo(120, 5);
    expect(g.state.confidence).toBeLessThan(0.8);
  });
});
