# TabDecks – Companion Hardware Device Concept

## Concept
A small standalone device (ESP32 or Raspberry Pi Zero 2W) that:
1. Connects to a USB audio source (e.g. turntable, instrument, phone)
2. Joins the local Ableton Link session on the LAN
3. Streams its audio into the Link Audio network—receivable as an audio track inside Ableton Live

This positions it as: **“one device, one deck”** — a hardware companion to the software extension.

## Why It Matters
- Link Audio is currently only accessible to software running on the same machine or LAN
- A cheap hardware node makes it possible to bring *any audio source* (vinyl, phone, external synth) into the Link Audio ecosystem without routing through a DAW first
- Natural upsell: Pro license ($29) + device ($30) = bundle at $59

## Hardware Options

### Option A: Raspberry Pi Zero 2W
| | |
|---|---|
| Cost (unit) | ~€18–25 |
| Audio I/O | USB audio dongle or I2S HAT |
| Link Audio | Yes (Linux, open-source Link) |
| Pros | Full Linux, easy to extend, community support |
| Cons | Supply chain issues, longer boot time, more complex firmware |

### Option B: ESP32-S3 (preferred for v1)
| | |
|---|---|
| Cost (unit) | ~€5–8 |
| Audio I/O | I2S, PDM, or USB Audio Class |
| Link Audio | Partial — Link SDK has no official ESP32 port; needs custom implementation or open-source port |
| Pros | Cheap, instant boot, small, low power |
| Cons | Link Audio SDK not officially supported on ESP32; would need porting work |

### Option C: MacBook/Windows companion app (software-only "device")
- A lightweight native app that exposes a virtual audio input as a Link Audio source
- No hardware, no supply chain
- Easier to ship, validate demand before hardware
- ✅ **Recommended for v1 — validate concept before committing to hardware**

## Recommended Path
1. **v1 (Week 2):** Software companion app (Mac/Win) acting as a Link Audio node — streams desktop audio or virtual audio device into Live
2. **v2 (Month 2–3):** RPi Zero 2W hardware unit, sold assembled or as a kit
3. **v3 (Month 4+):** Custom PCB with ESP32-S3 + USB-C audio, branded enclosure

## Open Questions
- [ ] Confirm Link Audio SDK licensing for embedded hardware use with Ableton
- [ ] Identify a reliable EU hardware supplier for RPi Zero 2W at scale
- [ ] Determine if custom ESP32 Link Audio port already exists in open source
- [ ] Decide: ship pre-assembled or as a DIY kit (kit reduces cost, fits the maker audience)
- [ ] BOM cost analysis before finalizing bundle pricing

## Link Audio Integration Notes
- The open-source `ofxAbletonLinkAudio` (openFrameworks) and `VoidLinkAudio` projects confirm that Link Audio is technically accessible outside of Live 12.4+
- Use these as reference implementations for the companion app
- Native host bridge (required for Chrome extension) can double as the Link Audio relay daemon
