import { DEFAULT_PLL, syncRate, type GridSnapshot, type PllConfig } from '@/dsp/pll';
import type { DeckId } from '@/messaging/protocol';
import type { DeckTransport } from './transport';

export interface SyncStatus {
  /** Decks currently slaved to the master grid. */
  engaged: Record<DeckId, boolean>;
  /** Which deck (or 'link') provides the master grid. */
  master: DeckId | 'link';
  /** Per-deck phase error in beats (NaN when not engaged / no grid). */
  error: Record<DeckId, number>;
}

/** Provides the master beat grid + playhead the slaves chase. */
export interface MasterClock {
  /** Master grid in absolute samples of the master timeline, or null. */
  grid(): GridSnapshot | null;
  /** Master playhead position (abs samples) and current rate. */
  position(): { pos: number; rate: number } | null;
}

/**
 * Continuous tempo+phase lock. On each transport status tick the engine reads
 * the master clock and every engaged deck, computes a corrected rate via the
 * PLL, and writes it back through the deck transport. Disengages a deck (and
 * restores rate 1) when its grid confidence is too low to trust.
 *
 * Works deck-to-deck with no external dependency; for Ableton Link the master
 * clock is swapped for a Link-backed implementation (T4) — nothing else changes.
 */
export class SyncEngine {
  private engaged: Record<DeckId, boolean> = { A: false, B: false };
  private master: DeckId | 'link' = 'A';
  private error: Record<DeckId, number> = { A: NaN, B: NaN };
  private masterClock: MasterClock | null = null;

  onChange: (() => void) | null = null;

  constructor(
    private readonly sampleRate: number,
    private readonly transports: Record<DeckId, DeckTransport>,
    private readonly cfg: PllConfig = DEFAULT_PLL,
  ) {}

  get status(): SyncStatus {
    return {
      engaged: { ...this.engaged },
      master: this.master,
      error: { ...this.error },
    };
  }

  /** Deck master clock: the chosen deck's grid + playhead in its own timeline. */
  private deckMasterClock(deck: DeckId): MasterClock {
    const t = this.transports[deck];
    return {
      grid: () => {
        const g = t.grid.state;
        return g.bpm !== null && g.anchor !== null ? { bpm: g.bpm, anchor: g.anchor } : null;
      },
      position: () => {
        const s = t.status;
        if (!s) return null;
        const pos = s.mode === 'live' ? s.written : s.readPos;
        const rate = s.mode === 'live' ? 1 : s.playing ? s.rate : 0;
        return { pos, rate };
      },
    };
  }

  setMaster(master: DeckId | 'link'): void {
    this.master = master;
    if (master !== 'link') this.masterClock = this.deckMasterClock(master);
    this.onChange?.();
  }

  /** Install an external master clock (Ableton Link). */
  setExternalClock(clock: MasterClock | null): void {
    if (this.master === 'link') this.masterClock = clock;
  }

  setEngaged(deck: DeckId, on: boolean): void {
    this.engaged[deck] = on;
    if (!on) {
      this.transports[deck].setRate(1);
      this.error[deck] = NaN;
    } else if (this.master !== 'link' && this.master === deck) {
      // A deck can't be its own master — fall back to the other deck.
      this.setMaster(deck === 'A' ? 'B' : 'A');
    }
    this.onChange?.();
  }

  isEngaged(deck: DeckId): boolean {
    return this.engaged[deck];
  }

  /** Called once per transport status tick (~20 Hz). */
  update(): void {
    if (this.master !== 'link') this.masterClock = this.deckMasterClock(this.master);
    const masterGrid = this.masterClock?.grid();
    const masterState = this.masterClock?.position();
    if (!masterGrid || !masterState) return;

    for (const deck of ['A', 'B'] as DeckId[]) {
      if (!this.engaged[deck] || deck === this.master) continue;
      const t = this.transports[deck];
      const g = t.grid.state;
      const s = t.status;
      if (g.bpm === null || g.anchor === null || !s) continue;

      // Trust gate: stop correcting (and release to 1×) on weak grids.
      if (g.source === 'auto' && g.confidence < 0.25) {
        t.setRate(1);
        this.error[deck] = NaN;
        continue;
      }

      const deckPos = s.mode === 'live' ? s.written : s.readPos;
      const out = syncRate(
        {
          masterGrid,
          masterPos: masterState.pos,
          masterRate: masterState.rate,
          deckGrid: { bpm: g.bpm, anchor: g.anchor },
          deckPos,
          sampleRate: this.sampleRate,
        },
        this.cfg,
      );
      t.setRate(out.rate);
      this.error[deck] = out.errorBeats;
    }
  }

  /**
   * One-shot phase align: nudge the deck's grid anchor so its current beat
   * phase matches the master's, without continuous locking. Returns false if
   * grids aren't both available.
   */
  alignPhase(deck: DeckId): boolean {
    if (this.master !== 'link' && deck === this.master) return false;
    if (this.master !== 'link') this.masterClock = this.deckMasterClock(this.master);
    const masterGrid = this.masterClock?.grid();
    const masterState = this.masterClock?.position();
    const t = this.transports[deck];
    const g = t.grid.state;
    const s = t.status;
    if (!masterGrid || !masterState || g.bpm === null || g.anchor === null || !s) return false;

    const deckPos = s.mode === 'live' ? s.written : s.readPos;
    const deckPeriod = (60 / g.bpm) * this.sampleRate;
    const masterPeriod = (60 / masterGrid.bpm) * this.sampleRate;
    const masterPhase = (((masterState.pos - masterGrid.anchor) / masterPeriod) % 1 + 1) % 1;
    const deckPhase = (((deckPos - g.anchor) / deckPeriod) % 1 + 1) % 1;
    let err = masterPhase - deckPhase;
    if (err > 0.5) err -= 1;
    if (err < -0.5) err += 1;
    // Shift the grid so the deck's phase jumps to the master's now.
    t.grid.nudge((-err * deckPeriod * 1000) / this.sampleRate);
    return true;
  }
}
