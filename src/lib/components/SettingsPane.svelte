<script lang="ts">
  import type { EngineBridge } from '@/lib/stores/engine-bridge.svelte';

  interface Props {
    bridge: EngineBridge;
    onclose: () => void;
  }
  let { bridge, onclose }: Props = $props();

  const QUANTIZE_ACTIONS = [
    { id: 'gestures', label: 'Stutter / brake triggers' },
    { id: 'transport', label: 'Cue jumps, beat jumps, play / restart' },
    { id: 'fx', label: 'FX bypass / enable' },
    { id: 'cuts', label: 'Crossfader cut buttons' },
  ] as const;

  const QUANTA = [
    { v: 0.25, l: '¼ beat' },
    { v: 0.5, l: '½ beat' },
    { v: 1, l: '1 beat' },
    { v: 4, l: '1 bar' },
  ];
</script>

<div class="backdrop" role="presentation" onclick={onclose}></div>
<div class="pane" role="dialog" aria-label="Settings">
  <header>
    <h2>Settings</h2>
    <button class="close" onclick={onclose} aria-label="Close">✕</button>
  </header>

  <section>
    <h3>Quantization</h3>
    <label class="row">
      <input
        type="checkbox"
        checked={bridge.quantize.enabled}
        onchange={(e) => bridge.setQuantize(e.currentTarget.checked)}
      />
      Enable quantize
    </label>
    <label class="row">
      Quantum
      <select
        value={String(bridge.quantize.quantum)}
        onchange={(e) => bridge.setQuantize(true, Number(e.currentTarget.value))}
      >
        {#each QUANTA as q (q.v)}
          <option value={String(q.v)}>{q.l}</option>
        {/each}
      </select>
    </label>
    <p class="sub">Apply quantization to:</p>
    {#each QUANTIZE_ACTIONS as a (a.id)}
      <label class="row indent">
        <input
          type="checkbox"
          checked={bridge.config.quantizeActions[a.id]}
          onchange={(e) => bridge.setQuantizeAction(a.id, e.currentTarget.checked)}
        />
        {a.label}
      </label>
    {/each}
  </section>

  <section>
    <h3>Sync</h3>
    <label class="row">
      Max pitch bend ±{(bridge.config.syncMaxDev * 100).toFixed(0)}%
      <input
        type="range"
        min="2"
        max="50"
        step="1"
        value={bridge.config.syncMaxDev * 100}
        oninput={(e) => bridge.setSyncMaxDev(Number(e.currentTarget.value) / 100)}
      />
    </label>
  </section>

  <section>
    <h3>Key-lock default</h3>
    {#each ['A', 'B'] as const as deck (deck)}
      <label class="row">
        <input
          type="checkbox"
          checked={bridge.config.keylock[deck]}
          onchange={(e) => bridge.setKeylock(deck, e.currentTarget.checked)}
        />
        Deck {deck} — tempo without pitch (varispeed otherwise)
      </label>
    {/each}
  </section>

  <section>
    <h3>Ableton Link</h3>
    <label class="row">
      <input
        type="checkbox"
        checked={bridge.config.linkAutoconnect}
        onchange={(e) => bridge.setLinkAutoconnect(e.currentTarget.checked)}
      />
      Connect to Link automatically on launch
    </label>
    <p class="sub">Requires <code>npm run link:install</code> once.</p>
  </section>

  <section class="shortcuts">
    <h3>Shortcuts</h3>
    <p>←/→ crossfade · Space center · Q/W/E kills A · I/O/P kills B</p>
  </section>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    z-index: 20;
  }
  .pane {
    position: fixed;
    top: 0;
    right: 0;
    bottom: 0;
    width: 360px;
    background: #14141c;
    border-left: 1px solid #2a2a36;
    padding: 18px;
    overflow-y: auto;
    z-index: 21;
    box-sizing: border-box;
  }
  header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 14px;
  }
  h2 {
    margin: 0;
    font-size: 16px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  .close {
    background: none;
    border: 0;
    color: #9aa0b4;
    font-size: 16px;
    cursor: pointer;
  }
  section {
    margin-bottom: 18px;
    padding-bottom: 14px;
    border-bottom: 1px solid #20202a;
  }
  h3 {
    margin: 0 0 8px;
    font-size: 12px;
    color: #9aa0b4;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    color: #c9cde0;
    margin: 6px 0;
    justify-content: space-between;
  }
  .row input[type='checkbox'] {
    order: -1;
    margin-right: 4px;
  }
  .row.indent {
    padding-left: 12px;
    justify-content: flex-start;
  }
  .sub {
    font-size: 11px;
    color: #6b7088;
    margin: 8px 0 4px;
  }
  select,
  input[type='range'] {
    accent-color: #7c3aed;
  }
  code {
    color: #c9cde0;
  }
</style>
