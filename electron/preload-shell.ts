/**
 * 壳窗口 preload 脚本
 *
 * 通过 contextBridge 向渲染进程暴露 window.linkdesk API。
 * E1 步 1：API 结构为空壳——具体实现在步 2-4 逐步接入。
 *
 * 安全模型：
 *   - contextIsolation: true → 渲染进程无法直接访问 Node.js/Electron API
 *   - contextBridge → 精确控制暴露哪些 API
 *   - 插件在池渲染进程内运行——插件侧 API 由 preload-pool.ts 注入（E5.7 极简Pool）
 */

import { contextBridge, ipcRenderer, webUtils } from 'electron';
import { APP_NAMESPACE } from './constants';
import { createEventSystem, listenDirect } from './ipc/event-system';
import { IPC, filesystemChanged } from './ipc/channels';
import { IpcRelay } from './ipc/ipc-relay';
// E5.8#20：壳暴露面契约——expose 对象 satisfies ShellExposed（tsc 即门禁，漂移编译期死）
import type { ShellExposed } from '../src/core/api/linkdesk-api/surfaces';
// E5.8#20：window 双端口径完全一致 → 抽共享模块（消 jscpd 克隆 + setZoom 漂移结构性消失）
import { buildWindow } from './window-namespace';
// ── E5.7#97：wire 契约归口——preload 边界载荷全部从 src/core/types/ipc/ import type ──
import type { PoolLayout } from '../src/core/types/pool/poolLayout';
import type { ShellTabAction } from '../src/core/types/ipc/tabActions';
import type { SidebarAction } from '../src/core/types/ipc/sidebarActions';
import type { ForwardedKeyboardInput, KeybindingSyncData } from '../src/core/types/ipc/keyboard';
import type { OpenPortConfig, SerialDataPayload, SerialStatsPayload, SerialSystemPayload } from '../src/core/types/ipc/serial';
import type { DownloadProgress, UpdateState } from '../src/core/types/ipc/update'; // E6#57.9c：#57.12 加 DownloadProgress
import type { DialogOpenOptions, DialogContentOpenOptions } from '../src/core/types/ipc/dialogs';
import type { ConfigurationChangedPayload, PluginStateChangedPayload } from '../src/core/types/ipc/events';
import type { BridgeRequestPayload } from '../src/core/types/ipc/bridge';
import type { PoolQuickPickAction, PoolDialogAction, PoolFloatingPanelAction, MemoryPressureData, PoolReadyPayload, CreatePoolWindowRequest, PoolWindowClosedPayload, PoolWindowBoundsPayload, TabBarRectsPayload, ShellTabDragPosition, AdsorbHintPayload, AdsorbIndexPayload } from '../src/core/types/ipc/poolActions';
import type { FileChangeEvent } from '../src/core/services/files/FileService';
import type { MenuItemDescriptor, PluginInstallRequestOpts, PluginInstallJobRef, PluginFolderKind } from '../src/core/api/linkdesk-api/types'; // E5.8#20：契约语义类型——menu.getItems 返回面；E6#73c：+ 安装 job 身份；E6#78：+ 插件目录落点
// E5.8#1b：keybinding 归一化集中——主进程/壳/池三端共用单一权威源（防 E5.7#79 漂移复发）
import { keyboardInputToKeyString } from '../src/core/utils/keybindingNormalization.js';
import type { OsIntegrationKind } from './services/registry-integration.js'; // E6#45f（类型 only）

// ── E5#19b fix: ContextKey 本地同步 store——IPC 回路延迟致键盘分发读不到最新值 ──
const _contextKeyStore = new Map<string, unknown>();
// 监听主进程回传的 context key 变更——其他 WebView 写入后主进程广播
ipcRenderer.on(IPC.contextKey.changed, (_event, { key, value }: { key: string; value: unknown }) => {
  _contextKeyStore.set(key, value);
});

// ── E3a #26：bridge 请求处理器——主进程转发插件 IPC 到壳侧服务 ──
// E5.6#16.7k-fix：缓冲回放——对标 preload-pool.ts onLayout 模式。
// module 顶层 IPC（如 serial-monitor 的 registerItems）可能在 React mount 前到达，
// 处理器未注册时静默丢弃 → 菜单项永远丢失。
// 缓冲+回放保证：handler 就绪前到达的请求排队，handler 就绪后逐条回放。
// E5.7#78：手写 buffer+handler 双件套 → IpcRelay<T>（electron/ipc/ipc-relay.ts）
const _bridgeRequestRelay = new IpcRelay<BridgeRequestPayload>();

ipcRenderer.on(IPC.bridge.request, (_event, req: BridgeRequestPayload) => {
  _bridgeRequestRelay.push(req);
});

// ── E5.8#46.11：池窗 bounds 上报缓冲——壳 reload 后主进程 preloadReady seed 补推（见 main.ts），
// 缓冲+回放防 IPC 早于 React 订阅到达（对标 _bridgeRequestRelay 硬约束 20 同款）──
const _windowBoundsRelay = new IpcRelay<PoolWindowBoundsPayload>();

ipcRenderer.on(IPC.pool.windowBoundsChanged, (_event, payload: PoolWindowBoundsPayload) => {
  _windowBoundsRelay.push(payload);
});

// ── E6#46b：intake 文件投递（workspace:openPath，主进程直发 mainWindow）——缓冲回放走 IpcRelay
// （硬约束 20）：启动 argv / second-instance 的文件批在壳 React 订阅前就可能到达，
// 模块顶层常驻监听入队，onOpenPath 首次订阅时 FIFO 回放，之后实时投递。──
const _openPathRelay = new IpcRelay<{ paths: string[] }>();

ipcRenderer.on(IPC.workspace.openPath, (_event, payload: { paths: string[] }) => {
  _openPathRelay.push(payload);
});

// ── E5.7#56：壳侧命令 handler 地图——插件入口模块双进程执行（壳 glob loader + 池视图渲染）──
// 壳进程执行时 registerCommand 传入的 handler 是页面世界函数（contextBridge 双向代理，
// 隔离世界可调用——preload-pool _poolCommands 同款机制）。壳 CommandRegistry 条目执行时
// 经 window.linkdesk.commands._executeShellLocal 桥回此处。
const _shellCommands = new Map<string, (...args: unknown[]) => unknown>();

