# TabDecks

Chrome MV3 extension — DJ mixer for tab audio. Capture two Chrome tabs (one per deck), mix in a dedicated window: volume, 3-band EQ with kills, crossfader, timeshift transport (pause/scrub/varispeed, brake, stutter), extensible insert FX. TypeScript, Svelte 5, WXT, Web Audio.

## Project Map

```
wxt.config.ts                 Manifest (permissions, CSP) + WXT build config
src/entrypoints/
  background.ts               Service worker — STATELESS relay, mixer window lifecycle
  popup/                      Action popup: "Capture to Deck A/B"
  mixer/                      The DJ window — owns the AudioContext and ALL audio state
  transport-worklet.ts        AudioWorklet processor (unlisted script → worklets bundle)
src/audio/
  capture.ts                  getMediaStreamId + getUserMedia (mixer page only)
  engine.ts                   AudioEngine: graph owner, guarded command API
  deck.ts                     Per-deck chain: source → transport → trim → EQ → FX → fader
  transport.ts                Main-thread side of the transport worklet
  eq.ts / crossfader.ts / master.ts / meters.ts
  ramps.ts                    setTargetAtTime helpers — ALL audible param changes
  fx/                         FX plugin framework (types, registry, wrapper, echo, …)
src/dsp/                      PURE TS, no Web Audio types — unit-testable DSP
src/messaging/                Typed runtime message protocol + router
src/lib/components/           Svelte UI components
src/lib/stores/               Svelte 5 runes bridges to engine events
src/settings/storage.ts       chrome.storage.local — settings only, versioned schema
tools/launch_chrome.ts        Dev launcher (config: tools/dev.local.cfg, gitignored)
tools/testpage/tone.html      Test tone + click track for latency measurement
docs/architecture.md          Authoritative context/flow diagrams — keep current
docs/api/                     Local API references (see below)
docs/testing.md               Manual QA checklist (capture can't be automated)
```

## Architecture Reference

`docs/architecture.md` — extension context diagram, capture-handshake sequence, audio-graph diagram, message protocol table. **Update it when** adding/removing an entrypoint, adding a message type, or changing the audio graph topology.

## Commands

```bash
npm run dev          # WXT dev mode with HMR
npm run build        # production build → .output/chrome-mv3
npm run chrome       # launch Chrome with built extension + test-tone pages
npm run check        # svelte-check + TypeScript
npm run test         # vitest (unit + dsp)
npm run zip          # package for distribution
```

Machine paths in `tools/dev.local.cfg` (gitignored — copy from `.example`).

## API Reference

**Always read local docs before writing API calls — never guess.**

- `docs/api/tabcapture.md` — verified chrome.tabCapture behavior (streamId lifetime, muting, activeTab grants)
- `docs/api/webaudio_notes.md` — node quirks, AudioWorklet contract, param-ramp rules
- `docs/api/messaging.md` — runtime message protocol (mirror of `src/messaging/protocol.ts`)

## Key Rules

- **The mixer page owns all audio.** MediaStreams cannot cross documents — never move capture or graph code into the SW/popup, never add an offscreen document.
- **The service worker is stateless.** Chrome kills it at will; it may only relay messages and open the mixer window.
- **streamId is single-use and expires in seconds** — acquire and consume back-to-back in the same task (`src/audio/capture.ts` is the only place this happens).
- **All audible param changes go through `ramps.ts`** — raw `.value` writes cause zipper noise/clicks.
- **Worklet `process()` must never throw and always return `true`** — wrap the body in try/catch, latch to passthrough on error.
- **`src/dsp/` stays pure TS** — no Web Audio / DOM / chrome types, so vitest can run it in node.
- **Permissions stay `tabCapture, activeTab, storage`** — never add `tabs`, `scripting`, `offscreen`, or host_permissions.
- **UI errors must never reach the graph** — engine methods are guarded; panels sit inside `<svelte:boundary>`.
- Svelte 5 runes (`$state`/`$derived`/`$effect`) — no legacy stores in new code.

## Message Protocol

`src/messaging/protocol.ts` is the single source of truth (discriminated union). Flow: popup `assignDeck` → SW → ensure mixer open (ping-poll) → SW `captureDeck` → mixer captures. Update `docs/api/messaging.md` together with the protocol.

## Commit Convention

`type(scope): subject — detail` · types: feat fix docs refactor chore test style perf · scopes: capture, engine, transport, eq, fx, ui, mixer, popup, repo, tools, docs
