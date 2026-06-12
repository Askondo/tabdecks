/** Reads peak + RMS from an AnalyserNode time-domain snapshot.
 *  Polled from the UI via requestAnimationFrame — a stalled UI affects
 *  pixels, never audio. */
export interface Level {
  peak: number;
  rms: number;
}

export function readLevel(analyser: AnalyserNode, scratch: Float32Array): Level {
  analyser.getFloatTimeDomainData(scratch as Float32Array<ArrayBuffer>);
  let peak = 0;
  let sum = 0;
  for (let i = 0; i < scratch.length; i++) {
    const v = Math.abs(scratch[i]!);
    if (v > peak) peak = v;
    sum += v * v;
  }
  return { peak, rms: Math.sqrt(sum / scratch.length) };
}
