/**
 * linkdesk-api 数据域——自 linkdesk-api.ts 拆出（E5.8#0d.10-9c）。
 * serial/clipboard/p2p/events/pluginState 五命名空间面 verbatim。
 * 依赖方向：data → types/ipc/serial；被聚合器交叉组装。
 */

import type { OpenPortConfig, SerialStatus, SerialStats, SerialPortInfo } from "../../types/ipc/serial";

/** 串口/剪贴板/插件间通信/事件/持久化存储命名空间面——对标 VS Code SerialPort API + p2p + EventEmitter + state */
export interface DataAPI {
  /** 串口——读/写/监听，对标 VS Code SerialPort API */
  serial: {
    listPorts(): Promise<SerialPortInfo[]>;
    getStatus(): Promise<SerialStatus>;
    openPort(cfg: OpenPortConfig): Promise<void>;
    closePort(): Promise<void>;
    sendData(data: number[]): Promise<void>;
    sendText(text: string, enc: string): Promise<void>;
    setDtr(enable: boolean): Promise<void>;
    setRts(enable: boolean): Promise<void>;
    onData(cb: (text: string) => void): () => void;
    onStats(cb: (stats: SerialStats) => void): () => void;
    onSystem(cb: (message: string) => void): () => void;
  };

  /** 剪贴板——读/写系统剪贴板 */
  clipboard: {
    readText(): Promise<string>;
    writeText(text: string): Promise<void>;
    /** 写入文件列表——文件树复制粘贴用 */
    writeFileList(paths: string[]): Promise<void>;
  };

  /** E5#65：p2p 插件间定向推流——和 bridge.broadcast 同模式（fire-and-forget） */
  p2p: {
    send(target: string, channel: string, data: unknown): void;
    on(channel: string, cb: (data: unknown) => void): () => void;
  };

  /** 通用事件订阅 + 发布——插件间数据管道。channel 为自由字符串，载荷按通道分型——订阅方收窄 */
  events: {
    /** E5.7#98：on 泛型化——载荷类型按订阅方 cb 推断（event-system EventSystemApi 同款，#97 已泛型化 impl），通道契约类型（ConfigurationChangedPayload 等）可直传 */
    on<T = unknown>(channel: string, cb: (payload: T) => void): () => void;
    emit(channel: string, payload: unknown): void;
    heartbeat?(): void;
    notifyTheme?(isDark: boolean): void;
  };

  /** E5#71：插件持久化存储——集中缓存 + 文件持久化 */
  pluginState: {
    /** 读取持久化状态——运行时动态值，默认 unknown；调用方显式 get<string>(...) 窄化或自行收窄 */
    get<T = unknown>(pluginId: string, key: string): Promise<T | undefined>;
    set(pluginId: string, key: string, value: unknown): Promise<void>;
    /** 订阅持久化状态变更——按 pluginId+key 精确匹配（通配键名订阅走 events.on("plugin-state:changed")，见 E5.8#20 补导出 PluginStateChangedPayload）。返回 unsubscribe */
    onChange(pluginId: string, key: string, cb: (value: unknown) => void): () => void;
  };
}
