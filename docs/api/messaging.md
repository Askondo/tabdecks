# Runtime message protocol

Source of truth: `src/messaging/protocol.ts` — keep this file in sync.

| Message | Direction | Payload | Response |
|---|---|---|---|
| `assignDeck` | popup → SW | `deck: 'A'\|'B'`, `targetTabId: number`, `tabTitle: string` | `AckResponse` |
| `captureDeck` | SW → mixer | same as assignDeck | `AckResponse` |
| `pingMixer` | SW → mixer | — | `{pong: true}`; **rejects** when the mixer page is closed |

`AckResponse = { ok: boolean; error?: string }`

## Conventions

- All messages are a discriminated union on `type` (`Message` in protocol.ts).
- `src/messaging/router.ts` provides `sendMessage` (typed, rejects when no receiver) and
  `onMessage` (handler return value → response; promises supported).
- The SW's mixer-liveness check **relies on `sendMessage` rejecting** when no receiver
  exists — do not swallow rejections in the router.
- Audio/deck state never travels over messages — it lives only in the mixer page.