// E5.5#7-p6：键盘路由——接收主进程 before-input-event 转发的快捷键
// E5.8#46.8：载荷含 sourceWindowId（ForwardedKeyboardInput）——壳按聚焦窗裁决
let _keyboardForwardHandler: ((input: ForwardedKeyboardInput) => void) | null = null;
ipcRenderer.on(IPC.keyboard.executeShortcut, (_event, input: ForwardedKeyboardInput) => {
  if (_keyboardForwardHandler) _keyboardForwardHandler(input);
});

// E5.6#11j：侧栏操作回调——池→主进程→壳，壳侧 React 注册 handler 调 ViewContainerService
let _sidebarActionHandler: ((action: SidebarAction) => void) | null = null;
ipcRenderer.on(IPC.pool.sidebarAction, (_event, action: SidebarAction) => {
  if (_sidebarActionHandler) _sidebarActionHandler(action);
});

// E5.6#16.5：主区 tab 操作回调——池→主进程→壳，壳侧 React 注册 handler 调 useTabManager
// E5.8#44-B：主进程按 sender 注入 sourceWindowId → 壳收 ShellTabAction（#43-4 权威窗口身份）
let _tabActionHandler: ((action: ShellTabAction) => void) | null = null;
ipcRenderer.on(IPC.pool.tabAction, (_event, action: ShellTabAction) => {
  if (_tabActionHandler) _tabActionHandler(action);
});

// E5.8#44-B：TabBar viewport rects 上报回调——池→主进程→壳，壳侧 React 注册 handler 存吸附命中注册表
let _tabBarRectsHandler: ((payload: TabBarRectsPayload) => void) | null = null;
ipcRenderer.on(IPC.pool.tabBarRects, (_event, payload: TabBarRectsPayload) => {
  if (_tabBarRectsHandler) _tabBarRectsHandler(payload);
});

// E5.8#44-C：拖拽位置上报回调——池→主进程→壳，壳侧 React 注册 handler 做吸附命中检测（排除源窗）
let _dragPositionHandler: ((pos: ShellTabDragPosition) => void) | null = null;
ipcRenderer.on(IPC.pool.dragPosition, (_event, pos: ShellTabDragPosition) => {
  if (_dragPositionHandler) _dragPositionHandler(pos);
});

// E5.8#46.10：吸附插入缝隙回传回调——池→主进程（按 sender 注入 windowId）→壳，壳存吸附注册表供释放并窗精确落位
let _adsorbIndexHandler: ((payload: AdsorbIndexPayload) => void) | null = null;
ipcRenderer.on(IPC.pool.adsorbIndex, (_event, payload: AdsorbIndexPayload) => {
  if (_adsorbIndexHandler) _adsorbIndexHandler(payload);
});

// E5.7#15：QuickPick 动作回调——池→主进程→壳，壳侧 React 注册 handler 调 QuickPickService
let _quickPickActionHandler: ((action: PoolQuickPickAction) => void) | null = null;
ipcRenderer.on(IPC.pool.quickpickAction, (_event, action: PoolQuickPickAction) => {
  if (_quickPickActionHandler) _quickPickActionHandler(action);
});

// E5.7#17：Dialog 动作回调——池→主进程→壳，壳侧 React 注册 handler 调 DialogService 桥
let _dialogActionHandler: ((action: PoolDialogAction) => void) | null = null;
ipcRenderer.on(IPC.pool.dialogAction, (_event, action: PoolDialogAction) => {
  if (_dialogActionHandler) _dialogActionHandler(action);
});

// E5.8#37（Phase 8 类型 B）：悬浮面板动作回调——池→主进程→壳，壳侧 React 注册 handler 调 FloatingPanelService 桥
let _floatingPanelActionHandler: ((action: PoolFloatingPanelAction) => void) | null = null;
ipcRenderer.on(IPC.pool.floatingPanelAction, (_event, action: PoolFloatingPanelAction) => {
  if (_floatingPanelActionHandler) _floatingPanelActionHandler(action);
});

// E5.7#39：内存压力通知——主进程 window-manager 单 Pool 采样超阈值 → 壳 toast 服务
let _memoryPressureHandler: ((data: MemoryPressureData) => void) | null = null;
ipcRenderer.on(IPC.system.memoryPressure, (_event, data: MemoryPressureData) => {
  if (_memoryPressureHandler) _memoryPressureHandler(data);
});

// ── E3j #77a：归一化事件系统——由 ipc/event-system.ts 提供 ──
const events = createEventSystem(ipcRenderer, {
  logPrefix: 'preload-shell',
});

// E6#57.2b：壳侧产品身份面——函数构造（非内联字面量）。satisfies 的 excess-property 检查达对象字面量
// 每一层——getProductInfo 超额暴露若内联进 app 字面量会编译红（上下文类型 = 契约 app 面只有 getVersion）；
// 工厂返回的对象走结构兼容（目标需的都有 + 多余的容忍），超额暴露才成立。
function buildShellApp() {
  return {
    // getVersion = 契约必选面（壳/池双端同步暴露——第三方插件读宿主版本号，市场 minAppVersion E6#30.8c）
    getVersion: () => ipcRenderer.invoke(IPC.app.getVersion),
    // getProductInfo = 壳内私有扩展（关于标签页 E6#57.14 数据源；不在契约——池插件不可调）
    getProductInfo: () => ipcRenderer.invoke(IPC.app.getProductInfo),
  };
}

