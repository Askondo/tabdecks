<script lang="ts">
  import Knob from './Knob.svelte';
  import { EQ_BANDS, type EqBand } from '@/audio/eq';
  import type { EngineBridge } from '@/lib/stores/engine-bridge.svelte';
  import type { DeckId } from '@/messaging/protocol';

  interface Props {
    bridge: EngineBridge;
    deck: DeckId;
  }
  let { bridge, deck }: Props = $props();

  const LABELS: Record<EqBand, string> = { low: 'Low', mid: 'Mid', high: 'High' };
  // DJ mixers order top-down HI/MID/LOW; horizontally we go LOW→HIGH left to right.
  const ORDER: EqBand[] = [...EQ_BANDS];
</script>

<div class="eq">
  {#each ORDER as band (band)}
    <div class="band">
      <Knob
        label={LABELS[band]}
        value={bridge.eq[deck][band].value}
        min={0}
        max={2}
        center={1}
        disabled={bridge.eq[deck][band].killed}
        onchange={(v) => bridge.setEq(deck, band, v)}
      />
      <button
        class="kill"
        class:on={bridge.eq[deck][band].killed}
        onclick={() => bridge.setEqKill(deck, band, !bridge.eq[deck][band].killed)}
        title="Kill {LABELS[band]}"
      >
        KILL
      </button>
    </div>
  {/each}
</div>

<style>
  .eq {
    display: flex;
    gap: 18px;
    justify-content: center;
  }
  .band {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
  }
  .kill {
    font-size: 9px;
    letter-spacing: 0.1em;
    padding: 3px 8px;
    border-radius: 4px;
    border: 1px solid #3a3a48;
    background: transparent;
    color: #9aa0b4;
    cursor: pointer;
  }
  .kill.on {
    background: #b91c1c;
    border-color: #b91c1c;
    color: #fff;
  }
</style>
