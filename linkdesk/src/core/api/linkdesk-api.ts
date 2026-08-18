/**
 * 🔥 linkdesk API 命名空间——类型安全的插件 API 入口
 *
 * E3j #74：对标 VS Code `vscode` 命名空间。插件通过此模块获得：
 *   - 完整的 TypeScript 类型提示（IDE 自动补全、参数校验）
 *   - 零 IPC 知识——不需要知道 channel 名、action 格式、参数结构
 *   - 所有方法内部走 ipcRenderer.invoke()——自动经过 #72 的 IPC 消息队列
 *
 * E5.7#97：本文件成为 window.linkdesk 的完整契约面（替代 E5#89 的宽松
 * Record<string, any>）——池 preload（插件运行时真相源）+ 壳 preload 双端
 * 注入的全部命名空间在此一处声明。跨堆 wire 载荷类型从 src/core/types/ipc/
 * import（决策点 1）——改动 tsc 三端同时报错。
 *
 * 使用方式：
 *   import { linkdesk } from "@src/core/api/linkdesk-api";
 *   const themes = await linkdesk.theme.getAvailable();
 *   await linkdesk.commands.executeCommand("myCommand", arg1, arg2);
 *
 * 运行时实现：window.linkdesk（由 preload-pool.ts / preload-shell.ts 通过 contextBridge 注入）。
 * 本文件是纯类型层——不包含运行时逻辑，只是给 window.linkdesk 加类型。
 */

import type { PoolLayout } from "../types/pool/poolLayout";
import type { PoolTabAction } from "../types/ipc/tabActions";
import type { SidebarAction } from "../types/ipc/sidebarActions";
import type { KeyboardInput, KeybindingSyncData } from "../types/ipc/keyboard";
import type { OpenPortConfig, SerialStatus, SerialStats, SerialPortInfo } from "../types/ipc/serial";
import type { DialogOpenOptions } from "../types/ipc/dialogs";
import type { BridgeRequestPayload } from "../types/ipc/bridge";
import type { PoolQuickPickAction, PoolToastAction, PoolDialogAction, MemoryPressureData } from "../types/ipc/poolActions";
import type { PoolToastData } from "../types/pool/poolToast";
import type { PoolQuickPickData, PluginQuickPickOptions, PluginQuickPickRequest } from "../types/pool/poolQuickPick";
import type { PoolDialogData } from "../types/pool/poolDialog";
import type { FileEntry } from "../types/fileEntry";
import type { FileChangeEvent } from "../services/files/FileService";
import type { PluginManifest } from "./types";
import type { ManifestMenuItem } from "../registry/MenuRegistry";
import type { Keybinding } from "../registry/KeybindingRegistry";
import type { WorkspaceFolder } from "../services/layout/WorkspaceService";

// ── 类型定义 ──

export type { DialogOpenOptions }; // E5.7#97：归口 src/core/types/ipc/dialogs.ts——此 re-export 保持既有插件 import 路径

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
    default?: unknown;
    description?: string;
    enum?: string[];
    enumDescriptions?: string[];
  };
}

/** 插件列表条目——pluginManager.list() 返回（主进程序列化后的 manifest 子集）。
 *  E5.7#98：Partial<PluginManifest> 过宽（component 等字段 IPC 不可达）——收窄为
 *  IpcBridgeHandler.handlePluginsCall "list" 分支实际序列化的 7 字段，marketplace 消费。 */
export interface PluginListEntry {
  pluginId: string;
  manifest: PluginListSubset;
}

/** E5.7#81：安装结果——success:false 时 error 为中文失败原因（校验 / 版本冲突 / 复制失败）。
 *  安装进度事件：events.on("plugin:installProgress", ({ stage, pluginId, message }) => ...)
 *  stage: validating | copying | loading | done | error
 *  E5.7#83：装卸广播（壳 loader → 唯一 Pool）：
 *  events.on("plugin:installed", ({ pluginId, version, reason }) => ...) reason: install | reinstall
 *  events.on("plugin:uninstalled", ({ pluginId, reason }) => ...) reason: uninstall */
