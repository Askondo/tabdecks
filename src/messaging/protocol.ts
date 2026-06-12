// Extension message protocol — single source of truth for all runtime messages.
// Documented in docs/api/messaging.md; keep both in sync.

export type DeckId = 'A' | 'B';

export type Message =
  /** popup → service worker: user picked a deck for the active tab */
  | { type: 'assignDeck'; deck: DeckId; targetTabId: number; tabTitle: string }
  /** service worker → mixer page: capture this tab onto this deck */
  | { type: 'captureDeck'; deck: DeckId; targetTabId: number; tabTitle: string }
  /** service worker → mixer page: liveness probe (rejects if mixer not open) */
  | { type: 'pingMixer' };

export interface AckResponse {
  ok: boolean;
  error?: string;
}
