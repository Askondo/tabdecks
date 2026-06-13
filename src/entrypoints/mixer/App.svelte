<script lang="ts">
  import type { AudioEngine } from '@/audio/engine';
  import { EngineBridge } from '@/lib/stores/engine-bridge.svelte';
  import DeckPanel from '@/lib/components/DeckPanel.svelte';
  import Crossfader from '@/lib/components/Crossfader.svelte';
  import CutButtons from '@/lib/components/CutButtons.svelte';
  import LinkPanel from '@/lib/components/LinkPanel.svelte';
  import Fader from '@/lib/components/Fader.svelte';
  import Meter from '@/lib/components/Meter.svelte';
  import StatusBar from '@/lib/components/StatusBar.svelte';
  import { onMessage } from '@/messaging/router';
  import { loadSettings, saveSettings, type SettingsV1 } from '@/settings/storage';
  import type { EqBand } from '@/audio/eq';
  import type { DeckId, Message } from '@/messaging/protocol';

  interface Props {
    engine: AudioEngine;
  }
  // The engine outlives any UI error — created and init'd in main.ts before mount.
  let { engine }: Props = $props();
  // svelte-ignore state_referenced_locally -- engine is set once and never reassigned
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

  // ── Settings persistence ────────────────────────────────────────────────
  let settingsLoaded = $state(false);
  void loadSettings().then((s) => {
    bridge.setMaster(s.master);
    for (const deck of ['A', 'B'] as const) {
      bridge.setTrim(deck, s.decks[deck].trim);
      bridge.setBrakeTime(deck, s.decks[deck].brakeTime);
      bridge.setStutterSlice(deck, s.decks[deck].sliceMs);
    }
    settingsLoaded = true;
  });

  $effect(() => {
    const snapshot: SettingsV1 = {
      v: 1,
      master: bridge.master,
      decks: {
        A: deckSettings('A'),
        B: deckSettings('B'),
      },
    };
    if (settingsLoaded) saveSettings(snapshot);
  });

  function deckSettings(deck: DeckId) {
    return {
      trim: bridge.trims[deck],
      brakeTime: bridge.transport[deck].brakeTime,
      sliceMs: bridge.transport[deck].sliceMs,
    };
  }

  // ── Keyboard shortcuts ──────────────────────────────────────────────────
  const KILL_KEYS: Record<string, [DeckId, EqBand]> = {
    q: ['A', 'low'],
    w: ['A', 'mid'],
    e: ['A', 'high'],
    i: ['B', 'low'],
    o: ['B', 'mid'],
    p: ['B', 'high'],
  };

  function onKeydown(e: KeyboardEvent) {
    if (e.target instanceof HTMLSelectElement || e.repeat) return;
    const key = e.key.toLowerCase();
    if (key === 'arrowleft' || key === 'arrowright') {
      const delta = key === 'arrowleft' ? -0.05 : 0.05;
      bridge.setCrossfade(Math.min(1, Math.max(0, bridge.crossfade + delta)));
      e.preventDefault();
    } else if (key === ' ') {
      bridge.setCrossfade(0.5);
      e.preventDefault();
    } else if (KILL_KEYS[key]) {
      const [deck, band] = KILL_KEYS[key];
      bridge.setEqKill(deck, band, !bridge.eq[deck][band].killed);
    }
  }

  function onBeforeUnload(e: BeforeUnloadEvent) {
    const live = bridge.decks.A.status === 'live' || bridge.decks.B.status === 'live';
    if (live) e.preventDefault();
  }
</script>

<svelte:window onkeydown={onKeydown} onbeforeunload={onBeforeUnload} />

<main>
  <header>
    <h1>TabDecks</h1>
    <svelte:boundary onerror={boundaryError}>
      <LinkPanel {bridge} />
      {#snippet failed()}<span class="panel-error">Link panel error</span>{/snippet}
    </svelte:boundary>
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
      <div class="xfade-col">
        <Crossfader value={bridge.crossfade} onchange={(v) => bridge.setCrossfade(v)} />
        <CutButtons {bridge} />
      </div>
      <div class="master">
        <Fader
          label="Master"
          value={bridge.master}
          min={0}
          max={1.5}
          onchange={(v) => bridge.setMaster(v)}
        />
        <Meter analyser={engine.master.analyser} horizontal />
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
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
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
  .xfade-col {
    display: flex;
    flex-direction: column;
    gap: 10px;
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