export interface PluginInstallResult {
  success: boolean;
  pluginId?: string;
  version?: string;
  needRestart?: boolean;
  error?: string;
}

/** 禁用/卸载列表条目——loader getDisabledPluginInfo/getUninstalledPluginInfo 序列化形状（PluginListSubset 的再子集） */
export interface PluginInfoEntry {
  pluginId: string;
  name: string;
  description?: string;
  version?: string;
}

/** list() 的 manifest 序列化子集——与 handlePluginsCall "list" 7 字段对齐 */
export interface PluginListSubset {
  name?: string;
  description?: string;
  version?: string;
  core?: boolean;
  author?: string;
  statusBar?: PluginManifest["statusBar"];
  contributes?: PluginManifest["contributes"];
}

/** 环境信息——env.get() 返回（主进程 env-handlers 组装） */
export interface EnvInfo {
  appDataDir: string;
  pluginsRootDir: string;
  appPluginsDir: string;
  pluginDataDir?: string;
  pluginCacheDir?: string;
  pluginExportsDir?: string;
}

/** 文件装饰——E5.7#60 池内本地注册表。形状对标插件 API 契约 §3.24 */
export interface FileDecoration {
  badge?: string;
  tooltip?: string;
  color?: string;
  propagate?: boolean;
}

/** 文件装饰提供方——插件注册（registerProvider）。同步查询契约：跳过返回 Promise 的 provideDecoration */
export interface FileDecorationProvider {
  provideDecoration(uri: string): FileDecoration | null | undefined;
  onDidChangeFileDecorations?(cb: (uris: string[]) => void): () => void;
}

/** 菜单项描述——menu.getItems() 返回（壳侧 when 过滤 + t() 翻译 + 快捷键解析后） */
export interface MenuItemDescriptor {
  command: string;
  label?: string;
  group?: string;
  order?: number;
  when?: string;
  /** 壳侧解析后的命令标题（E5.7#14 显示文本铁律） */
  title?: string;
  /** 已解析快捷键 "ctrl+shift+p" 形式 */
  shortcut?: string;
  children?: Array<string | MenuItemDescriptor>;
}

/**
 * linkdesk API——插件代码的类型安全入口。
 * 对标 VS Code `vscode` 对象的全局命名空间结构。
 * 池 preload 注入的命名空间为插件运行时真相源（required）；
 * 壳 preload 独有面（bridge/pool/window/path/…）为 `?` 可选——池内不存在。
 */
export interface LinkDeskAPI {
  /** 命令——对标 VS Code vscode.commands */
  commands: {
    /** @deprecated E3j #75——向后兼容别名，新代码用 executeCommand */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- 命令入参类型由插件命令调用方决定，对标 VS Code executeCommand 的 ...args: any[]
    execute<T = void>(commandId: string, ...args: any[]): Promise<T>;
    /** 执行壳侧命令 */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- 命令入参类型由插件命令调用方决定，对标 VS Code executeCommand 的 ...args: any[]
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
    /** 壳侧插件入口模块级注册（双进程执行壳侧半程）——壳 preload 独有 */
    _executeShellLocal?(id: string, ...args: unknown[]): Promise<unknown>;
  };

