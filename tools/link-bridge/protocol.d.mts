// Type declarations for the pure protocol helpers (consumed by vitest).

export function encodeNativeMessage(obj: unknown): Buffer;

export class NativeMessageReader {
  push(chunk: Buffer): unknown[];
}

export interface CarabinerLine {
  type: string;
  data: Record<string, number | boolean | null>;
}
export function parseCarabinerLine(line: string): CarabinerLine | null;

export function splitLines(buffered: string): { lines: string[]; rest: string };

export class Backoff {
  constructor(baseMs?: number, capMs?: number);
  baseMs: number;
  capMs: number;
  next(): number;
  reset(): void;
  get attempts(): number;
}
