# Web Audio notes — TabDecks conventions and engine quirks

## Context setup

- One `AudioContext({ latencyHint: 'interactive', sampleRate: 48000 })` in the mixer page.
  Tab capture delivers 48 kHz on Windows; matching avoids a resampler in the path.
- Autoplay policy: extension pages can still start suspended. If `ctx.state === 'suspended'`,
  show the resume overlay; call `resume()` on user gesture.

## Param ramps (anti-zipper rules)

Raw `param.value =` writes on audible paths cause zipper noise and clicks. All audible
changes go through `src/audio/ramps.ts`:

- `setTargetAtTime(value, ctx.currentTime, tau)` — exponential approach, never clicks.
- τ guidelines: faders/crossfader ≈ 0.008 s · EQ band gains/kills ≈ 0.015 s ·
  FX wet/dry & bypass ≈ 0.020 s.
- `setTargetAtTime` to exactly 0 never reaches 0 — that's fine for gains (inaudible below
  ~-60 dB ≈ 0.001). Use a small floor when "true zero" matters for logic, not audio.

## Node quirks

- `DynamicsCompressorNode` adds lookahead latency (~6 ms) — acceptable on master only,
  never per-deck.
- `BiquadFilterNode` **Q units differ by type**: for `lowpass`/`highpass` Q is **in dB**
  (Butterworth = -3.0103 dB, NOT 0.7071 — setting 0.7071 creates a resonant peak that
  breaks crossover summing by +7 dB); for `peaking`/`notch`/`bandpass` Q is linear.
  LR4 crossover = two cascaded Butterworth biquads per edge.
- `AnalyserNode` is passthrough when in-line, or can be a dead-end tap — taps don't need
  to reach the destination to run, as long as some path to destination keeps the graph alive.
- `MediaStreamAudioSourceNode`: keep a reference to the MediaStream; GC of the stream can
  kill audio in some Chrome versions.
- `delayTime` ramping produces tape-style pitch warble — intentional for the echo FX.

## AudioWorklet contract (transport worklet)

- Module loaded once at engine init:
  `ctx.audioWorklet.addModule(chrome.runtime.getURL('/transport-worklet.js'))`.
- `process()` **must never throw and must always return `true`** — body wrapped in
  try/catch; on exception, latch to raw passthrough and `port.postMessage({type:'error'})`.
- Buffers are preallocated in the constructor — no allocation in `process()` (GC stalls).
- 128-frame render quantum at 48 kHz ≈ 2.67 ms — the transport's passthrough latency.
- k-rate AudioParams arrive as length-1 arrays when not automated — read `param[0]` per block.
- The worklet script runs in `AudioWorkletGlobalScope`: no `window`, no `chrome`, no DOM.
  Keep DSP logic in `src/dsp/` (pure TS) and import it into the worklet entrypoint.

## Output routing (`src/audio/routing.ts`)

- `AudioContext.setSinkId(deviceId)` redirects the master to a chosen device
  (Chrome 110+; not in all TS lib versions — cast). `''` = default device.
- `navigator.mediaDevices.selectAudioOutput()` shows a native device picker and
  returns one `MediaDeviceInfo` WITHOUT mic permission or `enumerateDevices`
  label-gating — preferred over enumerate. Requires a user gesture. Fall back to
  `enumerateDevices().filter(kind==='audiooutput')` when unavailable.
- **Headphone cue** = single-context dual output: pre-fader taps →
  `MediaStreamAudioDestinationNode` → hidden `<audio>` with `srcObject = dest.stream`
  and its own `setSinkId(headphoneId)`. The element path adds its own output
  latency (tens of ms) — fine for pre-listening, not for re-mixing into master.

## OfflineAudioContext testing

AudioWorklets run inside `OfflineAudioContext` — render tests (vitest browser mode) can
verify EQ kill depth, echo impulse spacing, and transport behavior deterministically.
