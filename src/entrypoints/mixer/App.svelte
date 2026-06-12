<script lang="ts">
  import { AudioEngine } from '@/audio/engine';
  import { EngineBridge } from '@/lib/stores/engine-bridge.svelte';
  import DeckPanel from '@/lib/components/DeckPanel.svelte';
  import Crossfader from '@/lib/components/Crossfader.svelte';
  import Fader from '@/lib/components/Fader.svelte';
  import StatusBar from '@/lib/components/StatusBar.svelte';
  import { onMessage } from '@/messaging/router';
  import type { Message } from '@/messaging/protocol';

  // The engine outlives any UI error — created once, never torn down by the UI.
  const engine = new AudioEngine();
  const bridge = new EngineBridge(engine);

  onMessage((msg: Message) => {
    if (msg.type === 'pingMixer') return { pong: true };
    if (msg.type === 'captureDeck') {
      return engine
        .captureToDeck(msg.deck, msg.targetTabId, msg.tabTitle)
        .then(() => ({ ok: true }))
        .catch((e) => ({ ok: false, error: String(e) }));
    }
    return undefined;
  });

  function boundaryError(error: unknown) {
    console.error('[ui] panel crashed — audio unaffected', error);
  }
</script>

<main>
  <header>
    <h1>TabDecks</h1>
  </header>

  <div class="decks">
    {#each ['A', 'B'] as const as deck (deck)}
      <svelte:boundary onerror={boundaryError}>
        <DeckPanel {bridge} {deck} />
        {#snippet failed(_error, reset)}
          <div class="panel-error">
            Deck {deck} panel crashed — audio is unaffected.
            <button onclick={reset}>Reload panel</button>
          </div>
        {/snippet}
      </svelte:boundary>
    {/each}
  </div>

  <svelte:boundary onerror={boundaryError}>
    <div class="mix-row">
      <Crossfader value={bridge.crossfade} onchange={(v) => bridge.setCrossfade(v)} />
      <div class="master">
        <Fader
          label="Master"
          value={bridge.master}
          min={0}
          max={1.5}
          onchange={(v) => bridge.setMaster(v)}
        />
      </div>
    </div>
    {#snippet failed(_error, reset)}
      <div class="panel-error">
        Mix controls crashed — audio is unaffected.
        <button onclick={reset}>Reload</button>
      </div>
    {/snippet}
  </svelte:boundary>

  <StatusBar {bridge} />

  {#if bridge.needsResume}
    <button class="resume-overlay" onclick={() => bridge.resume()}>Click to start audio</button>
  {/if}
</main>

<style>
  :global(body) {
    margin: 0;
    background: #101016;
    color: #e8e8ee;
    font-family: system-ui, sans-serif;
    user-select: none;
  }
  main {
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 16px;
    min-height: calc(100vh - 32px);
    box-sizing: border-box;
  }
  header h1 {
    margin: 0;
    font-size: 18px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }
  .decks {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
  }
  .mix-row {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 16px;
    align-items: center;
  }
  .master {
    width: 140px;
    padding: 0 10px;
  }
  .panel-error {
    border: 1px solid #7f1d1d;
    border-radius: 10px;
    padding: 14px;
    background: #1c1114;
    color: #fca5a5;
    font-size: 13px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    align-items: flex-start;
  }
  .panel-error button {
    background: #7f1d1d;
    color: #fff;
    border: 0;
    border-radius: 6px;
    padding: 6px 12px;
    cursor: pointer;
  }
  .resume-overlay {
    position: fixed;
    inset: 0;
    background: rgba(10, 10, 14, 0.92);
    color: #fff;
    border: 0;
    font-size: 22px;
    cursor: pointer;
    z-index: 10;
  }
</style>
