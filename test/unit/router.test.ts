import { afterEach, describe, expect, it, vi } from 'vitest';

type RuntimeListener = (
  msg: unknown,
  sender: unknown,
  sendResponse: (response?: unknown) => void,
) => boolean | undefined;

function installFakeChrome() {
  const listeners: RuntimeListener[] = [];
  (globalThis as Record<string, unknown>).chrome = {
    runtime: {
      onMessage: {
        addListener: (fn: RuntimeListener) => listeners.push(fn),
      },
      sendMessage: vi.fn(),
    },
  };
  return listeners;
}

afterEach(() => {
  delete (globalThis as Record<string, unknown>).chrome;
  vi.resetModules();
});

describe('onMessage', () => {
  it('sends a sync handler return value as the response', async () => {
    const listeners = installFakeChrome();
    const { onMessage } = await import('../../src/messaging/router');
    onMessage((msg) => (msg.type === 'pingMixer' ? { pong: true } : undefined));

    const sendResponse = vi.fn();
    const keepOpen = listeners[0]!({ type: 'pingMixer' }, {}, sendResponse);
    expect(sendResponse).toHaveBeenCalledWith({ pong: true });
    expect(keepOpen).toBe(false);
  });

  it('keeps the channel open for async handlers and responds on resolve', async () => {
    const listeners = installFakeChrome();
    const { onMessage } = await import('../../src/messaging/router');
    onMessage(async () => ({ ok: true }));

    const sendResponse = vi.fn();
    const keepOpen = listeners[0]!({ type: 'captureDeck' }, {}, sendResponse);
    expect(keepOpen).toBe(true);
    await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledWith({ ok: true }));
  });

  it('converts async handler rejections into {ok: false, error}', async () => {
    const listeners = installFakeChrome();
    const { onMessage } = await import('../../src/messaging/router');
    onMessage(async () => {
      throw new Error('capture failed');
    });

    const sendResponse = vi.fn();
    listeners[0]!({ type: 'captureDeck' }, {}, sendResponse);
    await vi.waitFor(() =>
      expect(sendResponse).toHaveBeenCalledWith({
        ok: false,
        error: 'Error: capture failed',
      }),
    );
  });

  it('sends no response when the handler returns undefined', async () => {
    const listeners = installFakeChrome();
    const { onMessage } = await import('../../src/messaging/router');
    onMessage(() => undefined);

    const sendResponse = vi.fn();
    const keepOpen = listeners[0]!({ type: 'pingMixer' }, {}, sendResponse);
    expect(sendResponse).not.toHaveBeenCalled();
    expect(keepOpen).toBe(false);
  });
});
