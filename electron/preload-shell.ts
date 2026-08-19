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
// ── E5.7#97：wire 契约归口——preload 边界载荷全部从 src/core/types/ipc/ import type ──
import type { PoolLayout } from '../src/core/types/pool/poolLayout';
import type { PoolTabAction } from '../src/core/types/ipc/tabActions';
import type { SidebarAction } from '../src/core/types/ipc/sidebarActions';
import type { KeyboardInput, KeybindingSyncData } from '../src/core/types/ipc/keyboard';
import type { OpenPortConfig, SerialStats } from '../src/core/types/ipc/serial';
import type { DialogOpenOptions } from '../src/core/types/ipc/dialogs';
import type { ConfigurationChangedPayload, PluginStateChangedPayload } from '../src/core/types/ipc/events';
import type { BridgeRequestPayload } from '../src/core/types/ipc/bridge';
import type { PoolQuickPickAction, PoolToastAction, PoolDialogAction, MemoryPressureData } from '../src/core/types/ipc/poolActions';
import type { FileChangeEvent } from '../src/core/services/files/FileService';
// E5.8#1b：keybinding 归一化集中——主进程/壳/池三端共用单一权威源（防 E5.7#79 漂移复发）
import { keyboardInputToKeyString } from '../src/core/utils/keybindingNormalization.js';

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

// ── E5.7#56：壳侧命令 handler 地图——插件入口模块双进程执行（壳 glob loader + 池视图渲染）──
// 壳进程执行时 registerCommand 传入的 handler 是页面世界函数（contextBridge 双向代理，
// 隔离世界可调用——preload-pool _poolCommands 同款机制）。壳 CommandRegistry 条目执行时
// 经 window.linkdesk.commands._executeShellLocal 桥回此处。
const _shellCommands = new Map<string, (...args: unknown[]) => unknown>();

// E5.5#7-p6：键盘路由——接收主进程 before-input-event 转发的快捷键
let _keyboardForwardHandler: ((input: KeyboardInput) => void) | null = null;
ipcRenderer.on(IPC.keyboard.executeShortcut, (_event, input: KeyboardInput) => {
  if (_keyboardForwardHandler) _keyboardForwardHandler(input);
});

// E5.6#11j：侧栏操作回调——池→主进程→壳，壳侧 React 注册 handler 调 ViewContainerService
let _sidebarActionHandler: ((action: SidebarAction) => void) | null = null;
ipcRenderer.on(IPC.pool.sidebarAction, (_event, action: SidebarAction) => {
  if (_sidebarActionHandler) _sidebarActionHandler(action);
});

// E5.6#16.5：主区 tab 操作回调——池→主进程→壳，壳侧 React 注册 handler 调 useTabManager
let _tabActionHandler: ((action: PoolTabAction) => void) | null = null;
ipcRenderer.on(IPC.pool.tabAction, (_event, action: PoolTabAction) => {
  if (_tabActionHandler) _tabActionHandler(action);
});

// E5.7#15：QuickPick 动作回调——池→主进程→壳，壳侧 React 注册 handler 调 QuickPickService
let _quickPickActionHandler: ((action: PoolQuickPickAction) => void) | null = null;
ipcRenderer.on(IPC.pool.quickpickAction, (_event, action: PoolQuickPickAction) => {
  if (_quickPickActionHandler) _quickPickActionHandler(action);
});

// E5.7#16：Toast 动作回调——池→主进程→壳，壳侧 React 注册 handler 调 toast 服务
let _toastActionHandler: ((action: PoolToastAction) => void) | null = null;
ipcRenderer.on(IPC.pool.toastAction, (_event, action: PoolToastAction) => {
  if (_toastActionHandler) _toastActionHandler(action);
});

