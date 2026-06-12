<script lang="ts">
  import type { EngineBridge } from '@/lib/stores/engine-bridge.svelte';

  interface Props {
    bridge: EngineBridge;
  }
  let { bridge }: Props = $props();
</script>

<footer class="statusbar">
  <span class="hint">Click the TabDecks icon on a tab that plays audio to assign it to a deck.</span>
  {#if bridge.lastError}
    <span class="error" title={bridge.lastError}>⚠ {bridge.lastError}</span>
  {/if}
</footer>

<style>
  .statusbar {
    display: flex;
    justify-content: space-between;
    gap: 16px;
    font-size: 11px;
    color: #6b7088;
    padding-top: 10px;
  }
  .error {
    color: #f87171;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 50%;
  }
</style>
