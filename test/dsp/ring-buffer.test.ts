import { describe, expect, it } from 'vitest';
import { RingBuffer } from '../../src/dsp/ring-buffer';

function fill(rb: RingBuffer, values: number[]): void {
  rb.write(Float32Array.from(values));
}

describe('RingBuffer', () => {
  it('reads back written samples at absolute positions', () => {
    const rb = new RingBuffer(8);
    fill(rb, [1, 2, 3]);
    expect(rb.sampleAt(0)).toBe(1);
    expect(rb.sampleAt(2)).toBe(3);
    expect(rb.written).toBe(3);
  });

  it('wraps and forgets the oldest samples', () => {
    const rb = new RingBuffer(4);
    fill(rb, [1, 2, 3, 4, 5, 6]); // capacity 4 → only 3..6 retained
    expect(rb.oldest).toBe(2);
    expect(rb.sampleAt(1)).toBe(0); // evicted
    expect(rb.sampleAt(2)).toBe(3);
    expect(rb.sampleAt(5)).toBe(6);
  });

  it('returns 0 outside the valid window', () => {
    const rb = new RingBuffer(4);
    fill(rb, [1, 2]);
    expect(rb.sampleAt(-1)).toBe(0);
    expect(rb.sampleAt(2)).toBe(0); // not yet written
  });

  it('interpolates fractional reads', () => {
    const rb = new RingBuffer(8);
    fill(rb, [0, 10]);
    expect(rb.readAt(0.5)).toBeCloseTo(5, 10);
    expect(rb.readAt(0.25)).toBeCloseTo(2.5, 10);
  });

  it('keeps absolute addressing across many wraps', () => {
    const rb = new RingBuffer(128);
    for (let block = 0; block < 100; block++) {
      const data = Float32Array.from({ length: 64 }, (_, i) => block * 64 + i);
      rb.write(data);
    }
    // Last 128 samples are positions 6272..6399 with value == position.
    expect(rb.sampleAt(6399)).toBe(6399);
    expect(rb.sampleAt(6272)).toBe(6272);
    expect(rb.sampleAt(6271)).toBe(0); // evicted
  });
});
