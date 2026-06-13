# Manual test checklist

Tab capture requires a real user invocation — it cannot be automated. Run these after any
change to capture, engine topology, or the transport.

## Setup

```bash
npm run build && npm run chrome
```

Opens Chrome (dedicated profile) with the extension loaded and two test-tone pages
(440 Hz / 660 Hz). Start the tone on each page.

> Requires **Chrome for Testing** as CHROME_PATH (see dev.local.cfg.example) — branded
> Chrome stable ignores `--load-extension` since v137; the launcher warns if misconfigured.

## 1. Capture

- [ ] Click the TabDecks action on tone tab 1 → Capture to Deck A → mixer window opens, Deck A shows LIVE.
- [ ] Same for tone tab 2 → Deck B. **Both tones audible simultaneously through the mixer.**
- [ ] Captured tabs are locally muted (mute the mixer window from its tab strip → silence).
- [ ] Re-assign Deck A to another tab → old capture replaced cleanly, no doubled audio.

## 2. Latency

- [ ] tone.html flashes white on each click-tick. Film screen + speaker at 240 fps slow-mo;
      count frames between flash and audible tick. Target **< 40 ms** end-to-end.
- [ ] Cross-check `ctx.baseLatency + ctx.outputLatency` in the debug panel (Phase 7).

## 3. Stability drills

- [ ] Kill the service worker (`chrome://serviceworker-internals`) mid-mix → audio unaffected;
      next popup assign still works (SW restarts stateless).
- [ ] Close a captured tab → that deck shows "Disconnected", other deck unaffected.
- [ ] Minimize / background the mixer window 10 min → no glitches.
- [ ] Dev "throw in UI" button (Phase 7) → boundary fallback shown, audio uninterrupted.
- [ ] 30-min soak: both decks live, FX active, stutter held intermittently; watch Chrome's
      Task Manager for CPU/memory creep.

## 3b. Tempo / sync / Link / routing (v2)

- [ ] BPM detect on a 4/4 techno YouTube tab → within ±0.5 of the track's known BPM; beat LED on the downbeat.
- [ ] Quantize ON, 1-beat: hold STUTTER off-grid → it engages on the next beat; waveform playhead turns purple while armed.
- [ ] Waveform click with quantize ON → jumps in phase on the next boundary.
- [ ] LOOP 4 → 4-bar region wraps seamlessly, stays on grid; clear → continues in place.
- [ ] SYNC deck B to A → audible beatmatch lock; SYNC button glows "locked"; PHASE one-shot snaps alignment.
- [ ] Ableton Link: `npm run link:install`, reload extension, enable LINK → peers/BPM show; open Ableton Live (or LinkHut) on the same machine → tempo follows both directions; "USE AS MASTER" slaves both decks to Live's grid; quantized launch lands on Live's bar.
- [ ] Routing: OUT → speakers, CUE → headphones; PFL (🎧) deck B → B audible only in headphones (pre-fader, independent of crossfader).

## 4. Musical QA (real content)

- [ ] YouTube tab captures and plays (confirmed working).
- [ ] **Spotify web player: unverified** — EME/Widevine audio may capture as silence. Test and
      record the result here.
- [ ] EQ low-kill on a bass-heavy track: full kill, no bleed.
- [ ] Crossfader sweep: no center dip.
- [ ] Brake on a vocal: convincing pitch-drop to stop; release returns to live cleanly.
- [ ] Stutter at 125 ms on a beat: clean seams, no clicks.
- [ ] Timeshift: pause 30 s, scrub back, varispeed ±8% — then JUMP TO LIVE.
