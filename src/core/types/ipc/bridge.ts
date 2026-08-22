/**
 * bridge 请求信封契约——E5.7#97。
 *
 * 插件 IPC 请求经主进程转发到壳侧服务（IpcBridgeHandler）的信封：
 * requestId 用于 respond 关联，args 是命令自定参数（shell 侧 switch 收窄）。
 * preload-shell 的 IpcRelay 缓冲 + IpcBridgeHandler onRequest 同用此型。
 */

export interface BridgeRequestPayload {
  requestId: string;
  channel: string;
  args: unknown[];
}
