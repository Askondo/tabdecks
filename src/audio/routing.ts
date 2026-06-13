import { rampTo } from './ramps';
import type { Deck } from './deck';
import type { DeckId } from '@/messaging/protocol';

// AudioContext.setSinkId and selectAudioOutput aren't in all TS lib versions.
interface SinkContext {
  setSinkId?(id: string): Promise<void>;
}
interface SelectAudioOutput {
  selectAudioOutput?(): Promise<MediaDeviceInfo>;
}

export interface RoutingState {
  masterDeviceLabel: string;
  cueDeviceLabel: string;
  pfl: Record<DeckId, boolean>;
}

/**
 * Local audio routing (NOT Ableton Link — Link carries no audio):
 *  - Master output device via AudioContext.setSinkId.
 *  - Headphone CUE bus: per-deck PRE-FADER taps (from fxOutput, before the
 *    channel fader/crossfader) → MediaStreamAudioDestinationNode → a hidden
 *    <audio> element with its own setSinkId on the headphone device. This is
 *    the standard single-context dual-output trick.
 *
 * Honest caveat: the cue path goes context → MediaStream → <audio>, which adds
 * the element's own output latency (tens of ms). Fine for pre-listening, not
 * for monitoring you intend to mix back into the master.
 */
export class Routing {
  private readonly cueDest: MediaStreamAudioDestinationNode;
  private readonly cueEl: HTMLAudioElement;
  private readonly cueGain: Record<DeckId, GainNode>;

  state: RoutingState = {
    masterDeviceLabel: 'Default',
    cueDeviceLabel: 'None',
    pfl: { A: false, B: false },
  };
  onChange: ((state: RoutingState) => void) | null = null;

  constructor(
    private readonly ctx: AudioContext,
    decks: Record<DeckId, Deck>,
  ) {
    this.cueDest = ctx.createMediaStreamDestination();
    this.cueEl = new Audio();
    this.cueEl.srcObject = this.cueDest.stream;
    this.cueEl.autoplay = true;

    this.cueGain = { A: ctx.createGain(), B: ctx.createGain() };
    for (const id of ['A', 'B'] as DeckId[]) {
      this.cueGain[id].gain.value = 0;
      decks[id].fxOutput.connect(this.cueGain[id]); // pre-fader tap
      this.cueGain[id].connect(this.cueDest);
    }
  }

  /** PFL (pre-fade listen) toggle — routes the deck into the cue bus. */
  setPfl(deck: DeckId, on: boolean): void {
    this.state.pfl[deck] = on;
    rampTo(this.ctx, this.cueGain[deck].gain, on ? 1 : 0);
    this.emit();
  }

  /** Pick the master output device (native picker, no mic permission needed). */
  async pickMasterDevice(): Promise<void> {
    const dev = await this.pick();
    if (!dev) return;
    await (this.ctx as unknown as SinkContext).setSinkId?.(dev.deviceId);
    this.state.masterDeviceLabel = dev.label || 'Selected device';
    this.emit();
  }

  /** Pick the headphone/cue output device. */
  async pickCueDevice(): Promise<void> {
    const dev = await this.pick();
    if (!dev) return;
    await this.cueEl.setSinkId(dev.deviceId);
    await this.cueEl.play().catch(() => {});
    this.state.cueDeviceLabel = dev.label || 'Selected device';
    this.emit();
  }

  /** selectAudioOutput when available; else first/other enumerated output. */
  private async pick(): Promise<MediaDeviceInfo | null> {
    const md = navigator.mediaDevices as MediaDevices & SelectAudioOutput;
    if (md.selectAudioOutput) {
      try {
        return await md.selectAudioOutput();
      } catch {
        return null; // user dismissed
      }
    }
    const outs = (await md.enumerateDevices()).filter((d) => d.kind === 'audiooutput');
    return outs[0] ?? null;
  }

  private emit(): void {
    this.onChange?.({ ...this.state, pfl: { ...this.state.pfl } });
  }
}
