<script lang="ts">
  import Knob from './Knob.svelte';
  import type { FxParamSpec } from '@/audio/fx/types';

  interface Props {
    spec: FxParamSpec;
    value: number;
    onchange: (value: number) => void;
    /** For momentary params: press/release. */
    onmomentary?: (down: boolean) => void;
  }
  let { spec, value, onchange, onmomentary }: Props = $props();
</script>

{#if spec.kind === 'enum'}
  <label class="enum">
    <span>{spec.label}</span>
    <select value={String(value)} onchange={(e) => onchange(Number(e.currentTarget.value))}>
      {#each spec.enumValues ?? [] as opt (opt.value)}
        <option value={String(opt.value)}>{opt.label}</option>
      {/each}
    </select>
  </label>
{:else if spec.kind === 'momentary'}
  <button
    class="momentary"
    onpointerdown={(e) => {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      onmomentary?.(true);
    }}
    onpointerup={() => onmomentary?.(false)}
    onpointercancel={() => onmomentary?.(false)}
  >
    {spec.label}
  </button>
{:else}
  <Knob
    label={spec.label}
    {value}
    min={spec.min}
    max={spec.max}
    center={spec.default}
    {onchange}
  />
{/if}

<style>
  .enum {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 10px;
    color: #9aa0b4;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
  .enum select {
    background: #20202a;
    color: #e8e8ee;
    border: 1px solid #343442;
    border-radius: 4px;
    font-size: 11px;
    padding: 3px;
  }
  .momentary {
    padding: 10px 14px;
    border-radius: 6px;
    border: 1px solid #343442;
    background: #20202a;
    color: #e8e8ee;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    cursor: pointer;
    touch-action: none;
  }
  .momentary:active {
    background: #4f7cff;
    border-color: #4f7cff;
  }
</style>
