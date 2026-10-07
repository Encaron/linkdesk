/**
 * Bridge request envelope contract—E5.7#97.
 *
 * The envelope for plugin IPC requests forwarded by the main process to shell-side services (IpcBridgeHandler):
 * requestId is used to correlate with respond; args are the command's own parameters (narrowed by a shell-side switch).
 * Shared by preload-shell's IpcRelay buffering and IpcBridgeHandler onRequest.
 */

export interface BridgeRequestPayload {
  requestId: string;
  channel: string;
  args: unknown[];
  /**
   * E5.8#46.12: source-window stamp on the envelope—the main process reverse-looks-up the windowId by sender (the pool does not know its own windowId, the #43-4 iron rule),
   * so every pool→shell request carries its source-window identity. The shell routes per-window operations by it (the sourceId family: tab modify/close/focus land in the source window's registry,
   * the main window stays as before)—the same-root normalization for the lost-window-identity class (black dot/panel/dialog). The shell-side switch consumes it as needed when narrowing; ignored if no consumer.
   */
  sourceWindowId?: string;
}
