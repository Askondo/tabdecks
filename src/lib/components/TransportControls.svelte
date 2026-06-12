<script lang="ts">
  import Knob from './Knob.svelte';
  import { STUTTER_SLICES_MS } from '@/audio/transport';
  import type { EngineBridge } from '@/lib/stores/engine-bridge.svelte';
  import type { DeckId } from '@/messaging/protocol';

  interface Props {
    bridge: EngineBridge;
    deck: DeckId;
  }
  let { bridge, deck }: Props = $props();

  const t = $derived(bridge.transport[deck]);

  function hold(
    action: (down: boolean) => void,
  ): {
    onpointerdown: (e: PointerEvent) => void;
    onpointerup: () => void;
    onpointercancel: () => void;
  } {
    return {
      onpointerdown: (e: PointerEvent) => {
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        action(true);
      },
      onpointerup: () => action(false),
      onpointercancel: () => action(false),
    };
  }

  const SLICE_LABELS: Record<number, string> = { 500: '1/2', 250: '1/4', 125: '1/8', 62: '1/16', 31: '1/32' };
</script>

<div class="transport">
  <div class="gesture">
    <button class="hold brake" class:active={t.braking} {...hold((d) => bridge.brake(deck, d))}>
      BRAKE
    </button>
    <Knob
      label="Time"
      value={t.brakeTime}
      min={0.1}
      max={4}
      center={0.8}
      onchange={(v) => bridge.setBrakeTime(deck, v)}
    />
  </div>

  <div class="gesture">
    <button class="hold stutter" class:active={t.stuttering} {...hold((d) => bridge.stutter(deck, d))}>
      STUTTER
    </button>
    <div class="slices">
      {#each STUTTER_SLICES_MS as ms (ms)}
        <button
          class="slice"
          class:on={t.sliceMs === ms}
          onclick={() => bridge.setStutterSlice(deck, ms)}
        >
          {SLICE_LABELS[ms]}
        </button>
      {/each}
    </div>
  </div>
</div>

<style>
  .transport {
    display: flex;
    gap: 18px;
    justify-content: center;
    align-items: flex-start;
  }
  .gesture {
    display: flex;
    gap: 10px;
    align-items: center;
  }
  .hold {
    padding: 14px 16px;
    border-radius: 8px;
    border: 1px solid #343442;
    background: #20202a;
    color: #e8e8ee;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.1em;
    cursor: pointer;
    touch-action: none;
    user-select: none;
  }
  .hold.brake.active {
    background: #b91c1c;
    border-color: #b91c1c;
  }
  .hold.stutter.active {
    background: #4f7cff;
    border-color: #4f7cff;
  }
  .slices {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .slice {
    font-size: 9px;
    padding: 2px 6px;
    border-radius: 3px;
    border: 1px solid #2a2a36;
    background: transparent;
    color: #9aa0b4;
    cursor: pointer;
  }
  .slice.on {
    background: #4f7cff;
    border-color: #4f7cff;
    color: #fff;
  }
</style>
