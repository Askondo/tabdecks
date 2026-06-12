import { getFxDescriptor } from '@/audio/fx/registry';
import type { AudioEngine } from '@/audio/engine';
import type { DeckPublicState } from '@/audio/deck';
import type { EqBand } from '@/audio/eq';
import type { TransportMode } from '@/dsp/transport-dsp';
import type { DeckId } from '@/messaging/protocol';

type EqState = Record<EqBand, { value: number; killed: boolean }>;

export interface FxSlotState {
  id: string;
  wet: number;
  bypassed: boolean;
  params: Record<string, number>;
}

export const CUE_COUNT = 4;

export interface TransportUiState {
  braking: boolean;
  stuttering: boolean;
  brakeTime: number;
  sliceMs: number;
  mode: TransportMode;
  playing: boolean;
  /** Seconds behind the live edge. */
  behind: number;
  rate: number;
  readPos: number;
  written: number;
  oldest: number;
  trackStart: number | null;
  trackEnd: number | null;
  /** Absolute cue positions (null = unset). */
  cues: Array<number | null>;
}

function initialTransport(): TransportUiState {
  return {
    braking: false,
    stuttering: false,
    brakeTime: 0.8,
    sliceMs: 125,
    mode: 'live',
    playing: true,
    behind: 0,
    rate: 1,
    readPos: 0,
    written: 0,
    oldest: 0,
    trackStart: null,
    trackEnd: null,
    cues: Array.from({ length: CUE_COUNT }, () => null),
  };
}

function initialEq(): EqState {
  return {
    low: { value: 1, killed: false },
    mid: { value: 1, killed: false },
    high: { value: 1, killed: false },
  };
}

/**
 * Svelte 5 runes mirror of engine state + thin control delegates.
 * The UI never touches AudioNodes directly — everything goes through the
 * engine's guarded API, so a UI bug cannot corrupt the graph.
 */
export class EngineBridge {
  decks = $state<Record<DeckId, DeckPublicState>>({
    A: { status: 'empty', title: '' },
    B: { status: 'empty', title: '' },
  });
  trims = $state<Record<DeckId, number>>({ A: 1, B: 1 });
  faders = $state<Record<DeckId, number>>({ A: 1, B: 1 });
  eq = $state<Record<DeckId, EqState>>({ A: initialEq(), B: initialEq() });
  fx = $state<Record<DeckId, Array<FxSlotState | null>>>({ A: [null, null], B: [null, null] });
  transport = $state<Record<DeckId, TransportUiState>>({
    A: initialTransport(),
    B: initialTransport(),
  });
  crossfade = $state(0.5);
  master = $state(1);
  needsResume = $state(false);
  lastError = $state('');

  constructor(readonly engine: AudioEngine) {
    this.needsResume = engine.ctx.state === 'suspended';
    engine.on('deckChanged', ({ deck }) => {
      this.decks[deck] = { ...engine.decks[deck].state };
    });
    engine.on('contextState', ({ state }) => {
      this.needsResume = state === 'suspended';
    });
    engine.on('engineError', ({ context, error }) => {
      this.lastError = `${context}: ${String(error)}`;
    });
    engine.on('transportStatus', ({ deck, status }) => {
      const t = this.transport[deck];
      t.mode = status.mode;
      t.playing = status.playing;
      t.behind = status.behind;
      t.readPos = status.readPos;
      t.written = status.written;
      t.oldest = status.oldest;
      t.trackStart = status.trackStart;
      t.trackEnd = status.trackEnd;
      t.braking = status.gesture === 'brake';
      t.stuttering = status.gesture === 'stutter';
    });
  }

  setTrim(deck: DeckId, v: number): void {
    this.trims[deck] = v;
    this.engine.setTrim(deck, v);
  }

  setFader(deck: DeckId, x: number): void {
    this.faders[deck] = x;
    this.engine.setFader(deck, x);
  }

  setEq(deck: DeckId, band: EqBand, v: number): void {
    this.eq[deck][band].value = v;
    this.engine.setEq(deck, band, v);
  }

