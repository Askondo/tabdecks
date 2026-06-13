<script lang="ts">
  import type { EngineBridge } from '@/lib/stores/engine-bridge.svelte';
  import type { DeckId } from '@/messaging/protocol';

  interface Props {
    bridge: EngineBridge;
    deck: DeckId;
  }
  let { bridge, deck }: Props = $props();

  const t = $derived(bridge.transport[deck]);
  const hasGrid = $derived(bridge.grids[deck].bpm !== null);
  const BARS = [1, 2, 4, 8];
</script>

<div class="loops" title={hasGrid ? 'Fixed bar loops (grid-aligned)' : 'Needs a beat grid (BPM)'}>
  <span class="label">LOOP</span>
  {#each BARS as bars (bars)}
    <button
      class="bar"
      class:on={t.loopBars === bars}
      disabled={!hasGrid}
      onclick={() => bridge.setBarLoop(deck, bars)}
    >
      {bars}
    </button>
  {/each}
</div>

<style>
  .loops {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .label {
    font-size: 9px;
    letter-spacing: 0.1em;
    color: #9aa0b4;
    margin-right: 2px;
  }
  .bar {
    width: 26px;
    height: 24px;
    border-radius: 4px;
    border: 1px solid #2a2a36;
    background: transparent;
    color: #9aa0b4;
    font-size: 11px;
    cursor: pointer;
  }
  .bar.on {
    background: #16a34a;
    border-color: #16a34a;
    color: #fff;
  }
  .bar:disabled {
    opacity: 0.35;
    cursor: default;
  }
</style>
