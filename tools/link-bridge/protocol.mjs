// Pure protocol helpers shared by the bridge and its tests. No Node-only APIs
// beyond Buffer (available in both the bridge and vitest's node environment).

// ── Chrome native-messaging framing ────────────────────────────────────────
// Each message: 4-byte little-endian uint32 length prefix + UTF-8 JSON body.

/** Encode an object as a length-prefixed native-messaging frame. */
export function encodeNativeMessage(obj) {
  const json = Buffer.from(JSON.stringify(obj), 'utf8');
  const header = Buffer.alloc(4);
  header.writeUInt32LE(json.length, 0);
  return Buffer.concat([header, json]);
}

/**
 * Incremental reader: push chunks, pull complete messages. Chrome may split or
 * coalesce frames arbitrarily on the pipe, so framing must be length-driven.
 */
export class NativeMessageReader {
  #buf = Buffer.alloc(0);

  push(chunk) {
    this.#buf = this.#buf.length ? Buffer.concat([this.#buf, chunk]) : chunk;
    const out = [];
    for (;;) {
      if (this.#buf.length < 4) break;
      const len = this.#buf.readUInt32LE(0);
      if (this.#buf.length < 4 + len) break;
      const body = this.#buf.subarray(4, 4 + len);
      out.push(JSON.parse(body.toString('utf8')));
      this.#buf = this.#buf.subarray(4 + len);
    }
    return out;
  }
}

// ── Carabiner EDN status parsing ────────────────────────────────────────────
// Carabiner replies with newline-terminated lines: "<type> { :k v :k v ... }".
// Values are integers, floats, true/false, or nil. Just enough EDN for that.

/**
 * Parse one Carabiner line. Returns { type, data } or null for blank lines.
 * e.g. "status { :peers 0 :bpm 120.000000 :start 73743731220 :beat 597.74 }"
 */
export function parseCarabinerLine(line) {
  const trimmed = line.trim();
  if (!trimmed) return null;
  const brace = trimmed.indexOf('{');
  const type = (brace === -1 ? trimmed : trimmed.slice(0, brace)).trim();
  const data = {};
  if (brace !== -1) {
    const body = trimmed.slice(brace + 1, trimmed.lastIndexOf('}'));
    const re = /:([a-zA-Z][\w-]*)\s+(true|false|nil|-?\d+\.?\d*)/g;
    let m;
    while ((m = re.exec(body)) !== null) {
      const key = m[1];
      const raw = m[2];
      data[key] =
        raw === 'true' ? true : raw === 'false' ? false : raw === 'nil' ? null : Number(raw);
    }
  }
  return { type, data };
}

/** Split a TCP buffer into complete lines; returns { lines, rest }. */
export function splitLines(buffered) {
  const lines = buffered.split('\n');
  const rest = lines.pop() ?? '';
  return { lines, rest };
}

// ── Reconnect backoff ───────────────────────────────────────────────────────

/** Exponential backoff with cap; reset() on a successful connect. */
export class Backoff {
  #attempt = 0;
  constructor(baseMs = 250, capMs = 5000) {
    this.baseMs = baseMs;
    this.capMs = capMs;
  }
  next() {
    const delay = Math.min(this.capMs, this.baseMs * 2 ** this.#attempt);
    this.#attempt++;
    return delay;
  }
  reset() {
    this.#attempt = 0;
  }
  get attempts() {
    return this.#attempt;
  }
}
