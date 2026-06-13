// Pure WSOLA time-stretch — no Web Audio types. Plays buffered audio at a
// variable consumption rate while preserving pitch (key-lock). Reads from a
// caller-supplied sample accessor (the transport ring buffer), so it has no
// buffer of its own. Stereo: the similarity offset is computed once on ch0 and
// applied to every channel to keep the stereo image intact.
//
// Standard overlap-add with Hann windows at 50 % overlap (constant-overlap) +
// a ±seek similarity search that aligns each new analysis frame to the natural
// continuation of the last synthesized frame, minimizing phase discontinuity.

export type SampleFn = (channel: number, pos: number) => number;

function hann(n: number): Float32Array {
  const w = new Float32Array(n);
  for (let i = 0; i < n; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1));
  return w;
}

export class Wsola {
  private readonly N: number; // frame size
  private readonly Hs: number; // synthesis hop (= N/2, 50 % overlap)
  private readonly seek: number; // ± similarity search range (samples)
  private readonly win: Float32Array;

  /** Per-channel carry tail (windowed second half of the last frame). */
  private tail: Float32Array[];
  /** ch0 reference: natural continuation we match the next frame's head to. */
  private reference: Float32Array;
  /** FIFO of synthesized output per channel, awaiting consumption. */
  private queue: number[][];
  private analysisPos = 0; // float input position (frame left)
  private primed = false;

  constructor(
    readonly sampleRate: number,
    readonly channels = 2,
  ) {
    // ~21 ms frame at 48 k; ±~5 ms search.
    this.N = Math.max(256, Math.round(0.0213 * sampleRate));
    if (this.N % 2) this.N++;
    this.Hs = this.N / 2;
    this.seek = Math.round(0.005 * sampleRate);
    this.win = hann(this.N);
    this.tail = Array.from({ length: channels }, () => new Float32Array(this.Hs));
    this.reference = new Float32Array(this.Hs);
    this.queue = Array.from({ length: channels }, () => []);
  }

  /** Restart synthesis at an input position (on seek / loop wrap / mode entry). */
  reset(inputPos: number): void {
    this.analysisPos = inputPos;
    this.primed = false;
    for (const t of this.tail) t.fill(0);
    this.reference.fill(0);
    for (const q of this.queue) q.length = 0;
  }

  /** Current input read position (transport mirrors this into readPos). */
  get inputPos(): number {
    return this.analysisPos;
  }

  /** How far past inputPos a hop may read (frame + search) — used by callers
   *  to keep a safe margin below the live edge. */
  get frameReach(): number {
    return this.N + this.seek + this.Hs;
  }

  /**
   * Fill `out[ch][0..n)` with pitch-preserved audio consuming the source at
   * `rate`. `read(ch,pos)` returns an interpolated source sample.
   */
  process(out: Float32Array[], n: number, rate: number, read: SampleFn): void {
    while (this.queue[0]!.length < n) this.synthesizeHop(rate, read);
    for (let ch = 0; ch < this.channels; ch++) {
      const q = this.queue[ch]!;
      const o = out[ch];
      if (!o) continue;
      for (let i = 0; i < n; i++) o[i] = q[i]!;
      q.splice(0, n);
    }
  }

  private synthesizeHop(rate: number, read: SampleFn): void {
    const Ha = this.Hs * rate; // input advance per synthesis hop

    // Similarity search: pick the integer offset whose frame head best matches
    // the reference (skipped on the first, unprimed hop).
    let offset = 0;
    if (this.primed) {
      let best = -Infinity;
      for (let k = -this.seek; k <= this.seek; k++) {
        let dot = 0;
        let energy = 0;
        for (let i = 0; i < this.Hs; i += 2) {
          const s = read(0, this.analysisPos + k + i);
          dot += s * this.reference[i]!;
          energy += s * s;
        }
        const score = dot / Math.sqrt(energy + 1e-9);
        if (score > best) {
          best = score;
          offset = k;
        }
      }
    }

    const left = this.analysisPos + offset;

    // Window the frame, overlap-add the first half with the carry tail, queue
    // those Hs samples, and keep the windowed second half as the new tail.
    for (let ch = 0; ch < this.channels; ch++) {
      const tail = this.tail[ch]!;
      const q = this.queue[ch]!;
      for (let i = 0; i < this.Hs; i++) {
        const s = read(ch, left + i) * this.win[i]!;
        q.push(tail[i]! + s);
      }
      for (let i = 0; i < this.Hs; i++) {
        this.tail[ch]![i] = read(ch, left + this.Hs + i) * this.win[this.Hs + i]!;
      }
    }

    // Reference for the next search = natural continuation (ch0) one synthesis
    // hop past this frame's left edge.
    for (let i = 0; i < this.Hs; i++) this.reference[i] = read(0, left + this.Hs + i);

    this.analysisPos += Ha;
    this.primed = true;
  }
}
