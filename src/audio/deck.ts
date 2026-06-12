import { faderGain } from '@/dsp/curves';
import { DeckEq } from './eq';
import { rampTo } from './ramps';
import type { DeckTransport } from './transport';
import type { FxInstance } from './fx/types';
import type { DeckId } from '@/messaging/protocol';

export const FX_SLOTS = 2;

export type DeckStatus = 'empty' | 'live' | 'disconnected' | 'error';

export interface DeckPublicState {
  status: DeckStatus;
  title: string;
  error?: string;
}

/**
 * Per-deck audio chain:
 *   source → transport worklet → trim → EQ → fxInput → … → fxOutput → fader → xfade
 * The chain stays connected ("warm") for the lifetime of the engine; only the
 * source node is swapped on attach/detach so a tab closing never tears it down.
 */
export class Deck {
  readonly trim: GainNode;
  readonly eq: DeckEq;
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

  /** Serial insert FX slots between fxInput and fxOutput. */
  readonly fx: Array<FxInstance | null> = Array.from({ length: FX_SLOTS }, () => null);

  constructor(
    readonly id: DeckId,
    private readonly ctx: AudioContext,
    readonly transport: DeckTransport,
  ) {
    this.trim = ctx.createGain();
    this.eq = new DeckEq(ctx);
    this.fxInput = ctx.createGain();
    this.fxOutput = ctx.createGain();
    this.fader = ctx.createGain();
    this.xfade = ctx.createGain();
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 2048;

    // FX slots splice between fxInput and fxOutput.
    this.transport.node.connect(this.trim);
    this.trim.connect(this.eq.input);
    this.eq.output.connect(this.fxInput);
    this.fxInput.connect(this.fxOutput);
    this.fxOutput.connect(this.fader);
    this.fader.connect(this.xfade);
    this.fader.connect(this.analyser); // meter tap, not in the signal path
  }

  attach(stream: MediaStream, title: string): void {
    this.detachSource();
    this.stream = stream;
    this.source = this.ctx.createMediaStreamSource(stream);
    this.source.connect(this.transport.node);

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

  /**
   * Load (or clear, with null) an FX slot. The chain resplice dips fxInput to
   * silence for ~25 ms around the topology change — inaudible, never a click.
   * The replaced instance is disposed after the dip completes.
   */
  setFx(slot: number, instance: FxInstance | null): void {
    const old = this.fx[slot] ?? null;
    this.fx[slot] = instance;

    rampTo(this.ctx, this.fxInput.gain, 0, 0.004);
    setTimeout(() => {
      this.rebuildFxChain();
      old?.dispose();
      rampTo(this.ctx, this.fxInput.gain, 1, 0.004);
    }, 25);
  }

  private rebuildFxChain(): void {
    this.fxInput.disconnect();
    for (const fx of this.fx) fx?.output.disconnect();

    let node: AudioNode = this.fxInput;
    for (const fx of this.fx) {
      if (!fx) continue;
      node.connect(fx.input);
      node = fx.output;
    }
    node.connect(this.fxOutput);
  }
}
