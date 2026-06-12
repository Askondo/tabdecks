import { captureTabAudio } from './capture';
import { Crossfader } from './crossfader';
import { Deck } from './deck';
import { MasterBus } from './master';
import type { EqBand } from './eq';
import type { DeckId } from '@/messaging/protocol';

export interface EngineEvents {
  /** A guarded engine method threw — audio keeps running, UI should surface it. */
  engineError: { context: string; error: unknown };
  /** Deck status/title changed. */
  deckChanged: { deck: DeckId };
  /** AudioContext state changed (suspended/running). */
  contextState: { state: AudioContextState };
}

type EventName = keyof EngineEvents;
type Listener<E extends EventName> = (payload: EngineEvents[E]) => void;

/**
 * Owns the whole audio graph. Fully UI-independent: every public method is
 * guarded — exceptions are caught, logged, and emitted as `engineError`,
 * never rethrown into callers. A crashed knob must never kill audio.
 */
export class AudioEngine {
  readonly ctx: AudioContext;
  readonly decks: Record<DeckId, Deck>;
  readonly master: MasterBus;
  readonly crossfader: Crossfader;

  private listeners = new Map<EventName, Set<Listener<EventName>>>();

  constructor() {
    this.ctx = new AudioContext({ latencyHint: 'interactive', sampleRate: 48000 });
    this.master = new MasterBus(this.ctx);
    this.decks = {
      A: new Deck('A', this.ctx),
      B: new Deck('B', this.ctx),
    };
    for (const deck of Object.values(this.decks)) {
      deck.xfade.connect(this.master.input);
      deck.onStateChange = () => this.emit('deckChanged', { deck: deck.id });
    }
    this.crossfader = new Crossfader(
      this.ctx,
      this.decks.A.xfade.gain,
      this.decks.B.xfade.gain,
    );
    this.ctx.addEventListener('statechange', () =>
      this.emit('contextState', { state: this.ctx.state }),
    );
  }

  // ── Capture ────────────────────────────────────────────────────────────

  /** Capture a tab onto a deck. Rejects (with deck state set) on failure. */
  async captureToDeck(deck: DeckId, targetTabId: number, title: string): Promise<void> {
    try {
      const stream = await captureTabAudio(targetTabId);
      this.decks[deck].attach(stream, title);
    } catch (error) {
      this.decks[deck].setState({ status: 'error', title, error: String(error) });
      this.emit('engineError', { context: `captureToDeck(${deck})`, error });
      throw error;
    }
  }

  // ── Guarded controls ───────────────────────────────────────────────────

  setTrim(deck: DeckId, v: number): void {
    this.guard('setTrim', () => this.decks[deck].setTrim(v));
  }

  setFader(deck: DeckId, x: number): void {
    this.guard('setFader', () => this.decks[deck].setFader(x));
  }

  setEq(deck: DeckId, band: EqBand, v: number): void {
    this.guard('setEq', () => this.decks[deck].eq.setBand(band, v));
  }

  setEqKill(deck: DeckId, band: EqBand, on: boolean): void {
    this.guard('setEqKill', () => this.decks[deck].eq.setKill(band, on));
  }

  setCrossfade(x: number): void {
    this.guard('setCrossfade', () => this.crossfader.set(x));
  }

  setMaster(v: number): void {
    this.guard('setMaster', () => this.master.setGain(v));
  }

  async resume(): Promise<void> {
    try {
      await this.ctx.resume();
    } catch (error) {
      this.emit('engineError', { context: 'resume', error });
    }
  }

  get latency(): { base: number; output: number } {
    return { base: this.ctx.baseLatency, output: this.ctx.outputLatency };
  }

  // ── Events ─────────────────────────────────────────────────────────────

  on<E extends EventName>(event: E, listener: Listener<E>): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(listener as Listener<EventName>);
    return () => set.delete(listener as Listener<EventName>);
  }

  private emit<E extends EventName>(event: E, payload: EngineEvents[E]): void {
    for (const listener of this.listeners.get(event) ?? []) {
      try {
        (listener as Listener<E>)(payload);
      } catch (e) {
        console.error(`[engine] listener for ${event} threw`, e);
      }
    }
  }

  private guard(context: string, fn: () => void): void {
    try {
      fn();
    } catch (error) {
      console.error(`[engine] ${context} failed`, error);
      this.emit('engineError', { context, error });
    }
  }
}
