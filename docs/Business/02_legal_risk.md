# TabDecks – Legal Risk Analysis

## 1. Core Legal Question
**Does TabDecks intercept, re-stream, or redistribute third-party copyrighted audio?**

Short answer: **No — by design it must not.** TabDecks processes audio *locally in the browser* via the Web Audio API. It does not download, store, re-upload, or re-transmit the content to any external server.

---

## 2. Platform ToS Analysis

### YouTube
- YouTube ToS §4 prohibits "access via automated means" and "circumventing technological measures".
- TabDecks does **not** scrape, download, or bypass DRM. It hooks into the browser's audio graph after the platform has already decoded and rendered audio to the user's session.
- Closest precedent: ad blockers and audio equalizers have survived legal challenge because they modify the *local rendering* of content the user has legitimately licensed access to.
- **Risk level: Low** — but avoid any wording in marketing that implies "ripping", "capturing", or "downloading".

### Spotify / Apple Music / Tidal (with Web Player)
- Same reasoning as YouTube: audio is processed post-decode in the user's browser session.
- Do **not** add any feature that exports or saves decoded audio to disk.
- **Risk level: Low** with correct implementation.

### SoundCloud / Bandcamp
- More permissive ecosystems; same local-processing argument applies.
- **Risk level: Very Low**.

---

## 3. Copyright / DMCA
- TabDecks does not make copies of copyrighted content; it modifies playback parameters (tempo, gain, EQ) in real time.
- Analogous to a hardware EQ or DJ mixer — no court has ruled that using a mixer to play licensed music constitutes copyright infringement.
- The **Protecting Lawful Streaming Act (2020)** targets commercial-scale piracy operations, not local audio processing tools.
- **Risk level: Low** with proper safeguards.

---

## 4. Ableton Link / Link Audio SDK
- Ableton Link (tempo sync) is licensed under the **GNU GPL v2.0** — open source, free for commercial use as long as the Link library itself is not modified and source is disclosed if distributed.
- **Link Audio** (audio streaming SDK): confirm license terms directly with Ableton before shipping Pro tier. Contact: developers@ableton.com
- The native host bridge app (required to expose Link to the extension) must be GPL-compatible or kept as a closed-source companion if Link is only linked dynamically.
- ⚠️ **Action required: Reach out to Ableton to confirm Link Audio commercial use terms before Pro launch.**

---

## 5. Chrome Web Store Policies
- Paid extensions are **no longer sold directly** through the Chrome Web Store (removed in 2020). Monetization must happen externally (e.g. Gumroad license key).
- Extensions that modify audio output of web pages are permitted, provided they do not violate platform ToS or engage in deceptive behavior.
- Do not claim affiliation with YouTube, Spotify, Ableton, etc. in store listing.

---

## 6. Required Safeguards (ship before launch)
- [ ] Privacy policy page (GDPR-compliant, hosted)
- [ ] ToS page stating TabDecks does not store, export, or redistribute audio
- [ ] No "download audio" feature — ever
- [ ] No analytics on what content user is playing
- [ ] License key system that does not collect PII beyond email
- [ ] Disclaimer: "TabDecks is an independent product. Not affiliated with Ableton, YouTube, or Spotify."

---

## 7. German Law Specifics (Berlin HQ)
- UrhG §44b (Text & Data Mining) not relevant here.
- TMG / TTDSG: cookie consent required if any tracking on landing page.
- Kleinunternehmerregelung may apply if revenue < €22,000/year (no VAT needed). Verify with Steuerberater.
- GDPR: minimal data collection model is the lowest-risk approach.
