<script lang="ts">
  import { readLevel } from '@/audio/meters';

  interface Props {
    analyser: AnalyserNode;
    horizontal?: boolean;
  }
  let { analyser, horizontal = false }: Props = $props();

  let fill = $state(0);
  let peakHold = $state(0);

  $effect(() => {
    const scratch = new Float32Array(analyser.fftSize);
    let raf = 0;
    let hold = 0;
    const tick = () => {
      const { rms, peak } = readLevel(analyser, scratch);
      // Slight ballistics: fast attack, slow release.
      const target = Math.min(1, rms * 2.5);
      fill = target > fill ? target : fill * 0.92;
      if (peak >= hold) {
        hold = peak;
        peakHold = Math.min(1, peak);
      } else {
        hold *= 0.985;
        peakHold = Math.min(1, hold);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  });
</script>

<div class="meter" class:horizontal>
  <div
    class="fill"
    class:hot={peakHold > 0.95}
    style={horizontal ? `width:${fill * 100}%` : `height:${fill * 100}%`}
  ></div>
  <div class="peak" style={horizontal ? `left:${peakHold * 100}%` : `bottom:${peakHold * 100}%`}></div>
</div>

<style>
  .meter {
    position: relative;
    width: 8px;
    height: 120px;
    background: #0c0c11;
    border: 1px solid #23232e;
    border-radius: 3px;
    overflow: hidden;
  }
  .meter.horizontal {
    width: 100%;
    height: 8px;
  }
  .fill {
    position: absolute;
    bottom: 0;
    left: 0;
    width: 100%;
    background: linear-gradient(to top, #16a34a, #facc15 80%, #ef4444);
    transition: none;
  }
  .horizontal .fill {
    height: 100%;
    background: linear-gradient(to right, #16a34a, #facc15 80%, #ef4444);
  }
  .peak {
    position: absolute;
    left: 0;
    width: 100%;
    height: 2px;
    background: #e8e8ee;
  }
  .horizontal .peak {
    top: 0;
    height: 100%;
    width: 2px;
  }
  .fill.hot {
    filter: brightness(1.3);
  }
</style>
