/**
 * Tab-audio capture. MUST run in the mixer page (the document that owns the
 * AudioContext) — MediaStreams cannot cross documents.
 *
 * The streamId from getMediaStreamId is single-use and expires within seconds,
 * so it is acquired and consumed back-to-back in the same task, with one retry.
 */
export async function captureTabAudio(targetTabId: number): Promise<MediaStream> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId });
    try {
      return await navigator.mediaDevices.getUserMedia({
        audio: {
          mandatory: {
            chromeMediaSource: 'tab',
            chromeMediaSourceId: streamId,
          },
          // Chrome-specific constraint shape — not in the standard TS lib types.
        } as MediaTrackConstraints,
        video: false,
      });
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error(`Tab capture failed: ${String(lastError)}`);
}
