import { ONSET_HOP } from '@/dsp/onset-detect';
import type { TempoEstimate } from '@/dsp/tempo-induction';

export interface BeatGridState {
  bpm: number | null;
  /** Absolute sample position of a beat (grid anchor). */
  anchor: number | null;
  /** 0..1; manual grids report 1. */
  confidence: number;
  source: 'auto' | 'manual';
}

/**
 * Per-deck beat grid over the recorded timeline (absolute samples — same
 * addressing as the transport ring buffer and PeakStore).
 *
 * Auto mode follows the tempo inducer with smoothing: BPM blends toward new
 * estimates; the anchor only moves when the detected phase drifts > 30 ms
 * (otherwise the old phase is kept, projected forward) so the grid doesn't
 * jitter between estimates.
 */
export class BeatGrid {
  private bpm: number | null = null;
  private anchor: number | null = null;
  private confidence = 0;
  private source: 'auto' | 'manual' = 'auto';
  private taps: number[] = [];

  onChange: (() => void) | null = null;

  constructor(readonly sampleRate: number) {}

  get state(): BeatGridState {
    return {
      bpm: this.bpm,
      anchor: this.anchor,
      confidence: this.source === 'manual' ? 1 : this.confidence,
      source: this.source,
    };
  }

  /** Samples per beat, or null without a grid. */
  get beatSamples(): number | null {
    return this.bpm ? (60 / this.bpm) * this.sampleRate : null;
  }

  // ── Auto detection ───────────────────────────────────────────────────────

  updateFromDetection(est: TempoEstimate): void {
    if (this.source === 'manual') return;
    if (est.confidence < 0.2) {
      this.confidence = Math.max(0, this.confidence - 0.1); // decay, keep grid
      this.onChange?.();
      return;
    }

    const newAnchor = est.anchorFrame * ONSET_HOP + ONSET_HOP / 2;
    if (this.bpm !== null && Math.abs(est.bpm - this.bpm) / this.bpm < 0.04) {
      // Same tempo: blend BPM; keep phase unless it drifted audibly.
      this.bpm = 0.8 * this.bpm + 0.2 * est.bpm;
      const period = this.beatSamples!;
      const phaseErr = this.phaseErrorSamples(newAnchor, period);
      if (Math.abs(phaseErr) > 0.03 * this.sampleRate) this.anchor = newAnchor;
    } else {
      this.bpm = est.bpm;
      this.anchor = newAnchor;
    }
    this.confidence = est.confidence;
    this.onChange?.();
  }

  private phaseErrorSamples(pos: number, period: number): number {
    if (this.anchor === null) return Infinity;
    const off = (pos - this.anchor) % period;
    return off > period / 2 ? off - period : off;
  }

  // ── Manual control ───────────────────────────────────────────────────────

  setManualBpm(bpm: number, anchor?: number): void {
    this.bpm = Math.min(300, Math.max(30, bpm));
    if (anchor !== undefined) this.anchor = anchor;
    this.anchor ??= 0;
    this.source = 'manual';
    this.onChange?.();
  }

  /** Back to auto detection (grid kept until the next estimate). */
  clearManual(): void {
    this.source = 'auto';
    this.taps = [];
    this.onChange?.();
  }

  /** Register a tap at an absolute sample; ≥2 recent taps set a manual grid. */
  tap(absSample: number): void {
    const windowSamples = 3 * this.sampleRate;
    this.taps = this.taps.filter((t) => absSample - t < windowSamples);
    this.taps.push(absSample);
    if (this.taps.length >= 2) {
      let sum = 0;
      for (let i = 1; i < this.taps.length; i++) sum += this.taps[i]! - this.taps[i - 1]!;
      const period = sum / (this.taps.length - 1);
      this.setManualBpm((60 * this.sampleRate) / period, absSample);
    }
  }

  /** Shift the grid anchor by milliseconds (audible nudge). */
  nudge(ms: number): void {
    if (this.anchor === null) return;
    this.anchor += (ms / 1000) * this.sampleRate;
    this.onChange?.();
  }

  // ── Grid math ────────────────────────────────────────────────────────────

  /** Fractional beat index at an absolute sample (0 at the anchor). */
  beatIndexAt(absSample: number): number | null {
    const period = this.beatSamples;
    if (period === null || this.anchor === null) return null;
    return (absSample - this.anchor) / period;
  }

  sampleAtBeat(beatIndex: number): number | null {
    const period = this.beatSamples;
    if (period === null || this.anchor === null) return null;
    return this.anchor + beatIndex * period;
  }

  /** Absolute sample of the beat nearest to absSample. */
  nearestBeat(absSample: number): number | null {
    const idx = this.beatIndexAt(absSample);
    return idx === null ? null : this.sampleAtBeat(Math.round(idx));
  }

  /** Next quantum boundary STRICTLY after absSample. quantumBeats e.g. 0.25–4. */
  nextBoundary(absSample: number, quantumBeats: number): number | null {
    const idx = this.beatIndexAt(absSample);
    if (idx === null) return null;
    const q = Math.max(1e-6, quantumBeats);
    const nextIdx = (Math.floor(idx / q) + 1) * q;
    return this.sampleAtBeat(nextIdx);
  }
}
