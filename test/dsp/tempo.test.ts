import { describe, expect, it } from 'vitest';
import { ONSET_HOP, OnsetDetector } from '../../src/dsp/onset-detect';
import { TempoInducer } from '../../src/dsp/tempo-induction';

const SR = 48000;
const FRAME_RATE = SR / ONSET_HOP;

interface SynthOpts {
  swingMs?: number;
  noise?: number;
  hats?: boolean;
}

/** Kick on every beat, optional offbeat hats, swing jitter, noise. */
function synth(seconds: number, bpm: number, opts: SynthOpts = {}): Float32Array {
  const n = Math.floor(seconds * SR);
  const out = new Float32Array(n);
  const beatLen = (60 / bpm) * SR;
  const beats = Math.floor(n / beatLen);
  for (let b = 0; b <= beats; b++) {
    const jitter = opts.swingMs ? (Math.random() * 2 - 1) * (opts.swingMs / 1000) * SR : 0;
    const start = Math.round(b * beatLen + jitter);
    for (let i = 0; i < 0.1 * SR && start + i < n; i++) {
      const t = i / SR;
      out[start + i]! += Math.sin(2 * Math.PI * 60 * t) * Math.exp(-t * 30) * 0.9;
    }
    if (opts.hats) {
      const h = Math.round(start + beatLen / 2);
      for (let i = 0; i < 0.02 * SR && h + i < n; i++) {
        out[h + i]! += (Math.random() * 2 - 1) * Math.exp((-i / SR) * 200) * 0.3;
      }
    }
  }
  if (opts.noise) {
    for (let i = 0; i < n; i++) out[i]! += (Math.random() * 2 - 1) * opts.noise;
  }
  return out;
}

function induce(audio: Float32Array) {
  const det = new OnsetDetector(SR);
  const ind = new TempoInducer(FRAME_RATE);
  let frame = 0;
  for (let i = 0; i < audio.length; i += 128) {
    det.process(audio.subarray(i, Math.min(i + 128, audio.length)));
    const frames = det.drainFrames();
    if (frames.length) {
      ind.addFrames(frames, frame);
      frame += frames.length;
    }
  }
  return ind.estimate();
}

describe('TempoInducer accuracy', () => {
  for (const bpm of [85, 120, 128, 174]) {
    it(`detects ${bpm} BPM within ±0.5 %`, () => {
      const est = induce(synth(15, bpm, { hats: true, noise: 0.02, swingMs: 4 }));
      expect(est).not.toBeNull();
      expect(Math.abs(est!.bpm - bpm) / bpm).toBeLessThan(0.005);
      expect(est!.confidence).toBeGreaterThan(0.3);
    });
  }

  it('locates beat phase within ±15 ms', () => {
    const bpm = 120;
    const est = induce(synth(15, bpm))!;
    const beatFrames = (60 / bpm) * FRAME_RATE;
    // anchorFrame should sit near a multiple of the beat period (beats start at 0).
    const phase = est.anchorFrame % beatFrames;
    const errFrames = Math.min(phase, beatFrames - phase);
    const errMs = (errFrames / FRAME_RATE) * 1000;
    expect(errMs).toBeLessThan(15);
  });

  it('tracks a tempo change within 8 seconds', () => {
    const det = new OnsetDetector(SR);
    const ind = new TempoInducer(FRAME_RATE, 8); // 8 s window for tracking
    const a = synth(12, 120);
    const b = synth(8, 140);
    let frame = 0;
    const feed = (audio: Float32Array) => {
      for (let i = 0; i < audio.length; i += 128) {
        det.process(audio.subarray(i, Math.min(i + 128, audio.length)));
        const frames = det.drainFrames();
        ind.addFrames(frames, frame);
        frame += frames.length;
      }
    };
    feed(a);
    expect(Math.abs(ind.estimate()!.bpm - 120)).toBeLessThan(1);
    feed(b); // 8 s of the new tempo
    expect(Math.abs(ind.estimate()!.bpm - 140)).toBeLessThan(1.5);
  });

  it('reports low confidence on aperiodic input', () => {
    const noise = new Float32Array(SR * 15);
    for (let i = 0; i < noise.length; i++) noise[i] = (Math.random() * 2 - 1) * 0.3;
    const est = induce(noise);
    if (est) expect(est.confidence).toBeLessThan(0.15);
  });

  it('returns null on silence', () => {
    expect(induce(new Float32Array(SR * 15))).toBeNull();
  });
});
