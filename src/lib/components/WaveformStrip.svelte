<script lang="ts">
  import type { EngineBridge } from '@/lib/stores/engine-bridge.svelte';
  import type { DeckId } from '@/messaging/protocol';

  interface Props {
    bridge: EngineBridge;
    deck: DeckId;
  }
  let { bridge, deck }: Props = $props();

  const TIMESHIFT_WINDOW_S = 45;
  const SR = 48000;

  let canvas = $state<HTMLCanvasElement | null>(null);
  const t = $derived(bridge.transport[deck]);

  /** Visible absolute sample range. */
  function windowRange(): [number, number] {
    if (t.mode === 'track' && t.trackStart !== null && t.trackEnd !== null) {
      return [t.trackStart, t.trackEnd];
    }
    return [Math.max(0, t.written - TIMESHIFT_WINDOW_S * SR), t.written];
  }

  // Redraw whenever a transport status update mutates the state (~20 Hz).
  $effect(() => {
    void t.written;
    void t.readPos;
    void t.mode;
    draw();
  });

  function draw(): void {
    if (!canvas) return;
    const ctx2d = canvas.getContext('2d');
    if (!ctx2d) return;
    const w = canvas.width;
    const h = canvas.height;
    const [from, to] = windowRange();
    const span = Math.max(1, to - from);

    ctx2d.clearRect(0, 0, w, h);

    // Peaks
    ctx2d.fillStyle = deck === 'A' ? '#2f54a8' : '#a86a18';
    for (let x = 0; x < w; x++) {
      const a0 = from + (x / w) * span;
      const a1 = from + ((x + 1) / w) * span;
      const peak = bridge.peakBetween(deck, a0, a1);
      const bar = Math.max(1, peak * (h - 2));
      ctx2d.fillRect(x, (h - bar) / 2, 1, bar);
    }

    // Beat-grid ticks (taller every 4th beat from the anchor)
    const grid = bridge.grids[deck];
    if (grid.bpm !== null && grid.anchor !== null) {
      const period = (60 / grid.bpm) * SR;
      const firstBeat = Math.ceil((from - grid.anchor) / period);
      const lastBeat = Math.floor((to - grid.anchor) / period);
      for (let b = firstBeat; b <= lastBeat; b++) {
        const x = ((grid.anchor + b * period - from) / span) * w;
        const isBar = ((b % 4) + 4) % 4 === 0;
        ctx2d.fillStyle = isBar ? 'rgba(232,232,238,0.35)' : 'rgba(232,232,238,0.12)';
        ctx2d.fillRect(x, 0, 1, isBar ? h : h * 0.5);
      }
    }

    // History boundary (older audio evicted)
    if (t.oldest > from) {
      const x = ((t.oldest - from) / span) * w;
      ctx2d.fillStyle = 'rgba(255,255,255,0.06)';
      ctx2d.fillRect(0, 0, x, h);
    }

    // Cues
    ctx2d.fillStyle = '#facc15';
    for (const cue of t.cues) {
      if (cue == null || cue < from || cue > to) continue;
      const x = ((cue - from) / span) * w;
      ctx2d.fillRect(x - 1, 0, 2, 6);
    }

    // Playhead (purple while a quantized action is armed)
    const px = ((Math.min(t.readPos, to) - from) / span) * w;
    ctx2d.fillStyle = t.pending > 0 ? '#a78bfa' : '#e8e8ee';
    ctx2d.fillRect(px - 1, 0, 2, h);

    // Live edge marker (right side, non-track modes)
    if (t.mode !== 'track') {
      ctx2d.fillStyle = '#4ade80';
      ctx2d.fillRect(w - 2, 0, 2, h);
    }
  }

  let scrubbing = false;

  function seekFromEvent(e: PointerEvent): void {
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const frac = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const [from, to] = windowRange();
    bridge.seekAbs(deck, from + frac * (to - from));
  }

  function pointerDown(e: PointerEvent): void {
    scrubbing = true;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    seekFromEvent(e);
  }
</script>

<canvas
  bind:this={canvas}
  width="460"
  height="56"
  class="waveform"
  onpointerdown={pointerDown}
  onpointermove={(e) => scrubbing && seekFromEvent(e)}
  onpointerup={() => (scrubbing = false)}
  onpointercancel={() => (scrubbing = false)}
  title="Click/drag to scrub"
></canvas>

<style>
  .waveform {
    width: 100%;
    height: 56px;
    background: #0c0c11;
    border: 1px solid #23232e;
    border-radius: 6px;
    cursor: crosshair;
    touch-action: none;
  }
</style>
