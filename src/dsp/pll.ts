// Pure sync/PLL math — no Web Audio types. The SyncEngine (audio/sync.ts)
// wires this to live transport statuses; tests drive it in simulation.

export interface GridSnapshot {
  /** BPM of the content in its recorded timeline. */
  bpm: number;
  /** Absolute sample of a beat. */
  anchor: number;
}

export interface PllConfig {
  /** Proportional gain: rate correction per beat of phase error. */
  kP: number;
  /** Max deviation of the final rate from 1.0 (vinyl-style pitch limit). */
  maxDev: number;
}

export const DEFAULT_PLL: PllConfig = { kP: 0.5, maxDev: 0.08 };

/** Fractional beat phase [0,1) of an absolute playhead position. */
export function phaseOf(pos: number, grid: GridSnapshot, sampleRate: number): number {
  const period = (60 / grid.bpm) * sampleRate;
  const phase = ((pos - grid.anchor) / period) % 1;
  return phase < 0 ? phase + 1 : phase;
}

/** Shortest signed phase distance master−deck, in beats ∈ [-0.5, 0.5). */
export function phaseError(masterPhase: number, deckPhase: number): number {
  let e = (masterPhase - deckPhase) % 1;
  if (e >= 0.5) e -= 1;
  if (e < -0.5) e += 1;
  return e;
}

export interface SyncInput {
  masterGrid: GridSnapshot;
  /** Master playhead position (abs samples) and its current playback rate. */
  masterPos: number;
  masterRate: number;
  deckGrid: GridSnapshot;
  deckPos: number;
  sampleRate: number;
}

export interface SyncOutput {
  /** Rate to apply to the deck. */
  rate: number;
  /** Phase error in beats (master − deck). */
  errorBeats: number;
  /** Tempo ratio before phase correction (audible master BPM / deck BPM). */
  ratio: number;
  /** False when the ratio alone exceeds the deviation clamp (BPMs too far apart). */
  ratioInRange: boolean;
}

/**
 * One PLL step: rate = ratio · (1 + kP · phaseError), clamped to 1 ± maxDev.
 * The audible deck BPM is grid BPM × rate, so matching tempo means
 * rate = (masterBpm · masterRate) / deckBpm; the phase term then pulls the
 * beats into alignment and holds them there.
 */
export function syncRate(input: SyncInput, cfg: PllConfig = DEFAULT_PLL): SyncOutput {
  const audibleMasterBpm = input.masterGrid.bpm * input.masterRate;
  const ratio = audibleMasterBpm / input.deckGrid.bpm;
  const errorBeats = phaseError(
    phaseOf(input.masterPos, input.masterGrid, input.sampleRate),
    phaseOf(input.deckPos, input.deckGrid, input.sampleRate),
  );
  const raw = ratio * (1 + cfg.kP * errorBeats);
  const lo = 1 - cfg.maxDev;
  const hi = 1 + cfg.maxDev;
  const rate = Math.min(hi, Math.max(lo, raw));
  return {
    rate,
    errorBeats,
    ratio,
    ratioInRange: ratio >= lo && ratio <= hi,
  };
}
