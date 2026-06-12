<script lang="ts">
  interface Props {
    value: number;
    onchange: (value: number) => void;
  }
  let { value, onchange }: Props = $props();
</script>

<div class="crossfader">
  <span class="side a">A</span>
  <input
    type="range"
    min="0"
    max="1"
    step="0.005"
    {value}
    oninput={(e) => onchange(Number(e.currentTarget.value))}
    ondblclick={() => onchange(0.5)}
    title="Double-click to center"
  />
  <span class="side b">B</span>
</div>

<style>
  .crossfader {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 18px;
    border: 1px solid #2a2a36;
    border-radius: 10px;
    background: #16161e;
  }
  input {
    flex: 1;
    accent-color: #9aa0b4;
  }
  .side {
    font-weight: 700;
    font-size: 14px;
  }
  .side.a {
    color: #4f7cff;
  }
  .side.b {
    color: #f59e0b;
  }
</style>
