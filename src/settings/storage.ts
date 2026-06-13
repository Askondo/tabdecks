// Persisted user settings — chrome.storage.local, versioned schema.
// SETTINGS ONLY: never audio data, never tab URLs/titles.
import type { QuantizeActions } from '@/audio/engine';
import type { DeckId } from '@/messaging/protocol';

export interface DeckSettings {
  trim: number;
  brakeTime: number;
  sliceMs: number;
  keylock: boolean;
}

export interface SettingsV2 {
  v: 2;
  master: number;
  decks: Record<DeckId, DeckSettings>;
  quantize: { enabled: boolean; quantumBeats: number; actions: QuantizeActions };
  sync: { maxDev: number };
  link: { autoconnect: boolean };
}

// Prior shape kept for migration only.
interface SettingsV1 {
  v: 1;
  master: number;
  decks: Record<DeckId, { trim: number; brakeTime: number; sliceMs: number }>;
}

const KEY = 'settings';

export function defaultSettings(): SettingsV2 {
  const deck = (): DeckSettings => ({ trim: 1, brakeTime: 0.8, sliceMs: 125, keylock: false });
  return {
    v: 2,
    master: 1,
    decks: { A: deck(), B: deck() },
    quantize: {
      enabled: false,
      quantumBeats: 1,
      actions: { gestures: true, transport: true, fx: true, cuts: true },
    },
    sync: { maxDev: 0.08 },
    link: { autoconnect: false },
  };
}

export function migrate(stored: unknown): SettingsV2 {
  const def = defaultSettings();
  if (!stored || typeof stored !== 'object') return def;
  const s = stored as { v?: number };
  if (s.v === 2) {
    // Deep-merge over defaults so new fields appear on older v2 blobs.
    const v2 = stored as SettingsV2;
    return {
      ...def,
      ...v2,
      decks: {
        A: { ...def.decks.A, ...v2.decks?.A },
        B: { ...def.decks.B, ...v2.decks?.B },
      },
      quantize: { ...def.quantize, ...v2.quantize, actions: { ...def.quantize.actions, ...v2.quantize?.actions } },
      sync: { ...def.sync, ...v2.sync },
      link: { ...def.link, ...v2.link },
    };
  }
  if (s.v === 1) {
    const v1 = stored as SettingsV1;
    return {
      ...def,
      master: v1.master ?? def.master,
      decks: {
        A: { ...def.decks.A, ...v1.decks?.A },
        B: { ...def.decks.B, ...v1.decks?.B },
      },
    };
  }
  return def;
}

export async function loadSettings(): Promise<SettingsV2> {
  try {
    return migrate((await chrome.storage.local.get(KEY))[KEY]);
  } catch (e) {
    console.warn('[settings] load failed, using defaults', e);
    return defaultSettings();
  }
}

let pending: ReturnType<typeof setTimeout> | null = null;

/** Debounced write — knob drags produce floods of changes. */
export function saveSettings(settings: SettingsV2): void {
  if (pending) clearTimeout(pending);
  pending = setTimeout(() => {
    pending = null;
    chrome.storage.local.set({ [KEY]: settings }).catch((e) => {
      console.warn('[settings] save failed', e);
    });
  }, 400);
}
