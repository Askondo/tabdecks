# Ableton Link via Carabiner — protocol & install reference

Link is C++ over UDP multicast; an extension cannot speak it. TabDecks reaches a
Link session through a local **native-messaging host** (`tools/link-bridge/bridge.mjs`)
that spawns **Carabiner** (embeds the official Link SDK) and bridges its TCP socket.

## Topology

```
mixer page ──connectNative("com.tabdecks.link")──▶ bridge.mjs ──TCP 127.0.0.1:17000──▶ Carabiner ──UDP──▶ Link peers
```

## Carabiner TCP protocol (pinned v1.2.0)

- Port **17000**, newline-terminated **EDN** lines.
- Client commands: `status` · `bpm {20.0–999.0}` · `beat-at-time {µs} {quantum}` ·
  `time-at-beat {beat} {quantum}` · `phase-at-time {µs} {quantum}` ·
  `request-beat-at-time {beat} {µs} {quantum}` · `force-beat-at-time {beat} {µs} {quantum}` ·
  `enable-start-stop-sync` · `start-playing {µs}` · `stop-playing {µs}` · `version`.
- Status reply: `status { :peers 0 :bpm 120.000000 :start 73743731220 :beat 597.737570 }`
  (`:playing true|false` present when start/stop sync is enabled). `:start` is host time in µs.
- Bridge polls `status\n` at 20 Hz; parses with `parseCarabinerLine` (`tools/link-bridge/protocol.mjs`).

## Native-messaging channel (bridge ⇄ extension)

4-byte LE length prefix + UTF-8 JSON each way (`encodeNativeMessage` / `NativeMessageReader`).

| Direction | Message |
|---|---|
| ext → host | `{type:'enable'}` `{type:'disable'}` `{type:'setTempo', bpm}` `{type:'ping'}` |
| host → ext | `{type:'status', bpm, beat, peers, playing, hostTime}` |
| host → ext | `{type:'bridge', state:'connecting'\|'connected'\|'error'\|'disabled', message?}` |
| host → ext | `{type:'pong'}` |

`hostTime` (= `:start` µs) is informational; phase between status messages is projected
on the extension side by `LinkClockEstimator` (`src/dsp/clock-offset.ts`) against
`AudioContext.currentTime`, median-filtering localhost transit jitter (~1–3 ms).

## Clock mapping (extension side)

- `LinkClockEstimator.update(beat, bpm, ctx.currentTime)` each status.
- `beatAt(t) = bps·t + median(beat − bps·t)`; window resets on tempo change.
- `LinkClient.masterClock()` exposes Link as a `MasterClock` for `SyncEngine`: grid
  `{bpm, anchor:0}`, position `{pos: beat·period, rate:1}` — so the existing PLL math
  (`src/dsp/pll.ts`) drives deck sync to Link unchanged.

## Install (Windows)

```
npm run link:install     # downloads Carabiner_Win_x64.zip → tools/link-bridge/bin/,
                         # writes com.tabdecks.link.json + run-bridge.cmd shim,
                         # adds HKCU\Software\Google\Chrome\NativeMessagingHosts\com.tabdecks.link
npm run link:uninstall   # removes the registry key (binary left in place)
```

- Pinned release: **Carabiner v1.2.0**, asset `Carabiner_Win_x64.zip`
  (`tools/link-bridge/install.mjs` → `CARABINER`). Checksum is printed on first download;
  paste it into `CARABINER.win.sha256` to pin, then re-runs verify against it.
- Host manifest `allowed_origins`: `chrome-extension://bmlmgpadbmhobggnapgppomagnhdlmel/`
  — the ID is fixed by the pinned manifest `key` in `wxt.config.ts`.
- macOS/Linux: install.mjs writes the manifest to the per-user `NativeMessagingHosts`
  dir; fetch the matching Carabiner build into `bin/` manually.

## Invariants

- Bridge **stdout is the native-messaging channel** — diagnostics go to stderr only.
- Bridge exits when stdin closes (extension disconnect) and kills Carabiner with it.
- Link transports **tempo + beat phase only — never audio**. Audio routing is local
  (`src/audio/routing.ts`).