  /** 配置—新名——对标 VS Code vscode.workspace.getConfiguration */
  configuration: {
    /** 读取配置值——运行时动态值，无类型参数默认 unknown；调用方显式 get<number>("k") 窄化或自行收窄 */
    get<T = unknown>(key: string): Promise<T>;
    /** 写入配置值 */
    set(key: string, value: unknown): Promise<void>;
    /** 获取配置 schema */
    getSchema(key?: string): Promise<LinkDeskConfigSchema>;
    /** 订阅配置变更——返回 unsubscribe 函数。值运行时动态，T 由订阅方 cb 推断（events.on 同款泛型，防逆变报错） */
    onChange<T = unknown>(key: string, cb: (value: T) => void): () => void;
    // ══ E5.7#76：以下 9 个方法为设置页专用（SettingsView 渲染/实时刷新/跳转）。
    // 池 preload 注入（SettingsView 在池渲染）——required，壳 preload 无此面。
    // 通用插件请用上面的 get/set/getSchema/onChange。 ══
    getConfigurationContributions(): Promise<[string, unknown][]>;
    inspectConfiguration(key: string): Promise<unknown>;
    getUserSettings(): Promise<Record<string, unknown>>;
    onDidChangeConfiguration(cb: (key: string, value: unknown) => void): () => void;
    onPluginLifecycleChange(cb: () => void): () => void;
    consumeSettingsGroup(): Promise<string | null>;
    onRequestSettingsGroup(cb: (pluginId: string) => void): () => void;
    consumeScrollToSetting(): Promise<string | null>;
    onRequestScrollToSetting(cb: (key: string) => void): () => void;
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
    getInitial(): { lang: string; resources: Record<string, unknown> } | null;
    /** 订阅语言变更——返回 unsubscribe */
    onChange(cb: (data: { lang: string; resources: Record<string, unknown> }) => void): () => void;
  };

  /** 通知——插件弹出壳侧 toast，对标 VS Code vscode.window.showInformationMessage */
  notifications: {
    /** 弹出通知。progress=true 时返回 ProgressHandle（含 update/finish/cancel） */
    show(message: string, options?: { type?: "info" | "warning" | "error"; progress?: boolean }): Promise<NotificationHandle | undefined>;
  };

  /** E5#65：p2p 插件间定向推流——和 bridge.broadcast 同模式（fire-and-forget） */
  p2p: {
    send(target: string, channel: string, data: unknown): void;
    on(channel: string, cb: (data: unknown) => void): () => void;
  };

  /** E5#71：插件持久化存储——集中缓存 + 文件持久化 */
  pluginState: {
    /** 读取持久化状态——运行时动态值，默认 unknown；调用方显式 get<string>(...) 窄化或自行收窄 */
    get<T = unknown>(pluginId: string, key: string): Promise<T | undefined>;
    set(pluginId: string, key: string, value: unknown): Promise<void>;
  };

  /** E5#69：菜单——插件声明式读写 */
  menu: {
    registerItems(menuId: string, pluginId: string, items: ManifestMenuItem[]): Promise<void>;
    getItems(menuId: string, context?: Record<string, unknown>): Promise<MenuItemDescriptor[]>;
  };

  /** E5#70：ContextKey——插件 SET 状态供壳 when 子句读 */
  contextKey: {
    set(key: string, value: unknown): Promise<void>;
    _getValue?(key: string): unknown;
  };

