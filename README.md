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

## Install in Chrome

TabDecks isn't on the Chrome Web Store yet — install it as an unpacked extension:

1. Build the extension:
   ```bash
   npm install
   npm run build      # → .output/chrome-mv3
   ```
2. Open `chrome://extensions` in Chrome.
3. Enable **Developer mode** (toggle in the top-right corner).
4. Click **Load unpacked** and select the `.output/chrome-mv3` folder.
5. Pin the TabDecks icon from the extensions toolbar menu for quick access.

After making changes, run `npm run build` again and click the reload icon on the
TabDecks card in `chrome://extensions`.

## Ableton Link sync (optional)

TabDecks can lock both decks' tempo and phase to an [Ableton Link](https://www.ableton.com/en/link/)
session (Ableton Live, other Link-enabled apps, or other TabDecks instances) via a small local
native-messaging bridge ([Carabiner](https://github.com/Deep-Symmetry/carabiner)). Link is not
required for normal use — it's an additive sync source alongside TabDecks' own deck-to-deck sync.

**Setup (one-time, after installing the extension above):**

```bash
npm run link:install
```

This downloads the pinned Carabiner release into `tools/link-bridge/bin/`, writes a native-messaging
host manifest (`com.tabdecks.link`), and registers it with Chrome (Windows: `HKCU` registry key;
macOS/Linux: `NativeMessagingHosts` directory). The manifest is scoped to TabDecks' extension ID,
which is fixed by the pinned `key` in [wxt.config.ts](wxt.config.ts) — this only works against the
build produced by `npm run build` / `npm run chrome`, not arbitrary dev builds with a different ID.

**Using it:**

1. Reload the TabDecks extension (`chrome://extensions` → reload).
2. Open the mixer window and click **LINK** in the routing panel.
3. The status dot turns green and shows peer count + BPM once connected to a Link session.
4. Optionally click **USE AS MASTER** to slave both decks' tempo/phase to the Link session clock.

If the bridge can't connect, the panel shows an error and a hint to re-run `npm run link:install`.

**Uninstall:**

```bash
npm run link:uninstall
```

Removes the registry key / manifest file. The downloaded Carabiner binary is left in
`tools/link-bridge/bin/` — delete it by hand if you want it gone too.

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
