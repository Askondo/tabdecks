import type { AudioEngine } from '@/audio/engine';
import type { DeckPublicState } from '@/audio/deck';
import type { EqBand } from '@/audio/eq';
import type { DeckId } from '@/messaging/protocol';

type EqState = Record<EqBand, { value: number; killed: boolean }>;

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
