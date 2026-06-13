# TabDecks – Monetization Strategy

## Distribution Channels
| Channel | Purpose | Notes |
|---------|---------|-------|
| Chrome Web Store | Free tier distribution | No paid transactions via CWS (removed 2020) |
| Gumroad | Pro license sales | Familiar from existing M4L device sales |
| Landing page | SEO + direct conversion | Required before CWS submission |
| GitHub (this repo) | Open-source free tier | Drives trust + community |

## Pricing Tiers

### Free (Chrome Web Store)
- Per-tab gain, pan, basic EQ
- Ableton Link **tempo sync** (clock only)
- Up to 2 active decks

### Pro – €29 one-time (Gumroad)
- Unlimited decks
- Per-tab warp engine (time-stretch)
- Link Audio stream routing to DAW
- Cue/master output assignment
- Priority support

### Device Bundle – €59 (hardware + Pro license)
- Companion hardware device (ESP32 or RPi)
- Streams one audio source via Link Audio to DAW
- Plug-and-play, no config
- ⚠️ Hardware sourcing + assembly cost must be validated before pricing

## Revenue Projections (conservative)
| Scenario | Users (Pro) | Revenue |
|----------|------------|--------|
| Low | 200 | €5,800 |
| Mid | 800 | €23,200 |
| High | 2,500 | €72,500 |

All figures gross, pre-tax, pre-Gumroad fees (~8.5%).

## Gumroad Setup Checklist
- [ ] Create TabDecks Pro product page
- [ ] Set up license key delivery (Gumroad built-in)
- [ ] Add license key validation endpoint in extension (simple hash check or API call)
- [ ] Create device bundle listing once hardware BOM confirmed

## Future Revenue Streams
- Companion Max for Live device (syncs Live session to browser decks) — natural upsell to existing M4L customer base
- Custom warp presets / profiles marketplace
- B2B licensing to DJ schools or live event companies
