<script lang="ts">
  // Phase 1: capture proof — two decks routed straight to the destination.
  // The AudioEngine (trim/EQ/FX/fader/crossfader) replaces the raw routing in Phase 2.
  import { captureTabAudio } from '@/audio/capture';
  import { onMessage } from '@/messaging/router';
  import type { DeckId, Message } from '@/messaging/protocol';

  interface DeckState {
    status: 'empty' | 'live' | 'disconnected' | 'error';
    title: string;
    error?: string;
  }

  let decks = $state<Record<DeckId, DeckState>>({
    A: { status: 'empty', title: '' },
    B: { status: 'empty', title: '' },
  });
  let needsResume = $state(false);

  const ctx = new AudioContext({ latencyHint: 'interactive', sampleRate: 48000 });
  const sources: Partial<Record<DeckId, MediaStreamAudioSourceNode>> = {};

  if (ctx.state === 'suspended') needsResume = true;

  onMessage((msg: Message) => {
    if (msg.type === 'pingMixer') return { pong: true };
    if (msg.type === 'captureDeck') {
      return capture(msg.deck, msg.targetTabId, msg.tabTitle)
        .then(() => ({ ok: true }))
        .catch((e) => ({ ok: false, error: String(e) }));
    }
    return undefined;
  });

  async function capture(deck: DeckId, targetTabId: number, tabTitle: string) {
    try {
      const stream = await captureTabAudio(targetTabId);
      // Re-assignment: drop the previous source; downstream graph stays warm.
      sources[deck]?.disconnect();
      const source = ctx.createMediaStreamSource(stream);
      source.connect(ctx.destination);
      sources[deck] = source;

      const track = stream.getAudioTracks()[0];
      track?.addEventListener('ended', () => {
        decks[deck] = { status: 'disconnected', title: decks[deck].title };
      });

      decks[deck] = { status: 'live', title: tabTitle };
      if (ctx.state === 'suspended') needsResume = true;
    } catch (e) {
      decks[deck] = { status: 'error', title: tabTitle, error: String(e) };
      throw e;
    }
  }

  async function resumeAudio() {
    await ctx.resume();
    needsResume = ctx.state !== 'running';
  }
</script>

<main>
  <header>
    <h1>TabDecks</h1>
    <span class="hint">Click the TabDecks icon on a tab that plays audio to assign it to a deck.</span>
  </header>

  <div class="decks">
    {#each ['A', 'B'] as const as deck (deck)}
      <section class="deck" class:live={decks[deck].status === 'live'} data-deck={deck}>
        <h2>Deck {deck}</h2>
        <p class="status {decks[deck].status}">
          {#if decks[deck].status === 'empty'}
            No tab assigned
          {:else if decks[deck].status === 'live'}
            ● LIVE — {decks[deck].title}
          {:else if decks[deck].status === 'disconnected'}
            Disconnected — {decks[deck].title}
          {:else}
            Error: {decks[deck].error}
          {/if}
        </p>
      </section>
    {/each}
  </div>

  {#if needsResume}
    <button class="resume-overlay" onclick={resumeAudio}>Click to start audio</button>
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
  }
  header {
    display: flex;
    align-items: baseline;
    gap: 14px;
    margin-bottom: 16px;
  }
  h1 {
    margin: 0;
    font-size: 18px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }
  .hint {
    font-size: 12px;
    color: #9aa0b4;
  }
  .decks {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
  }
  .deck {
    border: 1px solid #2a2a36;
    border-radius: 10px;
    padding: 14px;
    background: #16161e;
  }
  .deck.live[data-deck='A'] {
    border-color: #2563eb;
  }
  .deck.live[data-deck='B'] {
    border-color: #d97706;
  }
  h2 {
    margin: 0 0 8px;
    font-size: 14px;
    color: #c9cde0;
  }
  .status {
    margin: 0;
    font-size: 13px;
    color: #9aa0b4;
  }
  .status.live {
    color: #4ade80;
  }
  .status.error {
    color: #f87171;
  }
  .resume-overlay {
    position: fixed;
    inset: 0;
    background: rgba(10, 10, 14, 0.92);
    color: #fff;
    border: 0;
    font-size: 22px;
    cursor: pointer;
  }
</style>
