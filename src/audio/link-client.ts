import { LinkClockEstimator } from '@/dsp/clock-offset';
import type { MasterClock } from './sync';

const HOST = 'com.tabdecks.link';

export type LinkBridgeState = 'disconnected' | 'connecting' | 'connected' | 'error' | 'disabled';

export interface LinkState {
  bridge: LinkBridgeState;
  enabled: boolean;
  bpm: number;
  peers: number;
  playing: boolean;
  message?: string;
}

interface StatusMsg {
  type: 'status';
  bpm: number;
  beat: number;
  peers: number;
  playing: boolean;
  hostTime: number;
}
interface BridgeMsg {
  type: 'bridge';
  state: LinkBridgeState;
  message?: string;
}

/**
 * Talks to the native-messaging Link bridge and exposes a MasterClock the
 * SyncEngine can chase. Beat phase between status messages is projected by the
 * jitter-rejecting LinkClockEstimator using the AudioContext clock.
 */
export class LinkClient {
  state: LinkState = {
    bridge: 'disconnected',
    enabled: false,
    bpm: 0,
    peers: 0,
    playing: false,
  };
  onChange: ((state: LinkState) => void) | null = null;

  private port: chrome.runtime.Port | null = null;
  private readonly estimator = new LinkClockEstimator(9);
  private lastPushedBpm = 0;

  constructor(private readonly ctx: AudioContext) {}

  enable(): void {
    this.state.enabled = true;
    try {
      this.port = chrome.runtime.connectNative(HOST);
      this.port.onMessage.addListener((m) => this.onMessage(m as StatusMsg | BridgeMsg));
      this.port.onDisconnect.addListener(() => {
        const err = chrome.runtime.lastError?.message;
        this.estimator.reset();
        this.update({
          bridge: 'error',
          message: err ?? 'bridge disconnected (run npm run link:install)',
        });
        this.port = null;
      });
      this.port.postMessage({ type: 'enable' });
      this.update({ bridge: 'connecting' });
    } catch (e) {
      this.update({ bridge: 'error', message: String(e) });
    }
  }

  disable(): void {
    this.state.enabled = false;
    this.port?.postMessage({ type: 'disable' });
    this.port?.disconnect();
    this.port = null;
    this.estimator.reset();
    this.update({ bridge: 'disabled', peers: 0 });
  }

  /** Push a tempo to the Link session (TabDecks leading). Debounced by value. */
  setTempo(bpm: number): void {
    if (!this.port || Math.abs(bpm - this.lastPushedBpm) < 0.05) return;
    this.lastPushedBpm = bpm;
    this.port.postMessage({ type: 'setTempo', bpm });
  }

  get connected(): boolean {
    return this.state.bridge === 'connected';
  }

  /** MasterClock for the SyncEngine: Link beat phase mapped into the sample
   *  domain so the existing PLL math applies unchanged (anchor 0, rate 1). */
  masterClock(): MasterClock {
    return {
      grid: () => (this.connected && this.state.bpm > 0 ? { bpm: this.state.bpm, anchor: 0 } : null),
      position: () => {
        if (!this.connected || this.state.bpm <= 0) return null;
        const beat = this.estimator.beatAt(this.ctx.currentTime);
        const period = (60 / this.state.bpm) * this.ctx.sampleRate;
        return { pos: beat * period, rate: 1 };
      },
    };
  }

  private onMessage(m: StatusMsg | BridgeMsg): void {
    if (m.type === 'status') {
      this.estimator.update(m.beat, m.bpm, this.ctx.currentTime);
      this.update({
        bridge: 'connected',
        bpm: m.bpm,
        peers: m.peers,
        playing: m.playing,
        message: undefined,
      });
    } else if (m.type === 'bridge') {
      this.update({ bridge: m.state, message: m.message });
    }
  }

  private update(patch: Partial<LinkState>): void {
    this.state = { ...this.state, ...patch };
    this.onChange?.(this.state);
  }
}