  setEqKill(deck: DeckId, band: EqBand, on: boolean): void {
    this.eq[deck][band].killed = on;
    this.engine.setEqKill(deck, band, on);
  }

  brake(deck: DeckId, down: boolean): void {
    this.transport[deck].braking = down;
    this.engine.brake(deck, down);
  }

  stutter(deck: DeckId, down: boolean): void {
    this.transport[deck].stuttering = down;
    this.engine.stutter(deck, down, this.transport[deck].sliceMs);
  }

  setBrakeTime(deck: DeckId, seconds: number): void {
    this.transport[deck].brakeTime = seconds;
    this.engine.setBrakeTime(deck, seconds);
  }

  setStutterSlice(deck: DeckId, sliceMs: number): void {
    this.transport[deck].sliceMs = sliceMs;
  }

  togglePlay(deck: DeckId): void {
    const t = this.transport[deck];
    if (t.playing) this.engine.pauseDeck(deck);
    else this.engine.playDeck(deck);
    t.playing = !t.playing;
  }

  setRate(deck: DeckId, rate: number): void {
    this.transport[deck].rate = rate;
    this.engine.setRate(deck, rate);
  }

  seekAbs(deck: DeckId, pos: number): void {
    this.engine.seekAbs(deck, pos);
  }

  jumpLive(deck: DeckId): void {
    this.engine.jumpLive(deck);
  }

  trackMark(deck: DeckId): void {
    this.engine.trackMark(deck);
  }

  trackRestart(deck: DeckId): void {
    this.engine.trackRestart(deck);
  }

  trackExit(deck: DeckId): void {
    this.engine.trackExit(deck);
  }

  /** Unset cue: store the current playhead. Set cue: jump to it. */
  cue(deck: DeckId, slot: number): void {
    const t = this.transport[deck];
    const existing = t.cues[slot];
    if (existing == null) {
      t.cues[slot] = t.readPos;
    } else if (existing >= t.oldest) {
      this.engine.seekAbs(deck, existing);
    }
  }

  clearCue(deck: DeckId, slot: number): void {
    this.transport[deck].cues[slot] = null;
  }

  peakBetween(deck: DeckId, fromAbs: number, toAbs: number): number {
    return this.engine.peakBetween(deck, fromAbs, toAbs);
  }

  async loadFx(deck: DeckId, slot: number, fxId: string): Promise<void> {
    const descriptor = getFxDescriptor(fxId);
    if (!descriptor) return;
    await this.engine.loadFx(deck, slot, fxId);
    const params: Record<string, number> = {};
    for (const p of descriptor.params) params[p.id] = p.default;
    this.fx[deck][slot] = { id: fxId, wet: 0.5, bypassed: false, params };
    this.engine.setFxWet(deck, slot, 0.5);
  }

  unloadFx(deck: DeckId, slot: number): void {
    this.engine.unloadFx(deck, slot);
    this.fx[deck][slot] = null;
  }

  setFxParam(deck: DeckId, slot: number, paramId: string, value: number): void {
    const state = this.fx[deck][slot];
    if (state) state.params[paramId] = value;
    this.engine.setFxParam(deck, slot, paramId, value);
  }

  setFxWet(deck: DeckId, slot: number, mix: number): void {
    const state = this.fx[deck][slot];
    if (state) state.wet = mix;
    this.engine.setFxWet(deck, slot, mix);
  }

  setFxBypass(deck: DeckId, slot: number, bypassed: boolean): void {
    const state = this.fx[deck][slot];
    if (state) state.bypassed = bypassed;
    this.engine.setFxBypass(deck, slot, bypassed);
  }

  setCrossfade(x: number): void {
    this.crossfade = x;
    this.engine.setCrossfade(x);
  }

  setMaster(v: number): void {
    this.master = v;
    this.engine.setMaster(v);
  }

  async resume(): Promise<void> {
    await this.engine.resume();
    this.needsResume = this.engine.ctx.state !== 'running';
  }
}
