import type { AudioEngine } from '@/audio/engine';
import type { DeckPublicState } from '@/audio/deck';
import type { DeckId } from '@/messaging/protocol';

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
