# TabDecks – Open Questions & Blockers

Track critical decisions and blockers here. Update status as resolved.

## Legal
- [ ] **Contact Ableton** re: Link Audio commercial use license terms
  - Email: developers@ableton.com
  - Question: Is Link Audio SDK usable in a closed-source commercial product? Is GPL license inheritance required for the host bridge app?
- [ ] **GDPR compliance**: Write and host privacy policy before Chrome Web Store submission
- [ ] **German VAT / Kleinunternehmer**: Confirm with Steuerberater whether Kleinunternehmerregelung (§19 UStG) still applies given existing Gumroad revenue

## Technical
- [ ] **WebAudio tab capture scope**: Confirm `chrome.tabCapture` (MV3) grants sufficient access for per-tab audio graph injection without requiring `offscreen` document workaround
- [ ] **Warp engine latency**: Target < 20ms end-to-end for usable live performance. Validate WSOLA vs. phase vocoder approach in browser.
- [ ] **Link clock bridge**: Decide architecture — native messaging host app (best latency) vs. WebSocket to local Link daemon. Native messaging preferred.
- [ ] **Link Audio stream routing**: Confirm if Link Audio requires the Live 12.4+ host to be on the same machine or just the same LAN
- [ ] **Chrome extension + native host signing**: MV3 native messaging requires the host app to be installed separately and signed. Plan the installer flow.

## Business
- [ ] **Landing page domain**: Register tabdecks.io or tabdecks.com (check availability)
- [ ] **Chrome Web Store developer account**: Ensure account is in good standing, $5 one-time fee paid
- [ ] **Demo video**: Record and edit before launch — essential for conversion
- [ ] **Hardware BOM**: Get quotes for RPi Zero 2W + USB audio dongle + enclosure before committing to bundle pricing
- [ ] **Companion Max for Live device**: Scope effort — could be a quick upsell for existing M4L customer base (Link clock display + deck control surface in Live)

## Marketing
- [ ] **CDM outreach**: Draft a 3-sentence pitch email for Create Digital Music
- [ ] **Reddit pre-launch posts**: Draft posts for r/ableton, r/WeAreTheMusicMakers, r/DJs
- [ ] **Product Hunt hunter**: Identify a hunter or self-list

## Decisions Made
| Decision | Choice | Date |
|----------|--------|------|
| Monetization platform | Gumroad | 2026-06-13 |
| Extension store | Chrome Web Store (free tier) | 2026-06-13 |
| Hardware v1 approach | Software companion app first | 2026-06-13 |
| Pricing model | Freemium + one-time Pro | 2026-06-13 |
