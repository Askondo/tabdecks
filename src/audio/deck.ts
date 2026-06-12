import { faderGain } from '@/dsp/curves';
import { rampTo } from './ramps';
import type { DeckId } from '@/messaging/protocol';

export type DeckStatus = 'empty' | 'live' | 'disconnected' | 'error';

export interface DeckPublicState {
  status: DeckStatus;
  title: string;
  error?: string;
}

/**
 * Per-deck audio chain:
 *   source → [transport: Phase 5] → trim → [EQ: Phase 3] → fxInput → … → fxOutput → fader → xfade
 * The chain stays connected ("warm") for the lifetime of the engine; only the
 * source node is swapped on attach/detach so a tab closing never tears it down.
 */
export class Deck {
  readonly trim: GainNode;
  readonly fxInput: GainNode;
  readonly fxOutput: GainNode;
  readonly fader: GainNode;
  readonly xfade: GainNode;
  readonly analyser: AnalyserNode;

  state: DeckPublicState = { status: 'empty', title: '' };
  onStateChange: (() => void) | null = null;

  private source: MediaStreamAudioSourceNode | null = null;
  // Hold the stream reference — GC of a captured MediaStream can kill audio.
  private stream: MediaStream | null = null;

  constructor(
    readonly id: DeckId,
    private readonly ctx: AudioContext,
  ) {
    this.trim = ctx.createGain();
    this.fxInput = ctx.createGain();
    this.fxOutput = ctx.createGain();
    this.fader = ctx.createGain();
    this.xfade = ctx.createGain();
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 2048;

    // EQ (Phase 3) splices between trim and fxInput; FX slots (Phase 4)
    // between fxInput and fxOutput.
    this.trim.connect(this.fxInput);
    this.fxInput.connect(this.fxOutput);
    this.fxOutput.connect(this.fader);
    this.fader.connect(this.xfade);
    this.fader.connect(this.analyser); // meter tap, not in the signal path
  }

  attach(stream: MediaStream, title: string): void {
    this.detachSource();
    this.stream = stream;
    this.source = this.ctx.createMediaStreamSource(stream);
    this.source.connect(this.trim);

    const track = stream.getAudioTracks()[0];
    track?.addEventListener('ended', () => {
      // Captured tab closed or capture stopped — keep the chain warm.
      this.detachSource();
      this.setState({ status: 'disconnected', title: this.state.title });
    });

    this.setState({ status: 'live', title });
  }

  detachSource(): void {
    this.source?.disconnect();
    this.source = null;
    this.stream = null;
  }

  setTrim(v: number): void {
    rampTo(this.ctx, this.trim.gain, v);
  }

  /** x ∈ [0,1], quadratic fader law. */
  setFader(x: number): void {
    rampTo(this.ctx, this.fader.gain, faderGain(x));
  }

  setState(state: DeckPublicState): void {
    this.state = state;
    this.onStateChange?.();
  }
}
