<script lang="ts">
  import Knob from './Knob.svelte';
  import LoopControls from './LoopControls.svelte';
  import { STUTTER_SLICES_MS } from '@/audio/transport';
  import { CUE_COUNT } from '@/lib/stores/engine-bridge.svelte';
  import type { EngineBridge } from '@/lib/stores/engine-bridge.svelte';
  import type { DeckId } from '@/messaging/protocol';

  interface Props {
    bridge: EngineBridge;
    deck: DeckId;
  }
  let { bridge, deck }: Props = $props();

  const t = $derived(bridge.transport[deck]);
  const recording = $derived(t.trackStart !== null && t.trackEnd === null);

  function hold(action: (down: boolean) => void) {
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

  function fmtBehind(s: number): string {
    if (s < 0.15) return 'LIVE';
    return `-${s.toFixed(1)}s`;
  }
</script>

<div class="transport">
  <div class="row gestures">
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
          <button class="slice" class:on={t.sliceMs === ms} onclick={() => bridge.setStutterSlice(deck, ms)}>
            {SLICE_LABELS[ms]}
          </button>
        {/each}
      </div>
    </div>

    <Knob label="Pitch" value={t.rate} min={0.5} max={2} center={1} onchange={(v) => bridge.setRate(deck, v)} />
  </div>

  <div class="row playback">
    <button class="btn" onclick={() => bridge.togglePlay(deck)} title="Pause holds the deck — the tab keeps playing into the buffer">
      {t.playing ? '⏸' : '▶'}
    </button>
    <button class="btn live" class:dim={t.mode === 'live'} onclick={() => bridge.jumpLive(deck)} title="Snap back to the live edge">
      LIVE
    </button>
    <span class="behind" class:islive={t.mode === 'live'}>{fmtBehind(t.behind)}</span>

    <LoopControls {bridge} {deck} />

    <span class="spacer"></span>

    {#if t.mode === 'track'}
      <button class="btn" onclick={() => bridge.trackRestart(deck)} title="Back to track start">⏮</button>
      <button class="btn" onclick={() => bridge.trackExit(deck)} title="Leave track mode">EXIT</button>
    {:else}
      <button class="btn mark" class:rec={recording} onclick={() => bridge.trackMark(deck)}
        title="Mark song start, then mark its end to get full track control">
        {recording ? '■ MARK END' : '● MARK START'}
      </button>
    {/if}

    <span class="cues">
      {#each Array.from({ length: CUE_COUNT }, (_, i) => i) as slot (slot)}
        {@const set = t.cues[slot] != null}
        <button
          class="cue"
          class:set
          onclick={() => bridge.cue(deck, slot)}
          oncontextmenu={(e) => {
            e.preventDefault();
            bridge.clearCue(deck, slot);
          }}
          title={set ? 'Jump to cue (right-click clears)' : 'Set cue at playhead'}
        >
          {slot + 1}
        </button>
      {/each}
    </span>
  </div>
</div>

<style>
  .transport {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .row {
    display: flex;
    gap: 14px;
    justify-content: center;
    align-items: center;
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
  .btn {
    padding: 6px 10px;
    border-radius: 6px;
    border: 1px solid #343442;
    background: #20202a;
    color: #e8e8ee;
    font-size: 12px;
    cursor: pointer;
  }
  .btn.live {
    color: #4ade80;
    font-weight: 700;
    letter-spacing: 0.08em;
  }
  .btn.live.dim {
    opacity: 0.4;
  }
  .btn.mark.rec {
    background: #b91c1c;
    border-color: #b91c1c;
    color: #fff;
  }
  .behind {
    font-size: 11px;
    font-variant-numeric: tabular-nums;
    color: #f59e0b;
    min-width: 44px;
  }
  .behind.islive {
    color: #4ade80;
  }
  .spacer {
    flex: 1;
  }
  .cues {
    display: flex;
    gap: 4px;
  }
  .cue {
    width: 22px;
    height: 22px;
    border-radius: 4px;
    border: 1px solid #343442;
    background: transparent;
    color: #6b7088;
    font-size: 10px;
    cursor: pointer;
  }
  .cue.set {
    background: #facc15;
    border-color: #facc15;
    color: #111;
    font-weight: 700;
  }
</style>
