/**
 * 🔥 linkdesk API 命名空间——类型安全的插件 API 入口
 *
 * E3j #74：对标 VS Code `vscode` 命名空间。插件通过此模块获得：
 *   - 完整的 TypeScript 类型提示（IDE 自动补全、参数校验）
 *   - 零 IPC 知识——不需要知道 channel 名、action 格式、参数结构
 *   - 所有方法内部走 ipcRenderer.invoke()——自动经过 #72 的 IPC 消息队列
 *
 * 使用方式：
 *   import { linkdesk } from "@src/core/api/linkdesk-api";
 *   const themes = await linkdesk.theme.getAvailable();
 *   await linkdesk.commands.executeCommand("myCommand", arg1, arg2);
 *
 * 运行时实现：window.linkdesk（由 preload-pool.ts / preload-shell.ts 通过 contextBridge 注入）。
 * 本文件是纯类型层——不包含运行时逻辑，只是给 window.linkdesk 加类型。
 */

// ── 类型定义 ──

export interface LinkDeskCommand {
  id: string;
  title: string;
  category?: string;
}

export interface LinkDeskTheme {
  name: string;
  type: "dark" | "light";
  pluginId?: string;
}

export interface LinkDeskLanguage {
  id: string;
  label: string;
  pluginId: string;
}

/** 配置 schema 中的单个属性定义 */
export interface LinkDeskConfigSchema {
  [key: string]: {
    type: string;
    default?: any;
    description?: string;
    enum?: string[];
    enumDescriptions?: string[];
  };
}

/** 文件选择器选项——与主进程 dialog-handlers.ts IPC.dialog.open 对齐（E5.7#73） */
export interface DialogOpenOptions {
  title?: string;
  /** true = 选目录，默认选文件 */
  directory?: boolean;
  filters?: { name: string; extensions: string[] }[];
}

/**
 * linkdesk API——插件代码的类型安全入口。
 * 对标 VS Code `vscode` 对象的全局命名空间结构。
 */
export interface LinkDeskAPI {
  /** 命令——对标 VS Code vscode.commands */
  commands: {
    /** @deprecated E3j #75——向后兼容别名，新代码用 executeCommand */
    execute<T = void>(commandId: string, ...args: any[]): Promise<T>;
    /** 执行壳侧命令 */
    executeCommand<T = void>(commandId: string, ...args: any[]): Promise<T>;
    /**
     * 注册池内命令——handler 只存在于池渲染进程（视图 mount 时注册）。
     * meta 同步到壳注册表：title 显示名（命令面板/右键菜单，重注册即动态更新——
     * toggle 命令标题随状态翻转）、category 命令面板分组、when context key 过滤
     * （传 "false" = 纯程序化命令，不进命令面板，仅供插件 API 调用）。
     * plugin.json contributes.commands 未声明的命令经 meta 注册后同样可见/可执行。
     * 真相源分工：壳 CommandRegistry = 显示真相源（title/category/when 唯一权威），
     * 池 = 执行真相源（handler 唯一权威，永不跨进程）——meta 只同步显示面。
     */
    registerCommand(
      commandId: string,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- 命令 handler 入参类型由插件调用方决定，对标 VS Code registerCommand 的 (...args: any[]) => any
      handler: (...args: any[]) => Promise<unknown> | unknown,
      meta?: { title?: string; category?: string; when?: string },
    ): void;
    /** 注销插件的池内命令（约定：命令 ID 格式为 "pluginId.commandName"）——随视图 unmount 调用 */
    unregisterCommands(pluginId: string): void;
    /** 获取所有已注册命令列表 */
    getCommands(): Promise<LinkDeskCommand[]>;
  };

  /** 配置—新名——对标 VS Code vscode.workspace.getConfiguration */
  configuration: {
    /** 读取配置值 */
    get<T = any>(key: string): Promise<T>;
    /** 写入配置值 */
    set(key: string, value: any): Promise<void>;
    /** 获取配置 schema */
    getSchema(key?: string): Promise<LinkDeskConfigSchema>;
    /** 订阅配置变更——返回 unsubscribe 函数 */
    onChange(key: string, cb: (value: any) => void): () => void;
  };

  /** @deprecated E3j #75——向后兼容别名，新代码用 configuration */
  config: LinkDeskAPI["configuration"];

  theme: {
    /** 获取当前主题 ID */
    getCurrent(): Promise<string>;
    /** 获取所有可用主题列表 */
    getAvailable(): Promise<LinkDeskTheme[]>;
    /** 应用主题 */
    apply(themeId: string): Promise<void>;
  };

  language: {
    /** 获取当前语言 ID */
    getCurrent(): Promise<string>;
    /** 获取所有可用语言列表 */
    getAvailable(): Promise<LinkDeskLanguage[]>;
    /** 切换语言 */
    set(langId: string): Promise<void>;
    /** 获取初始语言数据（WebView 加载时壳已推送） */
    getInitial(): { lang: string; resources: Record<string, any> } | null;
    /** 订阅语言变更——返回 unsubscribe */
    onChange(cb: (data: { lang: string; resources: Record<string, any> }) => void): () => void;
  };

  /** 通知——插件弹出壳侧 toast，对标 VS Code vscode.window.showInformationMessage */
  notifications: {
    /** 弹出通知。progress=true 时返回 ProgressHandle（含 update/finish/cancel） */
    show(message: string, options?: { type?: "info" | "warning" | "error"; progress?: boolean }): Promise<NotificationHandle | undefined>;
  };

