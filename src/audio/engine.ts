import { captureTabAudio } from './capture';
import { Crossfader } from './crossfader';
import { Deck } from './deck';
import { MasterBus } from './master';
import { DeckTransport, TRANSPORT_WORKLET_URL } from './transport';
import { getFxDescriptor } from './fx/registry';
import type { BeatGridState } from './beatgrid';
import type { EqBand } from './eq';
import type { TransportStatus } from '@/dsp/transport-dsp';
import type { DeckId } from '@/messaging/protocol';

export interface EngineEvents {
  /** A guarded engine method threw — audio keeps running, UI should surface it. */
  engineError: { context: string; error: unknown };
  /** Deck status/title changed. */
  deckChanged: { deck: DeckId };
  /** AudioContext state changed (suspended/running). */
  contextState: { state: AudioContextState };
  /** ~20 Hz transport snapshot from a deck's worklet. */
  transportStatus: { deck: DeckId; status: TransportStatus };
  /** Deck beat grid changed (detection update, tap, override, nudge). */
  gridChanged: { deck: DeckId; grid: BeatGridState };
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
      deck.transport.onStatus = (status) =>
        this.emit('transportStatus', { deck: deck.id, status });
      deck.transport.grid.onChange = () =>
        this.emit('gridChanged', { deck: deck.id, grid: deck.transport.grid.state });
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

  // ── Quantization ───────────────────────────────────────────────────────

  /** Global quantize config (per-action toggles arrive with the config pane). */
  readonly quantize = { enabled: false, quantumBeats: 1 };

  setQuantize(enabled: boolean, quantumBeats?: number): void {
    this.quantize.enabled = enabled;
    if (quantumBeats !== undefined) this.quantize.quantumBeats = quantumBeats;
    if (!enabled) {
      for (const deck of Object.values(this.decks)) deck.transport.cancelScheduled();
    }
  }

  /** Next quantum boundary for a deck, or null when quantize is off / no grid. */
  private boundaryFor(deck: DeckId): { at: number; domain: 'written' | 'readPos' } | null {
    if (!this.quantize.enabled) return null;
    const t = this.decks[deck].transport;
    const status = t.status;
    if (!status) return null;
    // Playing decks quantize on their playhead; live or paused decks on the
    // wall clock (a paused playhead would never cross a readPos boundary).
    const onPlayhead = status.mode !== 'live' && status.playing;
    const pos = onPlayhead ? status.readPos : status.written;
    const at = t.grid.nextBoundary(pos, this.quantize.quantumBeats);
    return at === null ? null : { at, domain: onPlayhead ? 'readPos' : 'written' };
  }

  // ── Transport gestures ─────────────────────────────────────────────────

  brake(deck: DeckId, on: boolean): void {
    this.guard('brake', () => {
      const t = this.decks[deck].transport;
      if (!on) {
        t.cancelScheduled('brake'); // released before the boundary → never fire
        t.brake(false);
        return;
      }
      const b = this.boundaryFor(deck);
      if (b) t.scheduleAction(b.at, b.domain, { type: 'brake' });
      else t.brake(true);
    });
  }

  stutter(deck: DeckId, on: boolean, sliceMs: number): void {
    this.guard('stutter', () => {
      const t = this.decks[deck].transport;
      if (!on) {
        t.cancelScheduled('stutter');
        t.stutter(false, sliceMs);
        return;
      }
      const b = this.boundaryFor(deck);
      if (b) t.scheduleAction(b.at, b.domain, { type: 'stutter', sliceSeconds: sliceMs / 1000 });
      else t.stutter(true, sliceMs);
    });
  }

  setBrakeTime(deck: DeckId, seconds: number): void {
    this.guard('setBrakeTime', () => this.decks[deck].transport.setBrakeTime(seconds));
  }

  pauseDeck(deck: DeckId): void {
    this.guard('pauseDeck', () => {
      const b = this.boundaryFor(deck);
      const t = this.decks[deck].transport;
      if (b) t.scheduleAction(b.at, b.domain, { type: 'pause' });
      else t.pause();
    });
  }

  playDeck(deck: DeckId): void {
    this.guard('playDeck', () => {
      const b = this.boundaryFor(deck);
      const t = this.decks[deck].transport;
      if (b) t.scheduleAction(b.at, b.domain, { type: 'play' });
      else t.play();
    });
  }

