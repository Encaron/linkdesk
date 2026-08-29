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
  /**
   * E5.8#46.12：信封来源窗盖章——主进程按 sender 反查 windowId（池不知自身 windowId，#43-4 铁律），
   * 池→壳每一请求自带来源窗身份。壳按此路由按窗操作（sourceId 族：标签改/关/聚焦落到来源窗注册表，
   * 主窗照旧）——窗口身份丢失类（黑点/面板/弹窗）同根归一化。壳侧 switch 收窄时按需消费，无消费方忽略。
   */
  sourceWindowId?: string;
}
