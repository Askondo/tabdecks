import type { Message } from './protocol';

/**
 * Typed chrome.runtime.sendMessage. Rejects if no receiver exists —
 * callers that probe liveness (ping) rely on the rejection.
 */
export function sendMessage<T = unknown>(msg: Message): Promise<T> {
  return chrome.runtime.sendMessage(msg) as Promise<T>;
}

export type MessageHandler = (
  msg: Message,
  sender: chrome.runtime.MessageSender,
) => unknown | Promise<unknown>;

/**
 * Registers a runtime message listener. A handler returning a value (or a
 * promise) sends it as the response; returning undefined sends no response.
 */
export function onMessage(handler: MessageHandler): void {
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    const result = handler(msg as Message, sender);
    if (result instanceof Promise) {
      result
        .then((r) => sendResponse(r))
        .catch((e) => sendResponse({ ok: false, error: String(e) }));
      return true; // keep the channel open for the async response
    }
    if (result !== undefined) sendResponse(result);
    return false;
  });
}
