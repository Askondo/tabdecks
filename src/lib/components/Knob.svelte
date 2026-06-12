<script lang="ts">
  interface Props {
    label: string;
    /** Current value. */
    value: number;
    min?: number;
    max?: number;
    /** Value restored on double-click. */
    center?: number;
    disabled?: boolean;
    onchange: (value: number) => void;
  }
  let { label, value, min = 0, max = 2, center = 1, disabled = false, onchange }: Props = $props();

  // 270° sweep from -135° (min) to +135° (max).
  const angle = $derived(((value - min) / (max - min)) * 270 - 135);

  let dragging = false;
  let startY = 0;
  let startValue = 0;

  function pointerDown(e: PointerEvent) {
    if (disabled) return;
    dragging = true;
    startY = e.clientY;
    startValue = value;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function pointerMove(e: PointerEvent) {
    if (!dragging) return;
    // 150 px of vertical drag = full range; shift = fine control.
    const scale = (max - min) / (e.shiftKey ? 600 : 150);
    const next = Math.min(max, Math.max(min, startValue + (startY - e.clientY) * scale));
    onchange(next);
  }

  function pointerUp() {
    dragging = false;
  }
</script>

<div class="knob-wrap" class:disabled>
  <div
    class="knob"
    role="slider"
    aria-label={label}
    aria-valuemin={min}
    aria-valuemax={max}
    aria-valuenow={value}
    tabindex="0"
    onpointerdown={pointerDown}
    onpointermove={pointerMove}
    onpointerup={pointerUp}
    ondblclick={() => onchange(center)}
    onkeydown={(e) => {
      if (e.key === 'ArrowUp') onchange(Math.min(max, value + 0.05));
      if (e.key === 'ArrowDown') onchange(Math.max(min, value - 0.05));
    }}
    title="Drag to adjust · double-click to reset"
  >
    <div class="pointer" style="transform: rotate({angle}deg)"></div>
  </div>
  <span class="name">{label}</span>
</div>

<style>
  .knob-wrap {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    font-size: 10px;
    color: #9aa0b4;
  }
  .knob-wrap.disabled {
    opacity: 0.45;
  }
  .knob {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    background: radial-gradient(circle at 35% 30%, #3a3a48, #20202a 70%);
    border: 1px solid #343442;
    position: relative;
    cursor: ns-resize;
    touch-action: none;
  }
  .pointer {
    position: absolute;
    inset: 0;
  }
  .pointer::after {
    content: '';
    position: absolute;
    left: 50%;
    top: 3px;
    width: 3px;
    height: 12px;
    margin-left: -1.5px;
    border-radius: 2px;
    background: #e8e8ee;
  }
  .name {
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
</style>
