import { getFxDescriptor } from '@/audio/fx/registry';
import type { AudioEngine } from '@/audio/engine';
import type { LinkState } from '@/audio/link-client';
import type { RoutingState } from '@/audio/routing';
import type { BeatGridState } from '@/audio/beatgrid';
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
  loopStart: number | null;
  loopEnd: number | null;
  /** UI-selected loop length (bars); null = loop off. */
  loopBars: number | null;
  /** Absolute cue positions (null = unset). */
  cues: Array<number | null>;
  /** Quantize-scheduled actions waiting in the worklet (armed indicator). */
  pending: number;
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
    loopStart: null,
    loopEnd: null,
    loopBars: null,
    cues: Array.from({ length: CUE_COUNT }, () => null),
    pending: 0,
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
  grids = $state<Record<DeckId, BeatGridState>>({
    A: { bpm: null, anchor: null, confidence: 0, source: 'auto' },
    B: { bpm: null, anchor: null, confidence: 0, source: 'auto' },
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
    engine.on('gridChanged', ({ deck, grid }) => {
      this.grids[deck] = grid;
    });
    engine.on('syncChanged', ({ status }) => {
      this.sync = {
        engaged: { ...status.engaged },
        master: status.master,
        error: { ...status.error },
      };
    });
    engine.on('linkChanged', ({ state }) => {
      this.link = { ...state };
    });
    engine.on('routingChanged', ({ state }) => {
      this.routing = { ...state, pfl: { ...state.pfl } };
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
      t.pending = status.pending;
      t.loopStart = status.loopStart;
      t.loopEnd = status.loopEnd;
      if (status.loopStart === null) t.loopBars = null;
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

  sync = $state<{
    engaged: Record<DeckId, boolean>;
    master: DeckId | 'link';
    error: Record<DeckId, number>;
  }>({
    engaged: { A: false, B: false },
    master: 'A',
    error: { A: NaN, B: NaN },
  });

  setSync(deck: DeckId, on: boolean): void {
    this.sync.engaged[deck] = on;
    this.engine.setSync(deck, on);
  }

  setSyncMaster(master: DeckId | 'link'): void {
    this.sync.master = master;
    this.engine.setSyncMaster(master);
  }

  alignPhase(deck: DeckId): void {
    this.engine.alignPhase(deck);
  }

  link = $state<LinkState>({
    bridge: 'disconnected',
    enabled: false,
    bpm: 0,
    peers: 0,
    playing: false,
  });

  toggleLink(): void {
    if (this.link.enabled) this.engine.disableLink();
    else this.engine.enableLink();
  }

  routing = $state<RoutingState>({
    masterDeviceLabel: 'Default',
    cueDeviceLabel: 'None',
    pfl: { A: false, B: false },
  });

  setPfl(deck: DeckId, on: boolean): void {
    this.routing.pfl[deck] = on;
    this.engine.setPfl(deck, on);
  }

  pickMasterDevice(): void {
    void this.engine.pickMasterDevice();
  }

  pickCueDevice(): void {
    void this.engine.pickCueDevice();
  }

  quantize = $state({ enabled: false, quantum: 1 });

  setQuantize(enabled: boolean, quantum?: number): void {
    this.quantize.enabled = enabled;
    if (quantum !== undefined) this.quantize.quantum = quantum;
    this.engine.setQuantize(enabled, quantum);
  }

  cutTo(deck: DeckId): void {
    this.crossfade = deck === 'A' ? 0 : 1;
    this.engine.cutTo(deck);
  }

  /** Toggle a fixed bar loop; clicking the active length clears it. */
  setBarLoop(deck: DeckId, bars: number | null): void {
    const t = this.transport[deck];
    const next = t.loopBars === bars ? null : bars;
    t.loopBars = next;
    this.engine.setBarLoop(deck, next);
  }

  tapTempo(deck: DeckId): void {
    this.engine.tapTempo(deck);
  }

  setManualBpm(deck: DeckId, bpm: number): void {
    this.engine.setManualBpm(deck, bpm);
  }

  clearManualBpm(deck: DeckId): void {
    this.engine.clearManualBpm(deck);
  }

  nudgeGrid(deck: DeckId, ms: number): void {
    this.engine.nudgeGrid(deck, ms);
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
