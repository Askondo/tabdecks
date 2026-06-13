<script lang="ts">
  import type { EngineBridge } from '@/lib/stores/engine-bridge.svelte';

  interface Props {
    bridge: EngineBridge;
  }
  let { bridge }: Props = $props();

  const link = $derived(bridge.link);
  const isMaster = $derived(bridge.sync.master === 'link');

  const dotColor = $derived(
    link.bridge === 'connected' ? '#4ade80'
    : link.bridge === 'connecting' ? '#f59e0b'
    : link.bridge === 'error' ? '#f87171'
    : '#6b7088',
  );
</script>

<div class="link">
  <button class="enable" class:on={link.enabled} onclick={() => bridge.toggleLink()}>
    <span class="dot" style="background:{dotColor}"></span>
    LINK
  </button>

  {#if link.enabled}
    {#if link.bridge === 'connected'}
      <span class="stat">{link.peers} peer{link.peers === 1 ? '' : 's'}</span>
      <span class="stat bpm">{link.bpm.toFixed(1)} BPM</span>
      <button
        class="master"
        class:on={isMaster}
        onclick={() => bridge.setSyncMaster(isMaster ? 'A' : 'link')}
        title="Slave both decks to the Link session clock"
      >
        {isMaster ? 'MASTER: LINK' : 'USE AS MASTER'}
      </button>
    {:else}
      <span class="stat msg" title={link.message}>
        {link.bridge === 'connecting' ? 'connecting…' : (link.message ?? link.bridge)}
      </span>
      {#if link.bridge === 'error'}
        <span class="hint">run <code>npm run link:install</code></span>
      {/if}
    {/if}
  {/if}
</div>

<style>
  .link {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 11px;
    color: #9aa0b4;
  }
  .enable {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    border-radius: 6px;
    border: 1px solid #343442;
    background: transparent;
    color: #c9cde0;
    font-weight: 700;
    letter-spacing: 0.1em;
    cursor: pointer;
  }
  .enable.on {
    background: #1e293b;
    border-color: #0891b2;
    color: #67e8f9;
  }
  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
  }
  .stat {
    font-variant-numeric: tabular-nums;
  }
  .stat.bpm {
    color: #c9cde0;
    font-weight: 600;
  }
  .msg {
    color: #f59e0b;
  }
  .master {
    padding: 4px 8px;
    border-radius: 4px;
    border: 1px solid #343442;
    background: transparent;
    color: #9aa0b4;
    font-size: 9px;
    letter-spacing: 0.06em;
    cursor: pointer;
  }
  .master.on {
    background: #facc15;
    border-color: #facc15;
    color: #111;
    font-weight: 700;
  }
  .hint code {
    color: #c9cde0;
  }
</style>
