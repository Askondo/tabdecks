<script lang="ts">
  import EqSection from './EqSection.svelte';
  import Fader from './Fader.svelte';
  import FxSlot from './FxSlot.svelte';
  import Meter from './Meter.svelte';
  import TransportControls from './TransportControls.svelte';
  import WaveformStrip from './WaveformStrip.svelte';
  import { FX_SLOTS } from '@/audio/deck';
  import type { EngineBridge } from '@/lib/stores/engine-bridge.svelte';
  import type { DeckId } from '@/messaging/protocol';

  interface Props {
    bridge: EngineBridge;
    deck: DeckId;
  }
  let { bridge, deck }: Props = $props();

  const state = $derived(bridge.decks[deck]);
  // svelte-ignore state_referenced_locally -- deck/engine are fixed per panel instance
  const analyser = bridge.engine.decks[deck].analyser;
</script>

<section class="deck" class:live={state.status === 'live'} data-deck={deck}>
  <header>
    <h2>Deck {deck}</h2>
    <p class="status {state.status}" title={state.error ?? state.title}>
      {#if state.status === 'empty'}
        No tab assigned
      {:else if state.status === 'live'}
        ● {state.title}
      {:else if state.status === 'disconnected'}
        Disconnected — {state.title}
      {:else}
        Error: {state.error}
      {/if}
    </p>
  </header>

  <WaveformStrip {bridge} {deck} />

  <EqSection {bridge} {deck} />

  <TransportControls {bridge} {deck} />

  <div class="fx-slots">
    {#each Array.from({ length: FX_SLOTS }, (_, i) => i) as slot (slot)}
      <FxSlot {bridge} {deck} {slot} />
    {/each}
  </div>

  <div class="controls">
    <Fader
      label="Trim"
      value={bridge.trims[deck]}
      min={0}
      max={2}
      vertical
      onchange={(v) => bridge.setTrim(deck, v)}
    />
    <Fader
      label="Vol"
      value={bridge.faders[deck]}
      vertical
      onchange={(v) => bridge.setFader(deck, v)}
    />
    <Meter {analyser} />
  </div>
</section>

<style>
  .deck {
    border: 1px solid #2a2a36;
    border-radius: 10px;
    padding: 14px;
    background: #16161e;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .deck.live[data-deck='A'] {
    border-color: #2563eb;
  }
  .deck.live[data-deck='B'] {
    border-color: #d97706;
  }
  h2 {
    margin: 0 0 6px;
    font-size: 14px;
    color: #c9cde0;
  }
  .status {
    margin: 0;
    font-size: 12px;
    color: #9aa0b4;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
  }
  .status.live {
    color: #4ade80;
  }
  .status.error {
    color: #f87171;
  }
  .controls {
    display: flex;
    justify-content: center;
    gap: 28px;
  }
  .fx-slots {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
</style>
