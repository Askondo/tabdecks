<script lang="ts">
  interface Props {
    label: string;
    value: number;
    min?: number;
    max?: number;
    step?: number;
    vertical?: boolean;
    onchange: (value: number) => void;
  }
  let { label, value, min = 0, max = 1, step = 0.01, vertical = false, onchange }: Props = $props();

  function handleInput(e: Event) {
    onchange(Number((e.currentTarget as HTMLInputElement).value));
  }
</script>

<label class="fader" class:vertical>
  <span class="name">{label}</span>
  <input
    type="range"
    {min}
    {max}
    {step}
    {value}
    oninput={handleInput}
    style={vertical ? 'writing-mode: vertical-lr; direction: rtl;' : ''}
  />
  <span class="value">{Math.round(value * 100)}</span>
</label>

<style>
  .fader {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    color: #9aa0b4;
  }
  .fader.vertical input {
    height: 120px;
    width: 24px;
  }
  .fader:not(.vertical) input {
    width: 100%;
  }
  .name {
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
  .value {
    font-variant-numeric: tabular-nums;
    color: #c9cde0;
  }
  input[type='range'] {
    accent-color: #4f7cff;
  }
</style>
