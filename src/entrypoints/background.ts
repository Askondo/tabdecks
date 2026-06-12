import { defineBackground } from '#imports';
import type { AckResponse, Message } from '@/messaging/protocol';

// STATELESS RELAY. Chrome may kill this service worker at any moment — nothing
// here may hold deck or audio state. All state lives in the mixer page.

const MIXER_URL = '/mixer.html';

export default defineBackground(() => {
  chrome.runtime.onMessage.addListener((msg: Message, _sender, sendResponse) => {
    if (msg.type === 'assignDeck') {
      relayAssign(msg)
        .then(sendResponse)
        .catch((e) => sendResponse({ ok: false, error: String(e) }));
      return true;
    }
    return false;
  });
});

async function relayAssign(
  msg: Extract<Message, { type: 'assignDeck' }>,
): Promise<AckResponse> {
  await ensureMixerOpen();
  const res = await chrome.runtime.sendMessage({
    type: 'captureDeck',
    deck: msg.deck,
    targetTabId: msg.targetTabId,
    tabTitle: msg.tabTitle,
  } satisfies Message);
  return (res as AckResponse) ?? { ok: false, error: 'Mixer did not respond.' };
}

async function mixerAlive(): Promise<boolean> {
  try {
    const res = await chrome.runtime.sendMessage({ type: 'pingMixer' } satisfies Message);
    return res !== undefined;
  } catch {
    return false; // "Receiving end does not exist" — mixer not open
  }
}

// Deduplicates concurrent opens (e.g. both decks assigned quickly).
let opening: Promise<void> | null = null;

function ensureMixerOpen(): Promise<void> {
  opening ??= (async () => {
    try {
      if (await mixerAlive()) return;
      await chrome.windows.create({
        url: chrome.runtime.getURL(MIXER_URL),
        type: 'popup',
        width: 1080,
        height: 760,
        focused: true,
      });
      const deadline = Date.now() + 8000;
      while (Date.now() < deadline) {
        if (await mixerAlive()) return;
        await new Promise((r) => setTimeout(r, 100));
      }
      throw new Error('Mixer window did not become ready.');
    } finally {
      opening = null;
    }
  })();
  return opening;
}