  setRate(deck: DeckId, rate: number): void {
    this.guard('setRate', () => this.decks[deck].transport.setRate(rate));
  }

  /**
   * Seek/beat-jump. Quantized: the target snaps to its nearest beat and the
   * jump fires on the next quantum boundary with phase carry-over (lands in
   * phase, Ableton-launch style). Unquantized: free seek.
   */
  seekAbs(deck: DeckId, pos: number): void {
    this.guard('seekAbs', () => {
      const t = this.decks[deck].transport;
      const b = this.boundaryFor(deck);
      if (b) {
        const target = t.grid.nearestBeat(pos) ?? pos;
        t.scheduleAction(b.at, b.domain, { type: 'seekAbs', target });
      } else {
        t.seekAbs(pos);
      }
    });
  }

  jumpLive(deck: DeckId): void {
    this.guard('jumpLive', () => this.decks[deck].transport.jumpLive());
  }

  trackMark(deck: DeckId): void {
    this.guard('trackMark', () => this.decks[deck].transport.trackMark());
  }

  trackRestart(deck: DeckId): void {
    this.guard('trackRestart', () => {
      const b = this.boundaryFor(deck);
      const t = this.decks[deck].transport;
      if (b) t.scheduleAction(b.at, b.domain, { type: 'trackRestart' });
      else t.trackRestart();
    });
  }

  trackExit(deck: DeckId): void {
    this.guard('trackExit', () => this.decks[deck].transport.trackExit());
  }

  /** Waveform peak lookup for the UI (absolute sample range). */
  peakBetween(deck: DeckId, fromAbs: number, toAbs: number): number {
    return this.decks[deck].transport.peaks.peakBetween(fromAbs, toAbs);
  }

  // ── Beat grid ──────────────────────────────────────────────────────────

  tapTempo(deck: DeckId): void {
    this.guard('tapTempo', () => {
      const t = this.decks[deck].transport;
      t.grid.tap(t.status?.written ?? 0);
    });
  }

  setManualBpm(deck: DeckId, bpm: number): void {
    this.guard('setManualBpm', () => this.decks[deck].transport.grid.setManualBpm(bpm));
  }

  clearManualBpm(deck: DeckId): void {
    this.guard('clearManualBpm', () => this.decks[deck].transport.grid.clearManual());
  }

  nudgeGrid(deck: DeckId, ms: number): void {
    this.guard('nudgeGrid', () => this.decks[deck].transport.grid.nudge(ms));
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
    this.guard('setFxBypass', () => {
      const atTime = this.quantizedCtxTime(deck);
      this.decks[deck].fx[slot]?.setBypass(bypassed, atTime ?? undefined);
    });
  }

  /**
   * Fixed bar loop (null clears). The region is grid-aligned by construction:
   * it starts at the current bar's downbeat and spans `bars` × 4 beats, so
   * engaging it never breaks phase. Requires a beat grid.
   */
  setBarLoop(deck: DeckId, bars: number | null): void {
    this.guard('setBarLoop', () => {
      const t = this.decks[deck].transport;
      if (bars === null) {
        t.loopClear();
        return;
      }
      const status = t.status;
      const grid = t.grid;
      if (!status) return;
      const pos = status.mode === 'live' ? status.written : status.readPos;
      const beat = grid.beatIndexAt(pos);
      if (beat === null) return; // no grid yet — loop button is a no-op
      const barStartBeat = Math.floor(beat / 4) * 4;
      const start = grid.sampleAtBeat(barStartBeat)!;
      const end = grid.sampleAtBeat(barStartBeat + bars * 4)!;
      t.loopSet(start, end);
    });
  }

  /** Quantized crossfader cut to one side, on the target deck's grid. */
  cutTo(deck: DeckId): void {
    this.guard('cutTo', () => {
      const atTime = this.quantizedCtxTime(deck);
      this.crossfader.cut(deck === 'A' ? 0 : 1, atTime ?? undefined);
    });
  }

  /** AudioContext time of the deck's next audible quantum boundary (null →
   *  act immediately: quantize off, no grid, or deck paused). */
  private quantizedCtxTime(deck: DeckId): number | null {
    const b = this.boundaryFor(deck);
    if (!b) return null;
    return this.decks[deck].transport.ctxTimeAtPlayhead(b.at);
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