  /** E5#68：标签页操作——对标 VS Code vscode.window.createTerminal() */
  tabs: {
    create(type: string, opts?: Record<string, unknown>): Promise<unknown>;
    openOrFocus(type: string, opts?: Record<string, unknown>): Promise<unknown>;
    focus(tabId: string): Promise<void>;
    close(tabId: string): Promise<void>;
    focusBySourceId(sourceId: string): Promise<void>;
    updateLabelBySourceId(sourceId: string, label: string): Promise<void>;
    closeBySourceId(sourceId: string): Promise<void>;
    /** E5.6#11.5g3：标签页激活订阅——文件树 autoReveal 消费（preload-pool 实有面，#98 补录契约） */
    onDidChangeActiveTab(cb: (data: { tabId: string; pluginId?: string; filePath?: string }) => void): () => void;
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

  /** 通用事件订阅 + 发布——插件间数据管道。channel 为自由字符串，载荷按通道分型——订阅方收窄 */
  events: {
    /** E5.7#98：on 泛型化——载荷类型按订阅方 cb 推断（event-system EventSystemApi 同款，#97 已泛型化 impl），通道契约类型（ConfigurationChangedPayload 等）可直传 */
    on<T = unknown>(channel: string, cb: (payload: T) => void): () => void;
    emit(channel: string, payload: unknown): void;
    heartbeat?(): void;
    notifyTheme?(isDark: boolean): void;
  };

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

  /** 环境信息——对标 VS Code ExtensionContext */
  env: {
    get(pluginId?: string): Promise<EnvInfo>;
  };

  /** 文件系统——插件读写（路径校验由主进程执行） */
  filesystem: {
    readTextFile(p: string): Promise<string>;
    writeTextFile(p: string, d: string): Promise<void>;
    exists(p: string): Promise<boolean>;
    createDir(p: string): Promise<void>;
    copy(src: string, dest: string): Promise<void>;
    remove(p: string): Promise<void>;
    listDir(p: string): Promise<FileEntry[]>;
    readBinaryFile(p: string): Promise<Uint8Array>;
    writeBinaryFile(p: string, d: Uint8Array): Promise<void>;
    /** 监听目录变更——返回 unsubscribe（内部走 filesystem:changed:<watcherId> 通道） */
    watch(dirPath: string, onEvent: (e: FileChangeEvent) => void): Promise<() => void>;
    /** 列出条目名——壳 preload 独有（池侧请用 listDir） */
    readdir?(p: string): Promise<string[]>;
  };

  /** 工作区——池 preload 注入（壳侧经 WorkspaceService 直用）。池权威命名空间——插件必用面（file-tree），必选 */
  workspace: {
    getFolders(): Promise<WorkspaceFolder[]>;
    getActive(): Promise<string | undefined>;
    setActive(uri: string): Promise<void>;
    openFolder(): Promise<void>;
    addFolder(path: string): Promise<void>;
    removeFolder(path: string): Promise<void>;
    onDidChangeFolders(cb: () => void): () => void;
    onDidChangeActiveWorkspace(cb: (uri: string | null) => void): () => void;
  };

  /** 快捷键——壳/池双端注入（syncToMainProcess/onForwardedEvent 为壳侧独有）。池插件消费 setKeybindingCaptureActive（file-tree），必选 */
  keybindings: {
    getKeybindings(): Promise<Keybinding[]>;
    getConflicts(): Promise<unknown>;
    registerKeybinding(binding: unknown): Promise<void>;
    saveUserKeybindings(): Promise<void>;
    removeKeybindingForCommand(commandId: string): Promise<void>;
    resetKeybindingToDefault(commandId: string): Promise<void>;
    findKeybindingForCommand(commandId: string): Promise<Keybinding | undefined>;
    setKeybindingCaptureActive(active: boolean): Promise<void>;
    // 纯数据形参——contextBridge 结构化克隆丢 KeyboardEvent 原生属性（.key/.code 是 C++ getter），
    // 调用方先提取字段再传（KeybindingSettingsView 同款）。真实 KeyboardEvent 天然满足此形状。
    keyboardEventToKeyString(e: Pick<KeyboardEvent, "key" | "ctrlKey" | "shiftKey" | "altKey" | "metaKey">): string;
    onChange(cb: () => void): () => void;
    /** 壳→主进程同步快捷键表（chord 状态机查表） */
    syncToMainProcess?(data: KeybindingSyncData): Promise<void>;
    /** 接收主进程 before-input-event 转发的拦截事件 */
    onForwardedEvent?(cb: (input: KeyboardInput) => void): () => void;
  };

  /** 热退出暂存——编辑器未保存内容落盘（E5.7#53） */
  hotExit?: {
    save(filePath: string, content: string): Promise<void>;
    load(filePath: string): Promise<string | null>;
    clear(filePath: string): Promise<void>;
  };

  /** OS 拖入文件路径获取 */
  getFilePath?: (file: File) => string;

  /** 路径工具——壳/池双端注入（editor/file-tree 池插件消费 normalize/join 等）；appDataDir 双端同款（E5.8#0d.5：池侧补上——settings 插件池内解析 userData 路径） */
  path: {
    appDataDir?(): Promise<string>;
    normalize(p: string): string;
    join(...parts: string[]): string;
    basename(p: string): string;
    dirname(p: string): string;
    extname(p: string): string;
  };

  /** 插件发现——双端注入：resolvePath 双端同面；读面（listDirs/listDisabledDirs/readManifest）壳 preload 独有（loader 只在壳跑） */
  plugins: {
    resolvePath(id: string): Promise<string>;
    listDirs?(): Promise<string[]>;
    listDisabledDirs?(): Promise<string[]>;
    /** 返回 plugin.json 原始 JSON 文本——消费方自行 JSON.parse */
    readManifest?(id: string): Promise<string>;
  };

  /** 插件管理——桥接 IpcBridgeHandler → loader 函数。池权威（marketplace 插件消费），必选 */
  pluginManager: {
    list(): Promise<PluginListEntry[]>;
    enable(id: string): Promise<unknown>;
    disable(id: string): Promise<unknown>;
    uninstall(id: string): Promise<unknown>;
    install(path: string): Promise<PluginInstallResult>;
    reinstall(id: string): Promise<unknown>;
    getDisabled(): Promise<PluginInfoEntry[]>;
    getUninstalled(): Promise<PluginInfoEntry[]>;
    isDisabled(id: string): Promise<boolean>;
    /** E5.7#48：装/卸/重装成功 → 通知主进程全量重扫三表 */
    notifyManifestChanged?(): void;
  };

  /** 壳↔插件通信中继——壳 preload 独有 */
  bridge?: {
    onRequest(cb: (req: BridgeRequestPayload) => void): () => void;
    respond(requestId: string, result?: unknown, error?: string): void;
    broadcast(channel: string, payload: unknown): void;
    notifyConfigChanged(key: string, value: unknown): void;
  };

  /** 池控制——壳 preload：推送布局 + 注册池→壳动作回调；池 preload：收布局 + 发动作。双端合一面对齐 wire */
  pool?: {
    // ── 壳侧（池 preload 无） ──
    pushLayout(layout: PoolLayout): void;
    onReady(cb: () => void): () => void;
    toggleDevTools(): void;
    onSidebarAction(cb: (action: SidebarAction) => void): () => void;
    onTabAction(cb: (action: PoolTabAction) => void): () => void;
    pushQuickPick(data: unknown): void;
    onQuickPickAction(cb: (action: PoolQuickPickAction) => void): () => void;
    pushToast(data: unknown): void;
    onToastAction(cb: (action: PoolToastAction) => void): () => void;
    pushDialog(data: unknown): void;
    onDialogAction(cb: (action: PoolDialogAction) => void): () => void;
    onMemoryPressure(cb: (data: MemoryPressureData) => void): () => void;
    // ── 池侧（壳 preload 无） ──
    onLayout(cb: (layout: PoolLayout) => void): () => void;
    ready(): void;
    sidebarAction(action: SidebarAction): void;
    tabAction(action: PoolTabAction): void;
  };

  /** E5.7#63：插件 quickPick 选择器——池内本地桥（零 IPC，QuickPickHost 渲染）。结算 null → undefined */
  quickPick: {
    show(opts: PluginQuickPickOptions): Promise<unknown>;
  };

  /** E5.7#63：QuickPick 宿主渲染桥——池 QuickPickHost 消费（壳 preload 无此面） */
  quickPickHost: {
    registerHost(fn: (req: PluginQuickPickRequest, settle: (key: string | null) => void) => void): () => void;
    onShow(cb: (data: PoolQuickPickData) => void): () => void;
    select(key: string): void;
    highlight(key: string): void;
    close(): void;
    itemAction(key: string, actionId: string): void;
  };

  /** E5.7#16：Toast 哑渲染订阅——池 ToastHost 消费（壳 preload 无此面） */
  toast: {
    onShow(cb: (data: PoolToastData) => void): () => void;
    dismiss(id: string): void;
    action(id: string, actionId: string): void;
  };

  /** E5.7#17：Dialog 哑渲染订阅——池 DialogHost 消费（壳 preload 无此面）。命名 dialogHost——
   * dialog 命名空间已是插件侧 confirm/alert/open API */
  dialogHost: {
    onShow(cb: (data: PoolDialogData) => void): () => void;
    confirm(): void;
    cancel(): void;
  };

  /** E5.7#50：文件关联——扩展名→插件 ID（主进程 FileAssociationService 直答） */
  fileAssociation: {
    getPluginFor(ext: string): Promise<string | undefined>;
  };

  /** E5.6#11.5a：文件搜索——全文搜索/替换（IPC 到壳/主进程执行） */
  search: {
    searchFiles(opts: {
      roots: string[];
      query: string;
      include?: string;
      exclude?: string;
      caseSensitive?: boolean;
      wholeWord?: boolean;
      useRegex?: boolean;
      maxResults?: number;
    }): Promise<Array<{
      filePath: string;
      matches: Array<{ filePath: string; lineNumber: number; lineText: string; matchStart: number; matchEnd: number }>;
    }>>;
  };

  /** E5.7#60：文件装饰——池内本地注册表（零 IPC）。形状对标契约 §3.24 */
  decorations: {
    registerProvider(pluginId: string, provider: FileDecorationProvider): void;
    unregisterProvider(pluginId: string): void;
    getDecoration(uri: string): Promise<FileDecoration | null>;
    onDidChange(cb: (uris: string[]) => void): () => void;
  };

  /** E5.6#11.5a：编码检测/转换（主进程 EncodingService） */
  encoding: {
    detect(buffer: Uint8Array): Promise<string>;
    decode(buffer: Uint8Array, encoding: string): Promise<string>;
    encode(text: string, encoding: string): Promise<Uint8Array>;
  };

  /** E5.7#58：viewContainer——真 IPC 查询/更新（问壳侧注册表）。DTO 只含可序列化公开字段 */
  viewContainer: {
    getViewContainer(id: string): Promise<Record<string, unknown> | undefined>;
    getViews(containerId: string): Promise<Array<Record<string, unknown>>>;
    getView(viewId: string): Promise<Record<string, unknown> | undefined>;
    registerView(pluginId: string, containerId: string, descriptor: Record<string, unknown>): Promise<void>;
  };

  /** E5.7#49：langDef——语言定义注册表（主进程直答）。只返回可序列化字段（monarch tokenizer 函数主进程侧剥壳） */
  langDef: {
    get(extension: string): Promise<{ id: string; lsp?: { command: string; args?: string[] } } | null>;
  };

  /** E5.6#14-lsp：LSP 桥——自动补全/F12/诊断/重命名 */
  lsp: {
    spawn(command: string, args: string[] | undefined, pluginId: string): Promise<string>;
    write(channelId: string, data: string): void;
    dispose(channelId: string): Promise<unknown>;
    onData(cb: (channelId: string, data: string) => void): () => void;
  };

  /** E5.7#49：protocol——协议注册表（主进程直答）。返回前剥 parseLine/detect（JS 函数不可跨进程） */
  protocol: {
    listProtocols(): Promise<Array<{ id: string; name: string; pluginId: string; mode: string }>>;
    getActiveProtocolId(): Promise<string>;
    setActiveProtocolId(protocolId: string): Promise<void>;
  };

  /** 窗口控制——TitleBar 按钮映射，壳 preload 独有 */
  window?: {
    minimize(): void;
    maximize(): void;
    unmaximize(): void;
    close(): void;
    /** E5.7#79：缩放因子 → 主进程 setZoomFactor(池 WCV) */
    setZoom(factor: number): void;
    toggleDevTools(): Promise<void>;
    isMaximized(): Promise<boolean>;
    onMaximizeChange(cb: (maximized: boolean) => void): () => void;
  };

  /** 壳级命令——revealInOS / openInTerminal / startDrag，壳 preload 独有 */
  shell?: {
    showItemInFolder(p: string): Promise<void>;
    openInTerminal(dirPath: string, terminalExe?: string, customCommand?: string): Promise<void>;
    startDrag(filePath: string, iconPath?: string): void;
  };
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
  return (window as unknown as { linkdesk: LinkDeskAPI }).linkdesk;
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
