<script lang="ts">
  import type { AckResponse, DeckId, Message } from '@/messaging/protocol';

  let tab = $state<chrome.tabs.Tab | null>(null);
  let blocked = $state('');
  let busy = $state<DeckId | null>(null);
  let done = $state<DeckId | null>(null);
  let error = $state('');

  $effect(() => {
    void init();
  });

  async function init() {
    const [t] = await chrome.tabs.query({ active: true, currentWindow: true });
    tab = t ?? null;
    const url = t?.url ?? '';
    if (!t?.id) {
      blocked = 'No capturable tab found.';
    } else if (/^(chrome|chrome-extension|edge|devtools|about):/.test(url)) {
      blocked = 'Browser pages cannot be captured. Open a tab that plays audio.';
    }
  }

  async function assign(deck: DeckId) {
    if (!tab?.id || busy) return;
    busy = deck;
    error = '';
    try {
      const res = (await chrome.runtime.sendMessage({
        type: 'assignDeck',
        deck,
        targetTabId: tab.id,
        tabTitle: tab.title ?? 'Untitled tab',
      } satisfies Message)) as AckResponse | undefined;
      if (res?.ok) {
        done = deck;
        setTimeout(() => window.close(), 500);
      } else {
        error = res?.error ?? 'No response from the extension.';
      }
    } catch (e) {
      error = String(e);
    } finally {
      busy = null;
    }
  }
</script>

<main>
  <h1>TabDecks</h1>
  {#if blocked}
    <p class="blocked">{blocked}</p>
  {:else}
    <p class="tab-title" title={tab?.title}>{tab?.title ?? '…'}</p>
    <div class="buttons">
      <button class="deck a" disabled={busy !== null} onclick={() => assign('A')}>
        {#if busy === 'A'}Capturing…{:else if done === 'A'}✓ Deck A{:else}Capture to Deck A{/if}
      </button>
      <button class="deck b" disabled={busy !== null} onclick={() => assign('B')}>
        {#if busy === 'B'}Capturing…{:else if done === 'B'}✓ Deck B{:else}Capture to Deck B{/if}
      </button>
    </div>
    {#if error}
      <p class="error">{error}</p>
    {/if}
  {/if}
</main>

<style>
  :global(body) {
    margin: 0;
    background: #16161c;
    color: #e8e8ee;
    font-family: system-ui, sans-serif;
  }
  main {
    width: 280px;
    padding: 14px;
    box-sizing: border-box;
  }
  h1 {
    margin: 0 0 8px;
    font-size: 15px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #9aa0b4;
  }
  .tab-title {
    margin: 0 0 12px;
    font-size: 13px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    color: #c9cde0;
  }
  .buttons {
    display: flex;
    gap: 8px;
  }
  .deck {
    flex: 1;
    padding: 10px 6px;
    border: 0;
    border-radius: 6px;
    font-size: 13px;
    font-weight: 600;
    color: #fff;
    cursor: pointer;
  }
  .deck:disabled {
    opacity: 0.6;
    cursor: default;
  }
  .deck.a {
    background: #2563eb;
  }
  .deck.b {
    background: #d97706;
  }
  .blocked,
  .error {
    font-size: 12px;
    color: #f87171;
    margin: 10px 0 0;
  }
  .blocked {
    color: #9aa0b4;
  }
</style>
