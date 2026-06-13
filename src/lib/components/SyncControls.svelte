<script lang="ts">
  import type { EngineBridge } from '@/lib/stores/engine-bridge.svelte';
  import type { DeckId } from '@/messaging/protocol';

  interface Props {
    bridge: EngineBridge;
    deck: DeckId;
  }
  let { bridge, deck }: Props = $props();

  const engaged = $derived(bridge.sync.engaged[deck]);
  const isMaster = $derived(bridge.sync.master === deck);
  const hasGrid = $derived(bridge.grids[deck].bpm !== null);
  const err = $derived(bridge.sync.error[deck]);
  // Lock indicator: tight when |error| < ~8 ms (0.016 beats at 120).
  const locked = $derived(engaged && Number.isFinite(err) && Math.abs(err) < 0.02);
</script>

<div class="sync" title={hasGrid ? '' : 'Needs a beat grid (BPM)'}>
  <button
    class="syncbtn"
    class:on={engaged}
    class:locked
    disabled={!hasGrid || isMaster}
    onclick={() => bridge.setSync(deck, !engaged)}
    title="Continuous tempo + phase lock to master"
  >
    SYNC
  </button>
  <button
    class="phasebtn"
    disabled={!hasGrid || isMaster}
    onclick={() => bridge.alignPhase(deck)}
    title="One-shot phase align to master"
  >
    PHASE
  </button>
  <button
    class="masterbtn"
    class:on={isMaster}
    onclick={() => bridge.setSyncMaster(deck)}
    title="Make this deck the sync master"
  >
    M
  </button>
  <button
    class="keylock"
    class:on={bridge.config.keylock[deck]}
    onclick={() => bridge.setKeylock(deck, !bridge.config.keylock[deck])}
    title="Key-lock: tempo without pitch (varispeed when off)"
  >
    KEY
  </button>
</div>

<style>
  .sync {
    display: flex;
    gap: 4px;
    align-items: center;
  }
  button {
    font-size: 9px;
    letter-spacing: 0.08em;
    padding: 4px 7px;
    border-radius: 4px;
    border: 1px solid #343442;
    background: transparent;
    color: #9aa0b4;
    cursor: pointer;
  }
  button:disabled {
    opacity: 0.35;
    cursor: default;
  }
  .syncbtn.on {
    background: #0891b2;
    border-color: #0891b2;
    color: #fff;
  }
  .syncbtn.locked {
    background: #06b6d4;
    border-color: #67e8f9;
    box-shadow: 0 0 6px #06b6d4;
  }
  .masterbtn.on {
    background: #facc15;
    border-color: #facc15;
    color: #111;
    font-weight: 700;
  }
  .phasebtn:active {
    background: #4f7cff;
    color: #fff;
  }
  .keylock.on {
    background: #16a34a;
    border-color: #16a34a;
    color: #fff;
  }
</style>