// E5.7#17：Dialog 动作回调——池→主进程→壳，壳侧 React 注册 handler 调 DialogService 桥
let _dialogActionHandler: ((action: PoolDialogAction) => void) | null = null;
ipcRenderer.on(IPC.pool.dialogAction, (_event, action: PoolDialogAction) => {
  if (_dialogActionHandler) _dialogActionHandler(action);
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

try {
  contextBridge.exposeInMainWorld(APP_NAMESPACE, {
    /** OS 拖入——从 File 对象取真实路径。Electron 43 contextIsolation 下 File.path 为空，必须走 webUtils。 */
    getFilePath: (file: File) => webUtils.getPathForFile(file),

    // ── 串口（步 2 接入）──
    serial: {
      listPorts:  ()                    => ipcRenderer.invoke(IPC.serial.listPorts),
      getStatus:  ()                    => ipcRenderer.invoke(IPC.serial.getStatus),
      openPort:   (cfg: OpenPortConfig)  => ipcRenderer.invoke(IPC.serial.openPort, cfg),
      closePort:  ()                    => ipcRenderer.invoke(IPC.serial.closePort),
      sendData:   (data: number[])      => ipcRenderer.invoke(IPC.serial.sendData, data),
      sendText:   (text: string, enc: string) => ipcRenderer.invoke(IPC.serial.sendText, text, enc),
      setDtr:     (enable: boolean)     => ipcRenderer.invoke(IPC.serial.setDtr, enable),
      setRts:     (enable: boolean)     => ipcRenderer.invoke(IPC.serial.setRts, enable),
      // 数据推送监听——对标 Tauri listen("serial-data/stats/system")
      onData:     (cb: (text: string) => void)      => listenDirect(ipcRenderer, IPC.serial.data, cb),
      onStats:    (cb: (stats: SerialStats) => void) => listenDirect(ipcRenderer, IPC.serial.stats, cb),
      onSystem:   (cb: (message: string) => void)    => listenDirect(ipcRenderer, IPC.serial.system, cb),
    },

    // ── 文件系统（步 3 接入——对标 @tauri-apps/plugin-fs）──
    filesystem: {
      readTextFile:  (p: string)           => ipcRenderer.invoke(IPC.filesystem.readTextFile, p),
      writeTextFile: (p: string, d: string) => ipcRenderer.invoke(IPC.filesystem.writeTextFile, p, d),
      exists:        (p: string)           => ipcRenderer.invoke(IPC.filesystem.exists, p),
      createDir:     (p: string)           => ipcRenderer.invoke(IPC.filesystem.createDir, p),
      readdir:       (p: string)           => ipcRenderer.invoke(IPC.filesystem.readdir, p),
      copy:          (src: string, dest: string) => ipcRenderer.invoke(IPC.filesystem.copy, src, dest),
      remove:        (p: string)           => ipcRenderer.invoke(IPC.filesystem.remove, p),
      // E2c #13 新增：listDir / readBinaryFile / watch
      listDir:       (p: string)           => ipcRenderer.invoke(IPC.filesystem.listDir, p),
      readBinaryFile:(p: string)           => ipcRenderer.invoke(IPC.filesystem.readBinaryFile, p),
      // E4V#40w——GBK 编码保存
      writeBinaryFile:(p: string, d: Uint8Array) => ipcRenderer.invoke(IPC.filesystem.writeBinaryFile, p, d),
      // E4V#fix: watch 一步完成——内部走 filesystem:changed:${watcherId}，自动隔离
      watch: (dirPath: string, onEvent: (e: { path: string; type: string }) => void) => {
        return ipcRenderer.invoke(IPC.filesystem.watch, dirPath).then((watcherId: number) => {
          const channel = filesystemChanged(watcherId);
          const handler = (_event: Electron.IpcRendererEvent, change: FileChangeEvent) => onEvent(change);
          ipcRenderer.on(channel, handler);
          return () => {
            ipcRenderer.removeListener(channel, handler);
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
      listDisabledDirs: () => ipcRenderer.invoke(IPC.plugins.listDisabledDirs),
      readManifest:     (id: string) => ipcRenderer.invoke(IPC.plugins.readManifest, id),
      resolvePath:      (id: string) => ipcRenderer.invoke(IPC.plugins.resolvePath, id),
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
      install:        (path: string) => ipcRenderer.invoke(IPC.plugins.call, 'install', path),
      reinstall:      (id: string) => ipcRenderer.invoke(IPC.plugins.call, 'reinstall', id),
      getDisabled:    () => ipcRenderer.invoke(IPC.plugins.call, 'getDisabled'),
      getUninstalled: () => ipcRenderer.invoke(IPC.plugins.call, 'getUninstalled'),
      isDisabled:     (id: string) => ipcRenderer.invoke(IPC.plugins.call, 'isDisabled', id),
      // E5.7#48：装/卸/重装成功 → 通知主进程全量重扫三表（plugin-manifest-loader）
      notifyManifestChanged: () => ipcRenderer.send(IPC.plugins.rescanManifests),
    },

    // ── 对话框（步 4 接入——对标 @tauri-apps/plugin-dialog）──
    dialog: {
      open: (opts?: DialogOpenOptions) => ipcRenderer.invoke(IPC.dialog.open, opts),
      // E5#67：确认/提示弹窗——统一 API，走 PROXY_CHANNELS → IpcBridgeHandler → DialogService
      confirm: (message: string): Promise<boolean> =>
        ipcRenderer.invoke(IPC.dialog.confirm, message),
      alert: (message: string): Promise<void> =>
        ipcRenderer.invoke(IPC.dialog.alert, message),
    },

    // ── E5#71：插件持久化存储 ──
    pluginState: {
      get: (pluginId: string, key: string): Promise<unknown> =>
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
      getItems: (menuId: string, context?: Record<string, unknown>): Promise<unknown[]> =>
        ipcRenderer.invoke(IPC.menu.getItems, menuId, context),
    },

    // ── E5.7#56：命令——壳侧插件入口模块级注册（双进程执行的壳侧半程）──
    // 插件入口模块在壳进程（glob loader）执行时经此注册：handler 存 _shellCommands 地图，
    // meta 走 commands:registerShell IPC（PROXY_CHANNELS 回壳）写入壳 CommandRegistry 真实条目，
    // 条目 handler = (token, ...args) => linkdesk.commands._executeShellLocal(id, ...args)。
    // 池侧半程走 preload-pool.commands（Bug C 补全）——两半程在壳注册表自然汇合（幂等）。
    commands: {
      registerCommand: (id: string, handler: (...args: unknown[]) => unknown, meta?: { title?: string; category?: string; when?: string }) => {
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
      onForwardedEvent: (cb: (input: KeyboardInput) => void) => {
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
      writeText: (text: string) => ipcRenderer.invoke(IPC.clipboard.writeText, text),
      writeFileList: (paths: string[]) => ipcRenderer.invoke(IPC.clipboard.writeFileList, paths),
    },
    // ── Shell（E4V#18-#19——revealInOS / openInTerminal / startDrag）──
    shell: {
      showItemInFolder:(p: string) => ipcRenderer.invoke(IPC.shell.showItemInFolder, p),
      // E5#22: 第二参数 terminalExe + 第三参数 customCommand 由调用方从 ConfigurationService 读取后传入
      openInTerminal:  (dirPath: string, terminalExe?: string, customCommand?: string) => ipcRenderer.invoke(IPC.shell.openInTerminal, dirPath, terminalExe, customCommand),
      // E5#108c：拖出到桌面
      startDrag: (filePath: string, iconPath?: string) => ipcRenderer.send(IPC.shell.startDrag, filePath, iconPath),
    },
    // ── 环境信息（E2c #13b——对标 VS Code ExtensionContext）──
    env: {
      get: (pluginId?: string) => ipcRenderer.invoke(IPC.env.get, pluginId),
    },

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
      pushLayout: (layout: PoolLayout) => ipcRenderer.send(IPC.pool.pushLayout, layout),
      /** 监听池就绪（E5.7#54：zone 过滤已删——单 Pool）。返回 unsubscribe */
      onReady: (cb: () => void) => {
        const handler = () => {
          try { cb(); } catch { /* contextBridge 回调静默失败 */ }
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
      /** E5.6#16.5：注册主区 tab 操作回调——池→壳→useTabManager。返回 unsubscribe */
      onTabAction: (cb: (action: PoolTabAction) => void) => {
        _tabActionHandler = cb;
        return () => { _tabActionHandler = null; };
      },
      /** E5.7#15：推送 QuickPick 哑渲染数据到池——壳 QuickPickService 序列化后直推（聪慧→哑） */
      pushQuickPick: (data: unknown) => ipcRenderer.send(IPC.pool.quickpickShow, data),
      /** E5.7#15：注册 QuickPick 动作回调——池→壳→QuickPickService。返回 unsubscribe */
      onQuickPickAction: (cb: (action: PoolQuickPickAction) => void) => {
        _quickPickActionHandler = cb;
        return () => { _quickPickActionHandler = null; };
      },
      /** E5.7#16：推送 Toast 哑渲染数据到池——壳 toast 服务序列化后直推（聪慧→哑） */
      pushToast: (data: unknown) => ipcRenderer.send(IPC.pool.toastShow, data),
      /** E5.7#16：注册 Toast 动作回调——池→壳→toast 服务。返回 unsubscribe */
      onToastAction: (cb: (action: PoolToastAction) => void) => {
        _toastActionHandler = cb;
        return () => { _toastActionHandler = null; };
      },
      /** E5.7#17：推送 Dialog 哑渲染数据到池——壳 DialogService 桥序列化后直推（聪慧→哑） */
      pushDialog: (data: unknown) => ipcRenderer.send(IPC.pool.dialogShow, data),
      /** E5.7#17：注册 Dialog 动作回调——池→壳→DialogService 桥。返回 unsubscribe */
      onDialogAction: (cb: (action: PoolDialogAction) => void) => {
        _dialogActionHandler = cb;
        return () => { _dialogActionHandler = null; };
      },
      /** E5.7#39：注册内存压力回调——主进程→壳→toast 服务。返回 unsubscribe */
      onMemoryPressure: (cb: (data: MemoryPressureData) => void) => {
        _memoryPressureHandler = cb;
        return () => { _memoryPressureHandler = null; };
      },
    },

    // ── E3f #52f：窗口控制——TitleBar 的自定义 ─ □ × 按钮 ──
    window: {
      minimize:  () => ipcRenderer.send(IPC.window.minimize),
      maximize:  () => ipcRenderer.send(IPC.window.maximize),
      unmaximize:() => ipcRenderer.send(IPC.window.unmaximize),
      close:     () => ipcRenderer.send(IPC.window.close),
      // E5.7#79：缩放因子 → 主进程 setZoomFactor(池 WCV)。壳配置 window.zoomLevel onApply 调用
      setZoom:   (factor: number) => ipcRenderer.send(IPC.window.setZoom, factor),
      toggleDevTools: () => ipcRenderer.invoke(IPC.window.toggleDevTools), // E3f #58
      isMaximized:() => ipcRenderer.invoke(IPC.window.isMaximized),
      onMaximizeChange: (cb: (maximized: boolean) => void) =>
        listenDirect(ipcRenderer, IPC.window.maximizeChange, (m: boolean) => cb(m)),
    },
  });

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
