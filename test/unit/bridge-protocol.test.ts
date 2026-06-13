import { describe, expect, it } from 'vitest';
import {
  Backoff,
  NativeMessageReader,
  encodeNativeMessage,
  parseCarabinerLine,
  splitLines,
} from '../../tools/link-bridge/protocol.mjs';

describe('native-messaging framing', () => {
  it('encodes a 4-byte LE length prefix + JSON', () => {
    const frame = encodeNativeMessage({ a: 1 });
    const len = frame.readUInt32LE(0);
    expect(len).toBe(frame.length - 4);
    expect(JSON.parse(frame.subarray(4).toString('utf8'))).toEqual({ a: 1 });
  });

  it('reads a single complete message', () => {
    const r = new NativeMessageReader();
    expect(r.push(encodeNativeMessage({ type: 'ping' }))).toEqual([{ type: 'ping' }]);
  });

  it('reassembles a message split across chunks', () => {
    const r = new NativeMessageReader();
    const frame = encodeNativeMessage({ type: 'status', bpm: 128 });
    expect(r.push(frame.subarray(0, 3))).toEqual([]); // partial header
    expect(r.push(frame.subarray(3, 8))).toEqual([]); // rest of header + partial body
    expect(r.push(frame.subarray(8))).toEqual([{ type: 'status', bpm: 128 }]);
  });

  it('splits multiple coalesced messages in one chunk', () => {
    const r = new NativeMessageReader();
    const buf = Buffer.concat([encodeNativeMessage({ n: 1 }), encodeNativeMessage({ n: 2 })]);
    expect(r.push(buf)).toEqual([{ n: 1 }, { n: 2 }]);
  });
});

describe('Carabiner line parsing', () => {
  it('parses a status map', () => {
    const r = parseCarabinerLine('status { :peers 0 :bpm 120.000000 :start 73743731220 :beat 597.737570 }');
    expect(r).toEqual({
      type: 'status',
      data: { peers: 0, bpm: 120, start: 73743731220, beat: 597.73757 },
    });
  });

  it('parses booleans and nil', () => {
    const r = parseCarabinerLine('status { :playing true :bpm 128.0 :linked false :extra nil }');
    expect(r!.data).toEqual({ playing: true, bpm: 128, linked: false, extra: null });
  });

  it('returns null on blank lines', () => {
    expect(parseCarabinerLine('   ')).toBeNull();
  });

  it('handles a typeless / mapless line', () => {
    expect(parseCarabinerLine('unsupported')).toEqual({ type: 'unsupported', data: {} });
  });
});

describe('splitLines', () => {
  it('keeps the trailing partial line as rest', () => {
    const { lines, rest } = splitLines('status {...}\nstatus {...}\npartial');
    expect(lines).toEqual(['status {...}', 'status {...}']);
    expect(rest).toBe('partial');
  });
});

describe('Backoff', () => {
  it('grows exponentially and caps', () => {
    const b = new Backoff(100, 800);
    expect([b.next(), b.next(), b.next(), b.next(), b.next()]).toEqual([100, 200, 400, 800, 800]);
  });

  it('resets to base after a success', () => {
    const b = new Backoff(100, 800);
    b.next();
    b.next();
    b.reset();
    expect(b.attempts).toBe(0);
    expect(b.next()).toBe(100);
  });
});