// E6#57.8：壳侧更新面——同 buildShellApp() 的工厂理由：契约的 update 面**只有 `getState`**
// （第三方只读，见 src/core/api/linkdesk-api/update.ts 的 🔴 段），壳要用的写命令属超额暴露，
// 内联进对象字面量会被 satisfies 的 excess-property 检查编译红；工厂返回走结构兼容。
// 消费者 = 通知面板/关于页/手动检查（#57.9c、#57.12）——都在壳渲染进程。
function buildShellUpdate() {
  return {
    // getState = 契约必选面（壳/池双端同步暴露——「关于」类插件读更新态）
    getState: () => ipcRenderer.invoke(IPC.update.getState),
    // ── 以下四条 = 壳内私有扩展（不在契约——池插件不可调）──
    /**
     * 发行说明取数（E6#57.13b）——**壳内私有扩展的第二例**（第一例是 getProductInfo，同因同形：
     * 壳内视图的数据源，属壳不属插件）。
     *
     * 🔴 **为什么池侧不暴露**（本格最核心的一条边界决策，别在后人手里改成「顺手给池开一个」）：
     * 契约的 update 面只有 `getState` 是**设计**（`linkdesk-api/update.ts` 的 🔴 段 + 05 §2.4
     * 「发行说明是壳自己的面，第三方插件没有读它的理由」）。而发行说明标签页是**壳内视图**
     * （`SHELL_RENDERED_TYPES` 封闭集合成员，无 plugin.json）——它与第三方插件共用**同一个**
     * `window.linkdesk`，所以「给池开一个」= 「给所有插件开一个」，二者不可分辨。
     * ⇒ 数据走「**壳想、池画**」：壳在渲染进程取好（本方法，走 `src/hooks/useReleaseNotes.ts`
     *   的模块单例），经 `pushLayout` 把结果挂在标签页上推给池，池只画。
     *
     * ⚠️ 与 `app.getProductInfo`（#57.14 关于页数据源）是**同一条规矩的两个实例**——两格必须同形，
     *   否则「壳内视图取数」会出现两种互不相同的写法。
     *
     * @param version 指定版本号（无 v 前缀）；省略 = 最近一版。请求的那版不在列表里时主进程回落最近一版
     *                （`ReleaseNotes.version` 与请求值不一致即为回落信号）。
     */
    getReleaseNotes: (version?: string) => ipcRenderer.invoke(IPC.update.getReleaseNotes, version),
    // 检查是**壳私事**：手动检查（用户点菜单）+ 后台检查（定时）都从壳发起（07 §一）。
    checkForUpdates: (context: boolean) => ipcRenderer.invoke(IPC.update.checkForUpdates, context),
    downloadUpdate: () => ipcRenderer.invoke(IPC.update.downloadUpdate),
    // 抛错面：无安装器/校验失败时状态机把错误上抛，壳负责收成用户可见提示（通知面板 #57.12）
    quitAndInstall: () => ipcRenderer.invoke(IPC.update.quitAndInstall),
    // 状态迁移订阅（E6#57.9c）——主进程 onStateChanged 走 IpcBridge.broadcast('shell')，
    // 落到 plugin:push 信封；events.on 按 data.channel 过滤（同 serial.onData 形状，:185）。
    // 🔴 只订阅不给「当前值」——广播是**变化**，不是**真相**。订阅方必须自己先 invoke(getState)
    //   补初值，否则壳 preload 无重放包装时会漏掉 mount 之前的那次迁移（07 §4.4）。
    onStateChanged: (cb: (state: UpdateState) => void) => events.on(IPC.update.stateChanged, cb),
    // 下载进度订阅（E6#57.12）——与 onStateChanged **分属两条通道**：迁移是事件（重放有意义），
    // 进度是瞬时量（`storeForReplay:false`，见 update-handlers.ts 的 onProgress 出口）。
    // ⚠️ 想拿「当前」进度不要靠这条通道的首次回调——它在订阅前发生的帧不会补发；初值从
    //    `getState()` 的 `downloading.progress` 取（服务在 reportProgress 里原地刷过），
    //    本通道只负责**推进**。消费方 = src/hooks/useUpdateState.ts 的 useUpdateProgress()。
    onProgress: (cb: (progress: DownloadProgress) => void) => events.on(IPC.update.progress, cb),
  };
}

// E6#46b：intake 订阅 = **shell 命名空间上的壳内私有扩展**（与 update 的 onStateChanged 同款先例：
// 契约面本身不带它，壳侧用工厂构造超额暴露）。⚠️ 踩过两次门禁：① 开新顶层命名空间（intake）会被
// 命名空间矩阵门禁当「契约未定义的注入面」拦下；② 挂 workspace 面也不行——壳侧根本没有 workspace 面
// （那是池的）。落点 = shell（壳自有能力面，ShellExposed 已 pick）。
function buildShellIntakeExtras() {
  return {
    /**
     * 命令行/文件关联 intake 订阅（E6#46b）——载荷 = 本次到达的文件路径批（string[]）。
     * 首次订阅先 FIFO 回放订阅前缓冲的批次（IpcRelay/硬约束 20），此后实时投递；返回退订函数。
     * 消费者 = src/hooks/useOpenPathIntake.ts（App 顶层，壳级功能不进插件——B79）。
     */
    onOpenPath: (cb: (paths: string[]) => void): (() => void) =>
      _openPathRelay.onReady((payload) => cb(payload.paths)),
    /**
     * E6#47f：把本窗活跃工程上报主进程（记 windows-state.json，冷启动恢复最后活跃窗）。
     * 壳内私有扩展（同 onOpenPath 面）。fires-and-forgets（send）——上报失败不影响本地状态。
     */
    reportActiveWorkspace: (folder: string | null) => ipcRenderer.send(IPC.workspace.reportActive, folder),
    /**
     * E6#45f：OS 集成开关（右键菜单/文件类型关联）——读注册表现状 / 开-关某项。
     * 真相源是注册表（安装器与软件内写的是同一批键）；配置项只是 UI 镜像，见 startup.ts 通用组。
     */
    getIntegrationState: () => ipcRenderer.invoke(IPC.registry.getIntegrationState),
    setIntegrationEnabled: (kind: OsIntegrationKind, enabled: boolean) =>
      ipcRenderer.invoke(IPC.registry.setIntegrationEnabled, kind, enabled),
  };
}

