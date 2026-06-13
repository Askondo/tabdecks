<script lang="ts">
  import type { EngineBridge } from '@/lib/stores/engine-bridge.svelte';
  import type { DeckId } from '@/messaging/protocol';

  interface Props {
    bridge: EngineBridge;
    deck: DeckId;
  }
  let { bridge, deck }: Props = $props();

  const grid = $derived(bridge.grids[deck]);
  const t = $derived(bridge.transport[deck]);

  // Beat LED: phase of the playhead within the grid (status updates ~20 Hz).
  const beatLit = $derived.by(() => {
    if (grid.bpm === null || grid.anchor === null) return false;
    const period = (60 / grid.bpm) * 48000;
    const phase = (((t.readPos - grid.anchor) % period) + period) % period;
    return phase < period * 0.18;
  });

  let editing = $state(false);
  let editValue = $state('');

  function startEdit() {
    editing = true;
    editValue = grid.bpm?.toFixed(1) ?? '';
  }

  function commitEdit() {
    editing = false;
    const v = Number(editValue);
    if (Number.isFinite(v) && v >= 30 && v <= 300) bridge.setManualBpm(deck, v);
  }

  const confColor = $derived(
    grid.source === 'manual' ? '#facc15' : grid.confidence > 0.5 ? '#4ade80' : grid.confidence > 0.2 ? '#f59e0b' : '#6b7088',
  );
</script>

<div class="bpm">
  <span class="led" class:lit={beatLit}></span>

  {#if editing}
    <!-- svelte-ignore a11y_autofocus -->
    <input
      class="bpm-edit"
      bind:value={editValue}
      autofocus
      onblur={commitEdit}
      onkeydown={(e) => {
        if (e.key === 'Enter') commitEdit();
        if (e.key === 'Escape') editing = false;
        e.stopPropagation();
      }}
    />
  {:else}
    <button class="value" ondblclick={startEdit} title="Double-click to set BPM manually">
      {grid.bpm ? grid.bpm.toFixed(1) : '—'}
    </button>
  {/if}
  <span class="conf" style="background:{confColor}" title="Grid confidence ({grid.source})"></span>

  <button class="mini" onclick={() => bridge.tapTempo(deck)} title="Tap tempo">TAP</button>
  {#if grid.source === 'manual'}
    <button class="mini" onclick={() => bridge.clearManualBpm(deck)} title="Back to auto detection">AUTO</button>
  {/if}
  <span class="nudge">
    <button class="mini" onclick={() => bridge.nudgeGrid(deck, -10)} title="Grid earlier 10 ms">◀</button>
    <button class="mini" onclick={() => bridge.nudgeGrid(deck, 10)} title="Grid later 10 ms">▶</button>
  </span>
</div>

<style>
  .bpm {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
  }
  .led {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #23232e;
    transition: background 40ms linear;
  }
  .led.lit {
    background: #4ade80;
    box-shadow: 0 0 6px #4ade80;
  }
  .value {
    background: none;
    border: 0;
    color: #e8e8ee;
    font-size: 15px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    cursor: text;
    padding: 0;
    min-width: 48px;
    text-align: right;
  }
  .bpm-edit {
    width: 54px;
    background: #20202a;
    border: 1px solid #4f7cff;
    border-radius: 4px;
    color: #e8e8ee;
    font-size: 13px;
    padding: 2px 4px;
  }
  .conf {
    width: 6px;
    height: 6px;
    border-radius: 50%;
  }
  .mini {
    font-size: 9px;
    letter-spacing: 0.06em;
    padding: 3px 6px;
    border-radius: 4px;
    border: 1px solid #343442;
    background: transparent;
    color: #9aa0b4;
    cursor: pointer;
  }
  .mini:active {
    background: #4f7cff;
    color: #fff;
  }
  .nudge {
    display: flex;
    gap: 2px;
  }
</style>
