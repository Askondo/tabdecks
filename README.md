# TabDecks

DJ mixer for Chrome tab audio. Capture two tabs (one per deck) and mix them in a dedicated
window: per-deck volume, 3-band EQ with kills, crossfader, timeshift transport
(pause / scrub / varispeed / vinyl brake / stutter), and extensible insert FX.

Built with TypeScript, Svelte 5, WXT, and the Web Audio API. All processing is local —
no network access, minimal permissions (`tabCapture`, `activeTab`, `storage`).

## How it works

Click the TabDecks icon on a tab that plays audio and assign it to Deck A or B. The tab's
audio is captured (the tab itself goes silent) and routed through the mixer window — the
mixer is the only output.

Everything the tab has played gets buffered, so each deck is a **timeshift transport**:
pause, scrub backward, varispeed, brake, and stutter over buffered history; after a song has
played through once, the deck offers full track control (seek, cues, loops).

## Honest limitations

- **No seeking forward past "now"** — capture is a live stream; the buffer only contains
  audio that already played, and cannot fill faster than realtime.
- **Pausing a deck does not pause the source tab** — you drift behind live (the buffer
  absorbs it); JUMP TO LIVE snaps back.
- **No file downloads** — the extension never extracts audio files from streaming sites.
- **Ads and rebuffering get recorded** — the buffer contains whatever the tab played.
- **DRM audio (e.g. Spotify web) may capture as silence** — YouTube works.

## Development

```bash
npm install
npm run dev        # WXT dev mode
npm run build      # production build → .output/chrome-mv3
npm run chrome     # launch Chrome with the built extension + test-tone pages
npm run test       # vitest
npm run check      # svelte-check
```

See `CLAUDE.md` for the project map and `docs/architecture.md` for diagrams.
