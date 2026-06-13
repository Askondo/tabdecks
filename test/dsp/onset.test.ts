import { describe, expect, it } from 'vitest';
import { ONSET_HOP, OnsetDetector } from '../../src/dsp/onset-detect';

const SR = 48000;

/** Synthesize seconds of audio: kicks (decaying 60 Hz bursts) at beat times. */
function synthKicks(seconds: number, bpm: number, opts: { noise?: number; dc?: number } = {}): Float32Array {
  const n = Math.floor(seconds * SR);
  const out = new Float32Array(n);
  const beatLen = (60 / bpm) * SR;
  for (let i = 0; i < n; i++) {
    const sinceBeat = i % beatLen;
    if (sinceBeat < 0.12 * SR) {
      const t = sinceBeat / SR;
      out[i] = Math.sin(2 * Math.PI * 60 * t) * Math.exp(-t * 30) * 0.9;
    }
    if (opts.noise) out[i]! += (Math.random() * 2 - 1) * opts.noise;
    if (opts.dc) out[i]! += opts.dc;
  }
  return out;
}

function detect(audio: Float32Array): number[] {
  const det = new OnsetDetector(SR);
  // Feed in worklet-sized blocks.
  for (let i = 0; i < audio.length; i += 128) {
    det.process(audio.subarray(i, Math.min(i + 128, audio.length)));
  }
  return det.drainFrames();
}

describe('OnsetDetector', () => {
  it('emits one frame per hop', () => {
    const frames = detect(new Float32Array(ONSET_HOP * 10));
    expect(frames.length).toBe(10);
  });

  it('peaks at kick onsets and stays low between them', () => {
    const bpm = 120;
    const frames = detect(synthKicks(4, bpm));
    const frameRate = SR / ONSET_HOP;
    const beatFrames = (60 / bpm) * frameRate; // 46.875 frames per beat

    // Frames near beat starts should dominate frames mid-beat.
    let onBeat = 0;
    let offBeat = 0;
    for (let b = 1; b < 7; b++) {
      const at = Math.round(b * beatFrames);
      onBeat += Math.max(...frames.slice(at - 2, at + 3));
      offBeat += frames[at + Math.round(beatFrames / 2)]!;
    }
    expect(onBeat).toBeGreaterThan(offBeat * 5);
  });

  it('is immune to DC offset', () => {
    const clean = detect(synthKicks(3, 128));
    const dc = detect(synthKicks(3, 128, { dc: 0.3 }));
    // Envelope shape comparable — total flux within 2× of clean.
    const sum = (a: number[]) => a.reduce((s, v) => s + v, 0);
    expect(sum(dc)).toBeLessThan(sum(clean) * 2);
    expect(sum(dc)).toBeGreaterThan(sum(clean) * 0.5);
  });

  it('produces near-zero envelope on silence and steady noise floor', () => {
    const silent = detect(new Float32Array(SR * 2));
    expect(Math.max(...silent)).toBe(0);

    const noise = new Float32Array(SR * 2);
    for (let i = 0; i < noise.length; i++) noise[i] = (Math.random() * 2 - 1) * 0.05;
    const frames = detect(noise).slice(5); // skip filter settle
    const mean = frames.reduce((s, v) => s + v, 0) / frames.length;
    expect(mean).toBeLessThan(0.01);
  });
});
