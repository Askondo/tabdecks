# TabDecks – Product Vision

## One-liner
TabDecks is a Chrome extension that turns browser tabs into DJ decks — with per-tab audio warping, gain, EQ, stereo pan, and full Ableton Link / Link Audio sync.

## Problem
- Existing browser audio extensions (Tab DJ, DevilEar, Volume Mixer) offer only gain + pan — no tempo sync, no warping, no DAW integration.
- DJs and producers increasingly use web sources (YouTube, SoundCloud, Bandcamp, web synths) alongside their DAW but have no tool to lock these in tempo.
- Ableton Link Audio now supports multi-host audio streaming, but has zero browser-native support.

## Solution / USP
| Feature | TabDecks | Existing Extensions |
|---------|----------|---------|
| Per-tab gain + pan | ✅ | ✅ |
| Per-tab EQ | ✅ | Partial |
| Tempo warp / time-stretch | ✅ | ❌ |
| Ableton Link tempo sync | ✅ | ❌ |
| Link Audio stream to DAW | ✅ (Pro) | ❌ |
| Cue/master routing | ✅ | Partial |
| Companion hardware device | Roadmap | ❌ |

## Target Users
1. **Live performers / DJs** using web audio sources alongside Ableton Live or Traktor
2. **Producers** who want to audition YouTube/SoundCloud references in sync with their DAW
3. **Live coders / hybrid artists** using web synths (Strudel, Hydra, etc.) alongside Link-enabled apps

## Roadmap (2-week sprint to launch)

### Week 1 – Core
- [ ] Per-tab WebAudio capture + gain/pan/EQ
- [ ] Basic warp engine (playback rate + phase correction)
- [ ] Ableton Link tempo clock via WebSocket bridge (native host app)
- [ ] Chrome extension popup UI (Manifest V3)

### Week 2 – Pro + Launch
- [ ] Link Audio stream routing (Pro tier)
- [ ] Cue/master output routing
- [ ] Gumroad payment + license key activation
- [ ] Chrome Web Store submission (free tier)
- [ ] Landing page live

### Post-launch
- [ ] Companion hardware device (ESP32/Raspberry Pi with Link Audio)
- [ ] Firefox port
- [ ] Standalone Electron app option
