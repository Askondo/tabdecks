// Pure TS — runs in node tests and the AudioWorklet alike.

/**
 * Float32 ring buffer addressed by ABSOLUTE sample position (total samples
 * ever written). Absolute addressing makes playhead math wrap-free: the
 * transport just stores fractional absolute positions.
 */
export class RingBuffer {
  private readonly data: Float32Array;
  private writeCount = 0;

  constructor(readonly capacity: number) {
    this.data = new Float32Array(capacity);
  }

  /** Total samples ever written == absolute position of the live edge. */
  get written(): number {
    return this.writeCount;
  }

  /** Oldest absolute position still held. */
  get oldest(): number {
    return Math.max(0, this.writeCount - this.capacity);
  }

  write(samples: Float32Array, length = samples.length): void {
    for (let i = 0; i < length; i++) {
      this.data[this.writeCount % this.capacity] = samples[i]!;
      this.writeCount++;
    }
  }

  /** Integer-position read; 0 outside the valid window. */
  sampleAt(pos: number): number {
    if (pos < this.oldest || pos >= this.writeCount) return 0;
    return this.data[pos % this.capacity]!;
  }

  /** Linear-interpolated read at a fractional absolute position. */
  readAt(pos: number): number {
    const i0 = Math.floor(pos);
    const frac = pos - i0;
    if (frac === 0) return this.sampleAt(i0);
    return this.sampleAt(i0) * (1 - frac) + this.sampleAt(i0 + 1) * frac;
  }
}
