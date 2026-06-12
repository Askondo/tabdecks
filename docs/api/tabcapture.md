# chrome.tabCapture — verified behavior

Verified against the official docs (June 2026):
https://developer.chrome.com/docs/extensions/reference/api/tabCapture

## getMediaStreamId

- `chrome.tabCapture.getMediaStreamId({ targetTabId })` → opaque streamId string.
- **Requires user invocation on the target tab** — clicking the action (popup) grants
  activeTab-style access for that tab; the grant persists until the tab navigates.
- The streamId is **single-use** and **expires within seconds** if not consumed.
  Always acquire + consume back-to-back in the same task (`src/audio/capture.ts`).
- If `consumerTabId` is unspecified, only extension contexts can consume the id.
  Since Chrome 116 a streamId works across extension documents in the same profile/origin.
- Callable from any extension context, including extension pages — the mixer page calls it
  directly so the SW never touches streamIds.

## Consumption

```js
navigator.mediaDevices.getUserMedia({
  audio: { mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: streamId } },
  video: false,
});
```

The `mandatory` shape is Chrome-specific and not in the standard TS lib types (cast needed).

## Behavior facts

- Capturing a tab **mutes its local playback** — audio only plays where the stream is routed
  into an AudioContext destination. For TabDecks this is desired: the mixer is the sole output.
- **No documented limit** on simultaneous captures of *different* tabs; one capture per tab.
- Capture **ends permanently when the captured tab closes** (`track.onended` fires);
  a fresh user invocation is required to recapture.
- A second capture of an already-captured tab fails — surface the error in the deck UI.
- DRM/EME audio (e.g. Spotify web player) may capture as silence — empirically untested;
  YouTube works. See docs/testing.md.

## Permissions model

`"tabCapture"` + `"activeTab"` in the manifest. No `tabs`, no host_permissions —
`chrome.tabs.query({active: true, currentWindow: true})` works without `tabs`; url/title of
the active tab are visible because the popup click grants activeTab.
