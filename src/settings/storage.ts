// Persisted user settings — chrome.storage.local, versioned schema.
// SETTINGS ONLY: never audio data, never tab URLs/titles.
import type { DeckId } from '@/messaging/protocol';

export interface DeckSettings {
  trim: number;
  brakeTime: number;
  sliceMs: number;
}

export interface SettingsV1 {
  v: 1;
  master: number;
  decks: Record<DeckId, DeckSettings>;
}

const KEY = 'settings';

export function defaultSettings(): SettingsV1 {
  const deck = (): DeckSettings => ({ trim: 1, brakeTime: 0.8, sliceMs: 125 });
  return { v: 1, master: 1, decks: { A: deck(), B: deck() } };
}

export async function loadSettings(): Promise<SettingsV1> {
  try {
    const stored = (await chrome.storage.local.get(KEY))[KEY] as SettingsV1 | undefined;
    if (stored?.v === 1) return { ...defaultSettings(), ...stored };
  } catch (e) {
    console.warn('[settings] load failed, using defaults', e);
  }
  return defaultSettings();
}

let pending: ReturnType<typeof setTimeout> | null = null;

/** Debounced write — knob drags produce floods of changes. */
export function saveSettings(settings: SettingsV1): void {
  if (pending) clearTimeout(pending);
  pending = setTimeout(() => {
    pending = null;
    chrome.storage.local.set({ [KEY]: settings }).catch((e) => {
      console.warn('[settings] save failed', e);
    });
  }, 400);
}
