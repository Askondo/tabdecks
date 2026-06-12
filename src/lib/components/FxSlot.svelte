<script lang="ts">
  import FxParamControl from './FxParamControl.svelte';
  import Knob from './Knob.svelte';
  import { getFxDescriptor, listFx } from '@/audio/fx/registry';
  import type { EngineBridge } from '@/lib/stores/engine-bridge.svelte';
  import type { DeckId } from '@/messaging/protocol';

  interface Props {
    bridge: EngineBridge;
    deck: DeckId;
    slot: number;
  }
  let { bridge, deck, slot }: Props = $props();

  const state = $derived(bridge.fx[deck][slot]);
  const descriptor = $derived(state ? getFxDescriptor(state.id) : undefined);

  function select(e: Event) {
    const id = (e.currentTarget as HTMLSelectElement).value;
    if (!id) bridge.unloadFx(deck, slot);
    else void bridge.loadFx(deck, slot, id);
  }
</script>

<div class="fx-slot" class:active={!!state}>
  <div class="head">
    <select value={state?.id ?? ''} onchange={select} title="FX slot {slot + 1}">
      <option value="">— FX {slot + 1} —</option>
      {#each listFx() as fx (fx.id)}
        <option value={fx.id}>{fx.name}</option>
      {/each}
    </select>
    {#if state}
      <button
        class="bypass"
        class:on={state.bypassed}
        onclick={() => bridge.setFxBypass(deck, slot, !state.bypassed)}
        title="Bypass"
      >
        BYP
      </button>
    {/if}
  </div>

  {#if state && descriptor}
    <div class="params">
      {#each descriptor.params as spec (spec.id)}
        <FxParamControl
          {spec}
          value={state.params[spec.id] ?? spec.default}
          onchange={(v) => bridge.setFxParam(deck, slot, spec.id, v)}
        />
      {/each}
      <Knob
        label="Mix"
        value={state.wet}
        min={0}
        max={1}
        center={0.5}
        onchange={(v) => bridge.setFxWet(deck, slot, v)}
      />
    </div>
  {/if}
</div>

<style>
  .fx-slot {
    border: 1px solid #23232e;
    border-radius: 8px;
    padding: 8px;
    background: #131319;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .fx-slot.active {
    border-color: #3a3a48;
  }
  .head {
    display: flex;
    gap: 6px;
    align-items: center;
  }
  select {
    flex: 1;
    background: #20202a;
    color: #e8e8ee;
    border: 1px solid #343442;
    border-radius: 4px;
    font-size: 11px;
    padding: 4px;
  }
  .bypass {
    font-size: 9px;
    letter-spacing: 0.08em;
    padding: 4px 7px;
    border-radius: 4px;
    border: 1px solid #3a3a48;
    background: transparent;
    color: #9aa0b4;
    cursor: pointer;
  }
  .bypass.on {
    background: #d97706;
    border-color: #d97706;
    color: #fff;
  }
  .params {
    display: flex;
    gap: 12px;
    align-items: flex-end;
    justify-content: center;
    flex-wrap: wrap;
  }
</style>
