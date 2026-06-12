<script lang="ts">
  import type { EngineBridge } from '@/lib/stores/engine-bridge.svelte';

  interface Props {
    bridge: EngineBridge;
  }
  let { bridge }: Props = $props();

  let latency = $state('');

  $effect(() => {
    const update = () => {
      const { base, output } = bridge.engine.latency;
      latency = `latency ${((base + output) * 1000).toFixed(1)} ms`;
    };
    update();
    const id = setInterval(update, 2000);
    return () => clearInterval(id);
  });

  // Stability drill (docs/testing.md): a UI crash must never touch audio.
  function throwInUi(): never {
    throw new Error('dev: deliberate UI crash');
  }
</script>

<footer class="statusbar">
  <span class="hint">
    Click the TabDecks icon on a tab that plays audio to assign it to a deck. Shortcuts:
    ←/→ crossfade · Space center · QWE kills A · IOP kills B
  </span>
  <span class="right">
    {#if bridge.lastError}
      <span class="error" title={bridge.lastError}>⚠ {bridge.lastError}</span>
    {/if}
    <span class="latency">{latency}</span>
    {#if import.meta.env.DEV}
      <button class="dev-throw" onclick={throwInUi} title="Stability drill: crash this panel">💥</button>
    {/if}
  </span>
</footer>

<style>
  .statusbar {
    display: flex;
    justify-content: space-between;
    gap: 16px;
    font-size: 11px;
    color: #6b7088;
    padding-top: 10px;
    align-items: center;
  }
  .right {
    display: flex;
    gap: 12px;
    align-items: center;
    white-space: nowrap;
  }
  .error {
    color: #f87171;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 380px;
  }
  .latency {
    font-variant-numeric: tabular-nums;
  }
  .dev-throw {
    background: none;
    border: 1px solid #3a3a48;
    border-radius: 4px;
    cursor: pointer;
    font-size: 10px;
    padding: 2px 5px;
  }
</style>
