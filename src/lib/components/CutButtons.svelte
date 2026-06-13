<script lang="ts">
  import type { EngineBridge } from '@/lib/stores/engine-bridge.svelte';

  interface Props {
    bridge: EngineBridge;
  }
  let { bridge }: Props = $props();

  const QUANTA = [
    { beats: 0.25, label: '¼' },
    { beats: 0.5, label: '½' },
    { beats: 1, label: '1' },
    { beats: 4, label: 'BAR' },
  ];
</script>

<div class="cutbar">
  <button class="cut a" onclick={() => bridge.cutTo('A')} title="Cut to Deck A (quantized when Q is on)">
    CUT A
  </button>

  <div class="q">
    <button
      class="q-toggle"
      class:on={bridge.quantize.enabled}
      onclick={() => bridge.setQuantize(!bridge.quantize.enabled)}
      title="Launch/trigger quantization"
    >
      Q
    </button>
    {#each QUANTA as q (q.beats)}
      <button
        class="quantum"
        class:on={bridge.quantize.quantum === q.beats}
        disabled={!bridge.quantize.enabled}
        onclick={() => bridge.setQuantize(true, q.beats)}
      >
        {q.label}
      </button>
    {/each}
  </div>

  <button class="cut b" onclick={() => bridge.cutTo('B')} title="Cut to Deck B (quantized when Q is on)">
    CUT B
  </button>
</div>

<style>
  .cutbar {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 14px;
  }
  .cut {
    padding: 8px 14px;
    border-radius: 6px;
    border: 1px solid #343442;
    background: #20202a;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.08em;
    cursor: pointer;
  }
  .cut.a {
    color: #4f7cff;
  }
  .cut.b {
    color: #f59e0b;
  }
  .q {
    display: flex;
    gap: 4px;
    align-items: center;
  }
  .q-toggle {
    width: 30px;
    height: 30px;
    border-radius: 6px;
    border: 1px solid #343442;
    background: transparent;
    color: #9aa0b4;
    font-weight: 800;
    cursor: pointer;
  }
  .q-toggle.on {
    background: #7c3aed;
    border-color: #7c3aed;
    color: #fff;
  }
  .quantum {
    font-size: 10px;
    padding: 4px 7px;
    border-radius: 4px;
    border: 1px solid #2a2a36;
    background: transparent;
    color: #9aa0b4;
    cursor: pointer;
  }
  .quantum.on {
    background: #7c3aed;
    border-color: #7c3aed;
    color: #fff;
  }
  .quantum:disabled {
    opacity: 0.35;
    cursor: default;
  }
</style>