try {
  // E5.8#20：契约面机械对齐——expose 对象 satisfies ShellExposed（24 命名空间，缺面/形状失配即编译红）
  const shellExposed = {
    /** OS 拖入——从 File 对象取真实路径。Electron 43 contextIsolation 下 File.path 为空，必须走 webUtils。 */
    getFilePath: (file: File) => webUtils.getPathForFile(file),

    // ── 串口（步 2 接入）──
    // E5.8#26 D2/D5：全操作 portName? 透传（缺省唯一口语义，主进程 getPort 解析）；getStatus 双形态
    serial: {
      listPorts:  ()                    => ipcRenderer.invoke(IPC.serial.listPorts),
      getStatus:  (portName?: string)   => ipcRenderer.invoke(IPC.serial.getStatus, portName),
      openPort:   (cfg: OpenPortConfig)  => ipcRenderer.invoke(IPC.serial.openPort, cfg),
      closePort:  (portName?: string)   => ipcRenderer.invoke(IPC.serial.closePort, portName),
      sendData:   (data: number[], portName?: string) => ipcRenderer.invoke(IPC.serial.sendData, data, portName),
      sendText:   (text: string, enc: string, portName?: string) => ipcRenderer.invoke(IPC.serial.sendText, text, enc, portName),
      setDtr:     (enable: boolean, portName?: string) => ipcRenderer.invoke(IPC.serial.setDtr, enable, portName),
      setRts:     (enable: boolean, portName?: string) => ipcRenderer.invoke(IPC.serial.setRts, enable, portName),
      // 数据推送监听——E5.8#6.5：走 broadcast → plugin:push 分发 → events.on（原 listenDirect direct 已删）
      // E5.8#28：回调载荷对象化（SerialDataPayload/SerialStatsPayload/SerialSystemPayload——portName 路由键）
      onData:     (cb: (payload: SerialDataPayload) => void)   => events.on(IPC.serial.data, cb),
      onStats:    (cb: (payload: SerialStatsPayload) => void)  => events.on(IPC.serial.stats, cb),
      onSystem:   (cb: (payload: SerialSystemPayload) => void) => events.on(IPC.serial.system, cb),
    },

    // ── 文件系统（步 3 接入——对标 @tauri-apps/plugin-fs）──
    filesystem: {
      readTextFile:  (p: string)           => ipcRenderer.invoke(IPC.filesystem.readTextFile, p),
      writeTextFile: (p: string, d: string) => ipcRenderer.invoke(IPC.filesystem.writeTextFile, p, d),
      exists:        (p: string)           => ipcRenderer.invoke(IPC.filesystem.exists, p),
      createDir:     (p: string)           => ipcRenderer.invoke(IPC.filesystem.createDir, p),
      readdir:       (p: string)           => ipcRenderer.invoke(IPC.filesystem.readdir, p),
      copy:          (src: string, dest: string) => ipcRenderer.invoke(IPC.filesystem.copy, src, dest),
      rename:        (src: string, dest: string) => ipcRenderer.invoke(IPC.filesystem.rename, src, dest),
      remove:        (p: string)           => ipcRenderer.invoke(IPC.filesystem.remove, p),
      // E2c #13 新增：listDir / readBinaryFile / watch
      listDir:       (p: string)           => ipcRenderer.invoke(IPC.filesystem.listDir, p),
      readBinaryFile:(p: string)           => ipcRenderer.invoke(IPC.filesystem.readBinaryFile, p),
      // E4V#40w——GBK 编码保存
      writeBinaryFile:(p: string, d: Uint8Array) => ipcRenderer.invoke(IPC.filesystem.writeBinaryFile, p, d),
      // E4V#fix: watch 一步完成——内部走 filesystem:changed:${watcherId}，自动隔离
      // E5.8#20：onEvent 参数改用契约 FileChangeEvent（原内联 { path; type: string } 漏掉 type 判别联合）
      watch: (dirPath: string, onEvent: (e: FileChangeEvent) => void) => {
        return ipcRenderer.invoke(IPC.filesystem.watch, dirPath).then((watcherId: number) => {
          const channel = filesystemChanged(watcherId);
          // E5.8#6.5：文件变更走 broadcast → plugin:push 分发 → events.on（原 ipcRenderer.on direct 已删）
          const unsubscribe = events.on<FileChangeEvent>(channel, (change) => onEvent(change));
          return () => {
            unsubscribe();
            ipcRenderer.invoke(IPC.filesystem.unwatch, watcherId).catch(() => {}); // 非关键操作——清理 watcher，窗口关闭时失败不阻塞
          };
        });
      },
    },

    // ── 路径（步 3 接入——对标 @tauri-apps/api/path）+ E5#85 扩展 ──
    path: {
      appDataDir: () => ipcRenderer.invoke(IPC.path.appDataDir),
      normalize: (p: string) => p.replace(/\\/g, "/"),
      join: (...parts: string[]) => parts.map(p => String(p).replace(/\\/g, "/")).join("/").replace(/\/+/g, "/"),
      basename: (p: string) => { const s = p.replace(/\\/g, "/").split("/"); return s[s.length - 1] || ""; },
      dirname: (p: string) => { const s = p.replace(/\\/g, "/").split("/"); s.pop(); return s.join("/") || "."; },
      extname: (p: string) => { const b = p.replace(/\\/g, "/").split("/").pop() || ""; const i = b.lastIndexOf("."); return i > 0 ? b.slice(i) : ""; },
    },

    // ── 插件管理（步 3 接入——对标 Rust plugins.rs）──
    plugins: {
      listDirs:         () => ipcRenderer.invoke(IPC.plugins.listDirs),
      // E6#9a：全量发现——[{ pluginId, entry, manifest }]（替代 import.meta.glob）
      listAll:          () => ipcRenderer.invoke(IPC.plugins.listAll),
      listDisabledDirs: () => ipcRenderer.invoke(IPC.plugins.listDisabledDirs),
      readManifest:     (id: string) => ipcRenderer.invoke(IPC.plugins.readManifest, id),
      // E6#9c：全量 manifest——Record<pluginId, PluginManifest>
      readAllManifests: () => ipcRenderer.invoke(IPC.plugins.readAllManifests),
      resolvePath:      (id: string) => ipcRenderer.invoke(IPC.plugins.resolvePath, id),
      // E6#7（1.2-4）：resolvePath 的兄弟——{ root, entry, bundle }（bundle 入口恒 index.bundle.js）
      resolveEntry:     (id: string) => ipcRenderer.invoke(IPC.plugins.resolveEntry, id),
      // E6#11/#13（1.2-5）：包安装流主进程 fs/net 段——壳 preload 独有（loader 在壳跑；download/extract handler 不对池暴露）
      // E6#73c：job 身份随行——主进程段进度事件据此回填 jobId/pluginId（缺省 = 事件不带身份）
      packageDownload:  (url: string, job?: PluginInstallJobRef) => ipcRenderer.invoke(IPC.plugins.download, url, job),
      packageExtract:   (zipPath: string, expectedPluginId?: string, job?: PluginInstallJobRef) => ipcRenderer.invoke(IPC.plugins.extract, zipPath, expectedPluginId, job),
      // E6#73d：按 jobId 中止在途下载（面板「取消安装」）——AbortSignal 不可序列化，只能发定向消息。
      // 返回 false = 该 job 没有在途下载（未开跑 / 已收尾）——非错误，壳侧照常撤行。
      packageCancel:    (jobId: string) => ipcRenderer.invoke(IPC.plugins.cancel, jobId),
      // E6#11c/#13b/c（段 B）：安全更新三段主进程 handler——updatePlugin/checkPluginUpdates 编排（壳 preload 独有）
      // E6#33c（锚①）：stage-update allowOlder——降级放行（版本下拉选旧版 + F2 确认后传），默认拒 <=
      packageUpdateCheck:  (pluginId: string, catalogUrl: string, currentVersion?: string) => ipcRenderer.invoke(IPC.plugins.updateCheck, pluginId, catalogUrl, currentVersion),
      packageStageUpdate:  (pluginId: string, source: string, currentVersion?: string, allowOlder?: boolean, job?: PluginInstallJobRef) => ipcRenderer.invoke(IPC.plugins.stageUpdate, pluginId, source, currentVersion, allowOlder, job),
      packageCommitUpdate: (pluginId: string, stagedDir: string) => ipcRenderer.invoke(IPC.plugins.commitUpdate, pluginId, stagedDir),
    },

    // ── 文件关联——扩展名→插件 ID（主进程 FileAssociationService 直答）──
    // E5.8#0d.5：壳侧补上——preload-pool 同款；设置页"以 JSON 打开"需查关联，不写死编辑器插件 ID
    fileAssociation: {
      getPluginFor: (ext: string): Promise<string | undefined> =>
        ipcRenderer.invoke(IPC.fileAssociation.getPluginFor, ext),
    },

    // ── E3a #31：插件管理（桥接——走 IpcBridge → IpcBridgeHandler → loader 函数）──
    pluginManager: {
      list:           () => ipcRenderer.invoke(IPC.plugins.call, 'list'),
      enable:         (id: string) => ipcRenderer.invoke(IPC.plugins.call, 'enable', id),
      disable:        (id: string) => ipcRenderer.invoke(IPC.plugins.call, 'disable', id),
      uninstall:      (id: string) => ipcRenderer.invoke(IPC.plugins.call, 'uninstall', id),
      // E6#73q：opts = 请求侧身份（pluginId/displayName/origin）——壳侧 job 表按 pluginId 去重 + job 行显示名
      install:        (path: string, opts?: PluginInstallRequestOpts) => ipcRenderer.invoke(IPC.plugins.call, 'install', path, opts),
      installWithProgress: (path: string, opts?: PluginInstallRequestOpts) => ipcRenderer.invoke(IPC.plugins.call, 'installWithProgress', path, opts),
      reinstall:      (id: string) => ipcRenderer.invoke(IPC.plugins.call, 'reinstall', id),
      // E6#11c/#13b（段 B）：安全更新 + 只读查更新（pluginManager 路由 → 壳 loader updatePlugin/checkPluginUpdates）
      // E6#33c（锚①）：opts.allowOlder——降级放行（版本下拉选旧版 + F2 确认后传），默认拒 <=
      update:         (id: string, opts?: { catalogUrl?: string; url?: string; allowOlder?: boolean }) => ipcRenderer.invoke(IPC.plugins.call, 'update', id, opts),
      checkUpdates:   (id: string, catalogUrl: string) => ipcRenderer.invoke(IPC.plugins.call, 'checkUpdates', id, catalogUrl),
      getDisabled:    () => ipcRenderer.invoke(IPC.plugins.call, 'getDisabled'),
      getUninstalled: () => ipcRenderer.invoke(IPC.plugins.call, 'getUninstalled'),
      isDisabled:     (id: string) => ipcRenderer.invoke(IPC.plugins.call, 'isDisabled', id),
      // E5.7#48：装/卸/重装成功 → 通知主进程全量重扫三表（plugin-manifest-loader）
      notifyManifestChanged: () => ipcRenderer.send(IPC.plugins.rescanManifests),
    },

    // ── 对话框（步 4 接入——对标 @tauri-apps/plugin-dialog）──
    dialog: {
      open: (opts?: DialogOpenOptions) => ipcRenderer.invoke(IPC.dialog.open, opts),
      // E5.8#20 D3 修复：补 openFile（对齐池 namespaces-workspace.ts:101，同通道 IPC.dialog.open）——契约必选面壳侧缺失的潜伏漂移
      openFile: (opts?: DialogOpenOptions): Promise<string | null> =>
        ipcRenderer.invoke(IPC.dialog.open, opts),
      // E5#67：确认/提示弹窗——统一 API，走 PROXY_CHANNELS → IpcBridgeHandler → DialogService
      confirm: (message: string): Promise<boolean> =>
        ipcRenderer.invoke(IPC.dialog.confirm, message),
      alert: (message: string): Promise<void> =>
        ipcRenderer.invoke(IPC.dialog.alert, message),
      // E6#71c 富内容确认——同池 buildDialog 契约镜像（双侧对齐防漂移，同链代理到壳 DialogService）
      confirmContent: (opts: DialogContentOpenOptions): Promise<boolean> =>
        ipcRenderer.invoke(IPC.dialog.confirmContent, opts),
    },

    // ── E5#71：插件持久化存储 ──
    pluginState: {
      // E5.8#20：补泛型 + `| undefined`（契约 get<T = unknown>(pluginId, key): Promise<T | undefined>）
      get: <T = unknown>(pluginId: string, key: string): Promise<T | undefined> =>
        ipcRenderer.invoke(IPC.pluginState.get, pluginId, key),
      set: (pluginId: string, key: string, value: unknown): Promise<void> =>
        ipcRenderer.invoke(IPC.pluginState.set, pluginId, key, value),
      // E5#84f：订阅变更——跨 WebView 状态同步原语
      onChange: (pluginId: string, key: string, cb: (value: unknown) => void) => {
        return events.on("plugin-state:changed", (data: PluginStateChangedPayload) => {
          if (data?.pluginId === pluginId && data?.key === key) {
            cb(data.value);
          }
        });
      },
    },

    // ── E5#69：菜单——
    menu: {
      registerItems: (menuId: string, pluginId: string, items: unknown[]) =>
        ipcRenderer.invoke(IPC.menu.registerItems, menuId, pluginId, items),
      // E5.8#20：补返回类型（契约 getItems(): Promise<MenuItemDescriptor[]>）
      getItems: (menuId: string, context?: Record<string, unknown>): Promise<MenuItemDescriptor[]> =>
        ipcRenderer.invoke(IPC.menu.getItems, menuId, context),
    },

    // ── E5.7#56：命令——壳侧插件入口模块级注册（双进程执行的壳侧半程）──
    // 插件入口模块在壳进程（glob loader）执行时经此注册：handler 存 _shellCommands 地图，
    // meta 走 commands:registerShell IPC（PROXY_CHANNELS 回壳）写入壳 CommandRegistry 真实条目，
    // 条目 handler = (token, ...args) => linkdesk.commands._executeShellLocal(id, ...args)。
    // 池侧半程走 preload-pool.commands（Bug C 补全）——两半程在壳注册表自然汇合（幂等）。
    commands: {
      // E6#111b：meta.pluginId = 注册方显式申报的真身份（可选）——归属解析的 ② 档（①= 声明面查表）
      registerCommand: (id: string, handler: (...args: unknown[]) => unknown, meta?: { title?: string; category?: string; when?: string; pluginId?: string }) => {
        _shellCommands.set(id, handler);
        ipcRenderer.invoke(IPC.commands.registerShell, id, meta ?? null).catch((e) => {
          console.error(`[preload-shell] commands:registerShell 回传失败 (${id}):`, e);
        });
      },
      /** 壳 CommandRegistry 条目的真实执行入口——registerShellLocalCommand 注册的 handler 桥 */
      _executeShellLocal: (id: string, ...args: unknown[]) => {
        const handler = _shellCommands.get(id);
        if (!handler) return Promise.reject(new Error(`命令 "${id}" 未在壳侧注册`));
        return Promise.resolve(handler(...args));
      },
    },

    // ── E5#70：ContextKey——本地同步 store + IPC 广播（多 WebView 火种）──
    contextKey: {
      set: (key: string, value: unknown) => {
        _contextKeyStore.set(key, value);
        // E5.8 回归 bug 修复：必须 return invoke Promise——合同 linkdesk-api.ts 声明 set(): Promise<void>，
        // 与 preload-pool 同款合同违反，预埋补齐（当前无调用方挂 .catch，但合同一致性防未来炸）。
        return ipcRenderer.invoke(IPC.contextKey.set, key, value);
      },
      // 供 ContextKeyService 同步读取——零延迟，解决键盘分发竞态
      _getValue: (key: string) => _contextKeyStore.get(key),
    },

    // ── E5.5#7-p2：快捷键——壳侧共享组件走 linkdesk.keybindings.*（零 @src/core import）──
    keybindings: {
      getKeybindings: () => ipcRenderer.invoke(IPC.plugins.call, 'getKeybindings'),
      getConflicts: () => ipcRenderer.invoke(IPC.plugins.call, 'getKeybindingConflicts'),
      registerKeybinding: (binding: unknown) => ipcRenderer.invoke(IPC.plugins.call, 'registerKeybinding', binding),
      saveUserKeybindings: () => ipcRenderer.invoke(IPC.plugins.call, 'saveUserKeybindings'),
      removeKeybindingForCommand: (commandId: string) => ipcRenderer.invoke(IPC.plugins.call, 'removeKeybindingForCommand', commandId),
      resetKeybindingToDefault: (commandId: string) => ipcRenderer.invoke(IPC.plugins.call, 'resetKeybindingToDefault', commandId),
      findKeybindingForCommand: (commandId: string) => ipcRenderer.invoke(IPC.plugins.call, 'findKeybindingForCommand', commandId),
      setKeybindingCaptureActive: (active: boolean) => ipcRenderer.invoke(IPC.plugins.call, 'setKeybindingCaptureActive', active),
      keyboardEventToKeyString: (e: KeyboardEvent): string => {
        // 🔥 防御：contextBridge 结构化克隆可能丢掉 KeyboardEvent 原生属性，e.key 为 undefined 时直接返回空
        if (!e?.key) return "";
        // E5.8#1b：归一化委托单一权威源（keyboardInputToKeyString 含 E5.7#79 +→= 修复）
        return keyboardInputToKeyString({
          ctrlKey: e.ctrlKey,
          shiftKey: e.shiftKey,
          altKey: e.altKey,
          metaKey: e.metaKey,
          key: e.key,
          code: e.code,
        });
      },
      onChange: (cb: () => void) => events.on("keybindings:changed", cb),
      // E5.5#7-p7：壳→主进程同步快捷键表
      syncToMainProcess: (data: KeybindingSyncData) => ipcRenderer.invoke(IPC.keyboard.syncShortcuts, data),
      // E5.5#7-p7：接收主进程转发的 before-input-event 拦截事件
      onForwardedEvent: (cb: (input: ForwardedKeyboardInput) => void) => {
        _keyboardForwardHandler = cb;
        return () => { _keyboardForwardHandler = null; };
      },
    },

    // ── E5#68：标签页操作——插件调壳的 tabs API ──
    tabs: {
      create: (type: string, opts?: Record<string, unknown>) =>
        ipcRenderer.invoke(IPC.tabs.create, type, opts),
      openOrFocus: (type: string, opts?: Record<string, unknown>) =>
        ipcRenderer.invoke(IPC.tabs.openOrFocus, type, opts),
      focus: (tabId: string) =>
        ipcRenderer.invoke(IPC.tabs.focus, tabId),
      close: (tabId: string) =>
        ipcRenderer.invoke(IPC.tabs.close, tabId),
      focusBySourceId: (sourceId: string) =>
        ipcRenderer.invoke(IPC.tabs.focusBySourceId, sourceId),
      updateLabelBySourceId: (sourceId: string, label: string) =>
        ipcRenderer.invoke(IPC.tabs.updateLabelBySourceId, sourceId, label),
      closeBySourceId: (sourceId: string) =>
        ipcRenderer.invoke(IPC.tabs.closeBySourceId, sourceId),
    },
    p2p: {
      send: (target: string, channel: string, data: unknown) => {
        ipcRenderer.send(IPC.p2p.send, { target, channel, data });
      },
      on: (channel: string, cb: (data: unknown) => void) =>
        listenDirect(ipcRenderer, IPC.p2p.data, (d: { channel: string; data: unknown }) => {
          if (d.channel === channel) cb(d.data);
        }),
    },
    clipboard: {
      // E5.8#20 D2 修复：补 readText（对齐池 namespaces-data.ts：66）——契约必选面壳侧缺失，调用即崩的潜伏漂移
      readText: () => ipcRenderer.invoke(IPC.clipboard.readText),
      writeText: (text: string) => ipcRenderer.invoke(IPC.clipboard.writeText, text),
      writeFileList: (paths: string[]) => ipcRenderer.invoke(IPC.clipboard.writeFileList, paths),
    },
    // ── Shell（E4V#18-#19——revealInOS / openInTerminal / startDrag / E6#73j relaunch）──
    shell: {
      showItemInFolder:(p: string) => ipcRenderer.invoke(IPC.shell.showItemInFolder, p),
      // E5#22: 第二参数 terminalExe + 第三参数 customCommand 由调用方从 ConfigurationService 读取后传入
      openInTerminal:  (dirPath: string, terminalExe?: string, customCommand?: string) => ipcRenderer.invoke(IPC.shell.openInTerminal, dirPath, terminalExe, customCommand),
      // E5#108c：拖出到桌面
      startDrag: (filePath: string, iconPath?: string) => ipcRenderer.send(IPC.shell.startDrag, filePath, iconPath),
      // E6#78：插件磁盘位置 / 打开插件目录（主进程解析路径）
      pluginLocation: (pluginId: string) => ipcRenderer.invoke(IPC.shell.pluginLocation, pluginId),
      openPluginFolder: (pluginId: string, kind: PluginFolderKind) => ipcRenderer.invoke(IPC.shell.openPluginFolder, pluginId, kind),
      // E6#73j（G4）：真重启应用——壳 preload 独有（池不需要自己重启宿主，见 linkdesk-api/shell.ts 注释）
      relaunch: () => ipcRenderer.invoke(IPC.shell.relaunch),
      // E6#46b：intake 订阅——shell 命名空间上的壳内私有扩展（工厂返回走结构兼容，同 buildShellApp 先例）
      ...buildShellIntakeExtras(),
    },
    // ── 外观资产（E5.8#153：壳侧命令执行用——齿轮命令 handler 跑在壳进程，池 appearance 面不注入壳）──
    appearance: {
      revealStorage: () => ipcRenderer.invoke(IPC.appearance.revealStorage),
    },
    // ── 环境信息（E2c #13b——对标 VS Code ExtensionContext）──
    env: {
      get: (pluginId?: string) => ipcRenderer.invoke(IPC.env.get, pluginId),
    },
    // ── 产品身份（E6#57.2b——壳侧读宿主版本号/产品信息；关于页 E6#57.14 数据源）──
    app: buildShellApp(),

    // ── 主软件更新（E6#57.8——只读 getState 进契约 + 写命令壳内私有扩展）──
    update: buildShellUpdate(),


    // ── 事件（E2a #5 心跳 + E3j #77a on/emit 归一化）──
    events: {
      ...events, // on + emit 由 createEventSystem() 提供
      heartbeat: () => ipcRenderer.send(IPC.app.heartbeat),
      notifyTheme: (isDark: boolean) => ipcRenderer.send(IPC.theme.changed, isDark),
    },

    // ── E3a #26-#27：bridge——壳侧处理插件 IPC 请求/推送的中继 API ──
    bridge: {
      // React 侧 IpcBridgeHandler 注册请求处理器（#26）——缓冲回放由 IpcRelay 承担（E5.7#78）
      onRequest: (cb: (req: BridgeRequestPayload) => void) =>
        _bridgeRequestRelay.onReady(cb),
      // React 侧 IpcBridgeHandler 响应请求（#26）
      respond: (requestId: string, result?: unknown, error?: string) => {
        ipcRenderer.send(IPC.bridge.response, { requestId, result, error });
      },
      // E3b #35 → E5.7#43：广播到唯一 Pool——主题切换、语言切换等全局事件
      broadcast: (channel: string, payload: unknown) => {
        ipcRenderer.send(IPC.bridge.broadcast, { channel, payload });
      },
      // 通知主进程配置变更——SettingsView 直调 setConfigurationValue 时绕过了 IPC proxy
      notifyConfigChanged: (key: string, value: unknown) => {
        ipcRenderer.send(IPC.config.changedNotify, { key, value });
      },
    },

    // ── E5.6#8c → E5.7#4：pool API——壳推送布局到唯一池、监听池就绪 ──
    pool: {
      /** 推送布局到唯一 Pool——单 WCV 直推（E5.7#4） */
      // E5.8#43-2：windowId 可选——缺省 'main'。壳据窗口注册表定向推送（脱出窗 = 壳生成 id）
      pushLayout: (layout: PoolLayout, windowId?: string) => ipcRenderer.send(IPC.pool.pushLayout, layout, windowId),
      /** 监听池就绪——回调收 windowId（E5.8#43-1 A3：主池='main'，脱出池=壳生成 id，壳据 id 定向推该窗布局）。返回 unsubscribe */
      onReady: (cb: (windowId: string) => void) => {
        const handler = (_event: unknown, payload: PoolReadyPayload) => {
          try { cb(payload?.windowId ?? 'main'); } catch { /* contextBridge 回调静默失败 */ }
        };
        ipcRenderer.on(IPC.pool.ready, handler);
        return () => ipcRenderer.removeListener(IPC.pool.ready, handler);
      },
      /** E5.6#9 → E5.7#4：切换 Pool DevTools——调试用，仅 dev 模式生效 */
      toggleDevTools: () => ipcRenderer.send(IPC.pool.toggleDevTools),
      /** E5.6#11j：注册侧栏操作回调——池→壳→ViewContainerService。返回 unsubscribe */
      onSidebarAction: (cb: (action: SidebarAction) => void) => {
        _sidebarActionHandler = cb;
        return () => { _sidebarActionHandler = null; };
      },
      /** E5.6#16.5：注册主区 tab 操作回调——池→壳→useTabManager（E5.8#44-B：载荷 = ShellTabAction，含 sourceWindowId）。返回 unsubscribe */
      onTabAction: (cb: (action: ShellTabAction) => void) => {
        _tabActionHandler = cb;
        return () => { _tabActionHandler = null; };
      },
      /** E5.8#44-B：注册 TabBar rects 上报回调——池→壳→吸附命中注册表（windowRelocation.handleTabBarRects）。返回 unsubscribe */
      onTabBarRects: (cb: (payload: TabBarRectsPayload) => void) => {
        _tabBarRectsHandler = cb;
        return () => { _tabBarRectsHandler = null; };
      },
      /** E5.8#44-C：注册拖拽位置上报回调——池→壳→吸附命中检测（windowRelocation.handleDragPosition，排除源窗）。返回 unsubscribe */
      onDragPosition: (cb: (pos: ShellTabDragPosition) => void) => {
        _dragPositionHandler = cb;
        return () => { _dragPositionHandler = null; };
      },
      /** E5.8#46.10：注册吸附插入缝隙回传回调——池→壳→吸附注册表（windowRelocation.handleAdsorbIndex，释放并窗精确落位）。返回 unsubscribe */
      onAdsorbIndex: (cb: (payload: AdsorbIndexPayload) => void) => {
        _adsorbIndexHandler = cb;
        return () => { _adsorbIndexHandler = null; };
      },
      /** E5.8#44-C：推送吸附提示到目标窗——壳命中解析出 targetWindowId 后定向推送（目标窗 TabBar 插入指示/清除；#46.10 载荷带 viewport 坐标） */
      pushAdsorbHint: (hint: AdsorbHintPayload, windowId: string) =>
        ipcRenderer.send(IPC.pool.adsorbHint, hint, windowId),
      /** E5.7#15：推送 QuickPick 哑渲染数据到池——壳 QuickPickService 序列化后直推（聪慧→哑） */
      pushQuickPick: (data: unknown) => ipcRenderer.send(IPC.pool.quickpickShow, data),
      /** E5.7#15：注册 QuickPick 动作回调——池→壳→QuickPickService。返回 unsubscribe */
      onQuickPickAction: (cb: (action: PoolQuickPickAction) => void) => {
        _quickPickActionHandler = cb;
        return () => { _quickPickActionHandler = null; };
      },
      /** E5.7#17：推送 Dialog 哑渲染数据到池——壳 DialogService 桥序列化后直推（聪慧→哑） */
      pushDialog: (data: unknown) => ipcRenderer.send(IPC.pool.dialogShow, data),
      /** E5.7#17：注册 Dialog 动作回调——池→壳→DialogService 桥。返回 unsubscribe */
      onDialogAction: (cb: (action: PoolDialogAction) => void) => {
        _dialogActionHandler = cb;
        return () => { _dialogActionHandler = null; };
      },
      /** E5.8#37（Phase 8 类型 B）：推送悬浮面板哑渲染数据到池——壳 FloatingPanelService 桥序列化后直推（聪慧→哑） */
      pushFloatingPanel: (data: unknown) => ipcRenderer.send(IPC.pool.floatingPanelShow, data),
      /** E5.8#37：注册悬浮面板动作回调——池→壳→FloatingPanelService 桥。返回 unsubscribe */
      onFloatingPanelAction: (cb: (action: PoolFloatingPanelAction) => void) => {
        _floatingPanelActionHandler = cb;
        return () => { _floatingPanelActionHandler = null; };
      },
      /** E5.7#39：注册内存压力回调——主进程→壳→toast 服务。返回 unsubscribe */
      onMemoryPressure: (cb: (data: MemoryPressureData) => void) => {
        _memoryPressureHandler = cb;
        return () => { _memoryPressureHandler = null; };
      },
      // ── E5.8#43-1（A4）：多窗口底座——创建/关闭池窗 + 监听 OS 关窗（壳驱动，主进程执行窗口生命周期）──
      /** 壳→主：创建脱出池窗——windowId 壳生成（tab 归属），bounds 可选。tab 内容随后 pushLayout 定向该 windowId */
      createWindow: (opts: CreatePoolWindowRequest) => ipcRenderer.send(IPC.pool.createWindow, opts),
      /** 壳→主：关闭脱出池窗——空窗自灭/并回主窗口销毁（tab 归属已由壳先行处理） */
      closeWindow: (windowId: string) => ipcRenderer.send(IPC.pool.closeWindow, windowId),
      /** 主→壳：监听池窗被 OS 关闭（用户点 ×/系统关窗）——回调收 windowId，壳按窗口策略处理 tab。返回 unsubscribe */
      onWindowClosed: (cb: (windowId: string) => void) => {
        const handler = (_event: unknown, payload: PoolWindowClosedPayload) => {
          try { cb(payload?.windowId ?? ''); } catch { /* contextBridge 回调静默失败 */ }
        };
        ipcRenderer.on(IPC.pool.windowClosed, handler);
        return () => ipcRenderer.removeListener(IPC.pool.windowClosed, handler);
      },
      /** E5.8#43-3：主→壳 监听池窗位置/大小变更（moved/resized 上报 + #46.11 preloadReady seed）——壳注册表更新 + 落盘浮窗位置（I9-14）。返回 unsubscribe */
      onWindowBoundsChanged: (cb: (payload: PoolWindowBoundsPayload) => void) => _windowBoundsRelay.onReady(cb),
    },

    // ── E3f #52f：窗口控制——TitleBar 的自定义 ─ □ × 按钮（E5.8#20 共享模块——双端同版，防 setZoom 类漂移）──
    window: buildWindow(),
  } satisfies ShellExposed;

  contextBridge.exposeInMainWorld(APP_NAMESPACE, shellExposed);

  // 通知主进程 preload 加载成功
  // 为什么：新风险 3——preload 抛异常不进 ErrorBoundary。主进程需要知道
  // window.linkdesk 是否成功暴露，否则所有调用白屏无诊断
  ipcRenderer.send(IPC.app.preloadReady);
} catch (err) {
  // preload 失败时暴露诊断信息——比白屏好
  // 渲染进程 App.tsx 最早执行时会检查此字段
  contextBridge.exposeInMainWorld('__linkdesk_preload_error__', {
    message: String(err),
  });
  console.error('[preload-shell] 暴露 window.linkdesk 失败:', err);
}