  /** E5#65：p2p 插件间定向推流——和 bridge.broadcast 同模式（fire-and-forget） */
  p2p: {
    send(target: string, channel: string, data: any): void;
    on(channel: string, cb: (data: any) => void): () => void;
  };

  /** E5#71：插件持久化存储——集中缓存 + 文件持久化 */
  pluginState: {
    get<T = any>(pluginId: string, key: string): Promise<T | undefined>;
    set(pluginId: string, key: string, value: any): Promise<void>;
  };

  /** E5#69：菜单——插件声明式读写 */
  menu: {
    registerItems(menuId: string, pluginId: string, items: any[]): Promise<void>;
    getItems(menuId: string): Promise<any[]>;
  };

  /** E5#70：ContextKey——插件 SET 状态供壳 when 子句读 */
  contextKey: {
    set(key: string, value: any): Promise<void>;
    _getValue?(key: string): any;
  };

  /** E5#68：标签页操作——对标 VS Code vscode.window.createTerminal() */
  tabs: {
    create(type: string, opts?: Record<string, any>): Promise<any>;
    openOrFocus(type: string, opts?: Record<string, any>): Promise<any>;
    focus(tabId: string): Promise<void>;
    close(tabId: string): Promise<void>;
    focusBySourceId(sourceId: string): Promise<void>;
    updateLabelBySourceId(sourceId: string, label: string): Promise<void>;
    closeBySourceId(sourceId: string): Promise<void>;
  };

  /** E5#67：弹窗——确认/提示/文件选择 */
  dialog: {
    confirm(message: string): Promise<boolean>;
    alert(message: string): Promise<void>;
    /** 文件/目录选择器——对标 Tauri dialog.open（E5.7#73：openFile 为插件侧规范名，本方法保留给既有消费方） */
    open(opts?: DialogOpenOptions): Promise<string | null>;
    /** 打开文件选择器——返回用户选中路径，取消 → null。安全由主进程控制 */
    openFile(opts?: DialogOpenOptions): Promise<string | null>;
  };

  /** 通用事件订阅 + 发布——插件间数据管道 */
  events: {
    on(channel: string, cb: (payload: any) => void): () => void;
    emit(channel: string, payload: any): void;
  };

  /** 串口——读/写/监听，对标 VS Code SerialPort API */
  serial: {
    listPorts(): Promise<any[]>;
    getStatus(): Promise<any>;
    openPort(cfg: any): Promise<void>;
    closePort(): Promise<void>;
    sendData(data: number[]): Promise<void>;
    sendText(text: string, enc: string): Promise<void>;
    setDtr(enable: boolean): Promise<void>;
    setRts(enable: boolean): Promise<void>;
    onData(cb: (data: any) => void): () => void;
    onStats(cb: (data: any) => void): () => void;
    onSystem(cb: (data: any) => void): () => void;
  };

  /** 剪贴板——读/写系统剪贴板 */
  clipboard: {
    readText(): Promise<string>;
    writeText(text: string): Promise<void>;
  };

  /** 环境信息——对标 VS Code ExtensionContext */
  env: {
    get(pluginId?: string): Promise<any>;
  };

  // E5.7#43/#44：pluginRequest / pluginInstance / pluginViews 命名空间已删——per-tab 多实例模型消亡
  // （恢复需未来池侧 requests 命名空间任务——见 E5.7-执行清单 #43 执行注）
  // ── 壳侧扩展（preload-shell.ts 注入）──
  // 注：以下命名空间类型较为宽泛——壳代码通过 ?. 访问，具体签名见 preload-shell.ts

  /** IPC 桥——壳↔插件通信中继 */
  bridge?: Record<string, any>;

  /** 文件系统——壳侧完整接口（路径校验由主进程执行） */
  filesystem?: Record<string, (...args: any[]) => Promise<any>>;

  /** 路径工具——壳侧供 FileService 等核心模块使用 */
  path?: Record<string, (...args: any[]) => any>;

  /** 插件发现和管理——壳侧 loader 使用 */
  plugins?: Record<string, (...args: any[]) => Promise<any>>;
  pluginManager?: Record<string, (...args: any[]) => Promise<any>>;

  /** 窗口控制——TitleBar 按钮映射 */
  window?: Record<string, (...args: any[]) => Promise<any>>;

  /** 工作区信息 */
  workspace?: Record<string, (...args: any[]) => Promise<any>>;

  /** OS 拖入文件路径获取 */
  getFilePath?: (file: File) => string;
}

/** 进度通知句柄——progress=true 时 show() 返回 */
export interface NotificationHandle {
  /** 更新进度消息 */
  update(message: string): Promise<void>;
  /** 完成——关闭进度通知，可选弹完成 toast */
  finish(message?: string): Promise<void>;
  /** 取消——直接关闭，不弹完成 toast */
  cancel(): Promise<void>;
}

// ── 获取 typed API 实例 ──

/**
 * 返回类型安全的 linkdesk API 对象。
 * 运行时 window.linkdesk 由 preload 注入——此函数只加类型标注。
 */
export function getLinkDesk(): LinkDeskAPI {
  return (window as any as { linkdesk: LinkDeskAPI }).linkdesk;
}

/**
 * 便捷导出：类型安全的 linkdesk API 实例。
 *
 * @example
 *   import { linkdesk } from "@src/core/api/linkdesk-api";
 *   const themes = await linkdesk.theme.getAvailable();
 *   await linkdesk.commands.executeCommand("editor.action.formatDocument");
 */
export const linkdesk: LinkDeskAPI = getLinkDesk();
