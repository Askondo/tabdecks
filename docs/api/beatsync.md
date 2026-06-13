# Beat grid, sync, quantize, loops — reference

All positions are **absolute samples** on a deck's recorded timeline (same addressing
as the ring buffer / PeakStore). Hard invariant: **the live edge cannot be warped** —
rate changes only apply in timeshift/track mode, so engaging sync/loops on a LIVE deck
first enters timeshift.

## Beat grid (`src/audio/beatgrid.ts`)

- State: `{ bpm: number|null, anchor: number|null, confidence: 0..1, source: 'auto'|'manual' }`.
- `anchor` = absolute sample of a beat. `beatSamples = 60/bpm · sampleRate`.
- Auto: `updateFromDetection(est)` blends BPM (0.8/0.2) when within 4 %, keeps phase
  unless drift > 30 ms; replaces grid on a larger tempo change; confidence < 0.2 decays
  (grid kept). Manual: `setManualBpm`, `tap` (≥2 taps in 3 s), `nudge(ms)`; `clearManual`
  returns to auto. Manual confidence is reported as 1.
- Math: `beatIndexAt(abs)`, `sampleAtBeat(i)`, `nearestBeat(abs)`,
  `nextBoundary(abs, quantumBeats)` (strictly after `abs`).

## Tempo detection (`src/dsp/{onset-detect,tempo-induction}.ts`)

- Onset envelope: 3-band energy flux, one frame per 512 samples (= peak bucket),
  computed in the worklet, posted with the peaks stream.
- Tempo: autocorrelation over a ~12 s envelope window, 70–180 BPM, harmonic weighting,
  comb phase pick. Confidence = peak-strength × peak-dominance.

## Quantize (`src/audio/engine.ts` + worklet action queue)

- Two sample-accurate mechanisms:
  1. **Transport gestures** (stutter/brake/seek/play/pause/trackRestart) →
     `TransportDsp.schedule(at, domain, action)`; fired in `processBlock` with grid-exact
     anchors (loops end exactly at `at`; seeks carry phase). `domain`: `'written'`
     (live/paused → wall clock) or `'readPos'` (playing → playhead).
  2. **Graph ops** (crossfader cut, FX bypass) → `rampAt(ctx, param, v, atTime)` scheduled
     AudioParam moves; `atTime` from `DeckTransport.ctxTimeAtPlayhead(at)`.
- Boundary = `grid.nextBoundary(pos, quantumBeats)`. quantum ∈ {0.25,0.5,1,4} beats.
- Waveform mouse-seek becomes a quantized **beat jump**: target snaps to `nearestBeat`,
  fires on the next boundary with phase carry-over.

## Sync / phase (`src/dsp/pll.ts` + `src/audio/sync.ts`)

- `syncRate`: `rate = (masterBpm·masterRate / deckBpm) · (1 + kP·phaseErrorBeats)`,
  clamped to 1 ± `maxDev` (default 0.08). `kP = 0.5`.
- `SyncEngine.update()` runs once per status tick (~20 Hz, driven by deck A); writes
  `setRate` per engaged slave; disengages (rate→1) when auto-grid confidence < 0.25.
- `alignPhase(deck)` = one-shot: nudges the deck grid so its phase matches master now.
- Master = a deck or `'link'`. `MasterClock` abstraction lets Link drive the same PLL
  (see link_carabiner.md) with no math changes.

## Key-lock / WSOLA (`src/dsp/wsola.ts`)

- Tempo without pitch on the timeshift/track playhead. When `keylock` is on and
  `|rate−1| > 1e-3` and the block is clear of boundaries, `processPlayhead` uses
  `Wsola.process(out, n, rate, read)` instead of the per-sample varispeed read.
- WSOLA: Hann frames (~21 ms), 50 % overlap-add, ±5 ms similarity search aligning each
  frame to the previous frame's natural continuation (correlation on ch0, same offset all
  channels). Output is pitch-1.0; input consumed at `rate`. `readPos` mirrors `wsola.inputPos`.
- Bails to per-sample on the block containing a loop wrap / track end, and stays clear of
  the live edge by `wsola.frameReach` (frame + search). Path switches pass through the
  standard discontinuity fade. Brake stays pitch-coupled (that's the effect); stutter and
  live are unaffected.

## Bar loops (`TransportDsp.setLoop`)

- Grid-aligned absolute `[start, end)`; engine computes them from the current bar downbeat
  × N bars (1/2/4/8). Wrap subtracts the region length (phase-preserving by construction);
  the wrap passes through the standard discontinuity fade. `clearLoop` continues in place;
  `jumpLive` clears the loop (a loop can't follow the live edge).
