import { captureTabAudio } from './capture';
import { Crossfader } from './crossfader';
import { Deck } from './deck';
import { MasterBus } from './master';
import { DeckTransport, TRANSPORT_WORKLET_URL } from './transport';
import { getFxDescriptor } from './fx/registry';
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
  readonly master: MasterBus;
  // Built in init() — the transport worklet module must load first.
  decks!: Record<DeckId, Deck>;
  crossfader!: Crossfader;

  private listeners = new Map<EventName, Set<Listener<EventName>>>();

  constructor() {
    this.ctx = new AudioContext({ latencyHint: 'interactive', sampleRate: 48000 });
    this.master = new MasterBus(this.ctx);
    this.ctx.addEventListener('statechange', () =>
      this.emit('contextState', { state: this.ctx.state }),
    );
  }

  /** Loads the transport worklet and builds the deck graph. Must complete
   *  before any other method is called (mixer main.ts awaits it pre-mount). */
  async init(): Promise<void> {
    await this.ctx.audioWorklet.addModule(chrome.runtime.getURL(TRANSPORT_WORKLET_URL));
    this.decks = {
      A: new Deck('A', this.ctx, new DeckTransport(this.ctx)),
      B: new Deck('B', this.ctx, new DeckTransport(this.ctx)),
    };
    for (const deck of Object.values(this.decks)) {
      deck.xfade.connect(this.master.input);
      deck.onStateChange = () => this.emit('deckChanged', { deck: deck.id });
      deck.transport.onError = (message) =>
        this.emit('engineError', {
          context: `transport(${deck.id}) latched to passthrough`,
          error: message,
        });
    }
    this.crossfader = new Crossfader(
      this.ctx,
      this.decks.A.xfade.gain,
      this.decks.B.xfade.gain,
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

  // ── Transport gestures ─────────────────────────────────────────────────

  brake(deck: DeckId, on: boolean): void {
    this.guard('brake', () => this.decks[deck].transport.brake(on));
  }

  stutter(deck: DeckId, on: boolean, sliceMs: number): void {
    this.guard('stutter', () => this.decks[deck].transport.stutter(on, sliceMs));
  }

  setBrakeTime(deck: DeckId, seconds: number): void {
    this.guard('setBrakeTime', () => this.decks[deck].transport.setBrakeTime(seconds));
  }

  setCrossfade(x: number): void {
    this.guard('setCrossfade', () => this.crossfader.set(x));
  }

  setMaster(v: number): void {
    this.guard('setMaster', () => this.master.setGain(v));
  }

  // ── FX ─────────────────────────────────────────────────────────────────

  private loadedWorklets = new Set<string>();

  /** Load a registered FX into a deck slot (loads its worklets on first use). */
  async loadFx(deck: DeckId, slot: number, fxId: string): Promise<void> {
    try {
      const descriptor = getFxDescriptor(fxId);
      if (!descriptor) throw new Error(`Unknown FX: ${fxId}`);
      for (const url of descriptor.workletModules ?? []) {
        if (!this.loadedWorklets.has(url)) {
          await this.ctx.audioWorklet.addModule(chrome.runtime.getURL(url));
          this.loadedWorklets.add(url);
        }
      }
      this.decks[deck].setFx(slot, descriptor.create(this.ctx));
    } catch (error) {
      this.emit('engineError', { context: `loadFx(${deck}, ${slot}, ${fxId})`, error });
      throw error;
    }
  }

  unloadFx(deck: DeckId, slot: number): void {
    this.guard('unloadFx', () => this.decks[deck].setFx(slot, null));
  }

  setFxParam(deck: DeckId, slot: number, paramId: string, value: number): void {
    this.guard('setFxParam', () => this.decks[deck].fx[slot]?.setParam(paramId, value));
  }

  setFxWet(deck: DeckId, slot: number, mix: number): void {
    this.guard('setFxWet', () => this.decks[deck].fx[slot]?.setWet(mix));
  }

  setFxBypass(deck: DeckId, slot: number, bypassed: boolean): void {
    this.guard('setFxBypass', () => this.decks[deck].fx[slot]?.setBypass(bypassed));
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
