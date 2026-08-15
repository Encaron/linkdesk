/**
 * Pool WebView preload 脚本——E5.6#11.5a。
 *
 * Path B：池 = 哑渲染器，壳 = 唯一真相源。池不 import 任何 @src/core/* 模块。
 * 所有核心服务走 window.linkdesk.* → IPC → 壳唯一真相源。
 *
 * API 表面 = 插件侧唯一 preload（E5.7#44：preload-plugin.ts 已删——本文即插件 API 规范载体）
 *         + 池侧命令注册表（registerCommand/unregisterCommands）
 *         + 扩展 workspace API + fileAssociation + search + decorations + encoding + viewContainer
 *
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * 🔥🔥🔥 IPC 通道铁律——新 AI / 任何人修改此文件前必读（E5.5#7b）
 *       E5.7#44：preload-plugin.ts 已删——其文件头铁律原文本迁入此处，本文即唯一载体
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *
 * 池渲染进程（插件）接收壳推送事件的通道只有两种。选错 = 静默失效（不报错，事件永远收不到）。
 *
 * 铁律 1：IpcBridge.broadcast 推送 → 池侧 events.on(channel, cb)
 *   壳侧：IpcBridge.broadcast('config:changed', payload)
 *        → view.webContents.send('plugin:push', {channel, payload})
 *   池侧必须：events.on('config:changed', cb)——内部注册 ipcRenderer.on('plugin:push', handler)
 *        → handler 匹配 data.channel → 调 cb
 *   ✅ 正确：configuration.onChange → events.on('config:changed', cb)
 *   ✅ 正确：pluginState.onChange  → events.on('plugin-state:changed', cb)
 *   ✅ 正确：theme.onChange（通过 extraHandlers）
 *   ❌ 错误：listenDirect(ipcRenderer, 'config:changed', cb)
 *           → 监听直接 IPC 通道，但事件在 'plugin:push' 上到达 → 永远收不到。不报错。静默失效。
 *
 * 铁律 2：主进程直接 send → 池侧 listenDirect(ipcRenderer, channel, cb)
 *   主进程：view.webContents.send('serial:data', payload)（不经 plugin:push 包装，直发池 WebView）
 *   ✅ 正确：serial.onData  → listenDirect(ipcRenderer, 'serial:data', cb)
 *   ✅ 正确：serial.onStats → listenDirect(ipcRenderer, 'serial:stats', cb)
 *   ✅ 正确：p2p.on         → listenDirect(ipcRenderer, 'p2p:data', cb)
 *
 * 铁律 3：event-system.ts 的 listenDirect 会对已知 plugin:push 通道打印 error
 *   新加直接通道 → channel 名加 `:direct` 后缀以跳过告警
 *
 * 快速自查（新加 IPC 订阅时问自己 3 个问题）：
 *   Q1: 壳侧谁发这个事件？→ IpcBridge.broadcast() 还是 view.webContents.send()？
 *   Q2: 经过 plugin:push 分发吗？→ broadcast → 是（用 events.on）；直发 → 否（用 listenDirect）
 *   Q3: 有模块级缓存防竞态吗？→ React mount 前事件可能已到达 → 需缓冲 + onXxx 时立即回放
 *
 * 📖 完整根因分析 + 审计：docs/02-Electron架构/E5.5_多WebView恢复/02-IPC事件推送-插件WebView修复.md
 *
 * 🔒 安全边界（contextBridge 白名单）：
 *   ✅ serial / config / commands / filesystem / clipboard / env
 *   ✅ events / pluginManager / theme / language / keybindings / pluginState
 *   ✅ menu / contextKey / tabs / p2p / dialog / path / notifications
 *   ✅ window（E5.7#5：TitleBarZone 窗口控制——从 preload-shell 同款搬入）
 *   ✅ workspace（扩展）/ fileAssociation / search / decorations / encoding / viewContainer
 *   ✅ hotExit（E5.7#38：Hot Exit 备份——save/load/clear，主进程落盘）
 *   ✅ lsp / langDef（E5.6#14-fix/#14-lsp：编辑器在池内渲染——preload-shell 同款面迁入）
 *   ❌ pluginInstance / pluginViews / pluginRequest（per-tab 概念，不适用于池）
 */

import { contextBridge, ipcRenderer, webUtils } from 'electron';
import { APP_NAMESPACE } from './constants';
import { createEventSystem, listenDirect } from './event-system';

// ── 池 zone 识别——URL query ?zone=sidebar|main ──
const _poolZone = new URLSearchParams(globalThis.location?.search ?? '').get('zone') ?? '';

// ── E5.6#8b：pool:layout 缓冲回放——IPC 可能在 React mount 前到达 ──
const _layoutBuffer: any[] = [];
let _onLayoutCallback: ((layout: any) => void) | null = null;
let _onLayoutActive = false;

ipcRenderer.on('pool:layout', (_event, layout: any) => {
  if (!_onLayoutActive || !_onLayoutCallback) {
    _layoutBuffer.push(layout);
  } else {
    try { _onLayoutCallback(layout); } catch { /* contextBridge 回调静默失败 */ }
  }
});

// ── E5.7#15：pool:quickpick 缓冲回放——QuickPick 哑渲染数据可能在 QuickPickHost mount 前到达 ──
// 对标 pool:layout 模式（硬约束 20）：模块顶层注册 + 缓冲 + onShow 回放。
// 只保留最后一份（浮动层是单例态——open/close 全量替换，旧数据回放无意义）。
// DTO 形状与 src/core/types/poolQuickPick.ts 对齐——preload 不 import src（构建边界）。
type PoolQuickPickDataShape = { open: boolean; placeholder?: string; prefix?: string; items?: unknown[] };
const _quickPickBuffer: PoolQuickPickDataShape[] = [];
let _quickPickCallback: ((data: PoolQuickPickDataShape) => void) | null = null;
let _quickPickActive = false;

ipcRenderer.on('pool:quickpick', (_event, data: PoolQuickPickDataShape) => {
  if (!_quickPickActive || !_quickPickCallback) {
    _quickPickBuffer.length = 0;
    _quickPickBuffer.push(data);
  } else {
    try { _quickPickCallback(data); } catch { /* contextBridge 回调静默失败 */ }
  }
});

// ── E5.7#16：pool:toast 缓冲回放——Toast 哑渲染数据可能在 ToastHost mount 前到达 ──
// 对标 pool:quickpick 模式（硬约束 20）：模块顶层注册 + 缓冲 + onShow 回放。
// 只保留最后一份（全量快照语义——新快照整体取代旧快照，回放旧数据无意义）。
// DTO 形状与 src/core/types/poolToast.ts 对齐——preload 不 import src（构建边界）。
type PoolToastDataShape = { toasts: unknown[]; suppressed: boolean };
const _toastBuffer: PoolToastDataShape[] = [];
let _toastCallback: ((data: PoolToastDataShape) => void) | null = null;
let _toastActive = false;

ipcRenderer.on('pool:toast', (_event, data: PoolToastDataShape) => {
  if (!_toastActive || !_toastCallback) {
    _toastBuffer.length = 0;
    _toastBuffer.push(data);
  } else {
    try { _toastCallback(data); } catch { /* contextBridge 回调静默失败 */ }
  }
});

// ── E5.7#17：pool:dialog 缓冲回放——Dialog 哑渲染数据可能在 DialogHost mount 前到达 ──
// 对标 pool:quickpick 模式（硬约束 20）：模块顶层注册 + 缓冲 + onShow 回放。
// 只保留最后一份（单例态——open/close 全量替换，旧数据回放无意义）。
// DTO 形状与 src/core/types/poolDialog.ts 对齐——preload 不 import src（构建边界）。
type PoolDialogDataShape = { open: boolean; title?: string; message?: string; confirmLabel?: string; cancelLabel?: string; isAlert?: boolean };
const _dialogBuffer: PoolDialogDataShape[] = [];
let _dialogCallback: ((data: PoolDialogDataShape) => void) | null = null;
let _dialogActive = false;

ipcRenderer.on('pool:dialog', (_event, data: PoolDialogDataShape) => {
  if (!_dialogActive || !_dialogCallback) {
    _dialogBuffer.length = 0;
    _dialogBuffer.push(data);
  } else {
    try { _dialogCallback(data); } catch { /* contextBridge 回调静默失败 */ }
  }
});

// ── E5.7#37：心跳 pong——主进程 5s ping，模块顶层自动回复 ──
// 硬约束 20：模块顶层注册（contextBridge.exposeInMainWorld 之前）。
// 刻意不经 React/命名空间 API：pong 必须在 React mount 前就存在——池加载窗口（主进程
// 10s 超时）内 preload 一旦执行即可回复，否则加载中的池被心跳误判卡死误杀。
// 主线程阻塞时事件循环停转，pong 自然停发 = 卡死信号（这正是心跳要检测的）。
// 池命名空间不暴露 onPing 消费 API——零消费方即死代码（无死代码原则），需要时再加。
ipcRenderer.on('pool:ping', () => {
  ipcRenderer.send('pool:pong');
});

// ── E5#19b fix: ContextKey 本地同步 store——IPC 回路延迟致键盘分发读不到最新值 ──
const _contextKeyStore = new Map<string, unknown>();
ipcRenderer.on('contextKey:changed', (_event, { key, value }: { key: string; value: unknown }) => {
  _contextKeyStore.set(key, value);
});

// ── E5.5#7a: 配置缓存——防 React mount 前事件竞态 ──
const _configCache = new Map<string, unknown>();
ipcRenderer.on('plugin:push', (_event, data: any) => {
  if (data?.channel === 'config:changed') {
    const { key, value } = data.payload as { key: string; value: any };
    _configCache.set(key, value);
  }
});

// ── E5.6#11.5a：池侧命令注册表——Path B 关键设计 ──
// 池内插件需要注册命令（file-tree ~20 + marketplace ~5 + serial-monitor ~5）。
// handler 是函数闭包——引用池侧 React state/DOM，壳无法执行。
// 因此池 preload 在 contextBridge 隔离世界内维护 Map<string, Function>。
// executeCommand 先查池侧注册表，未找到则 fallback 到壳侧 IPC。
const _poolCommands = new Map<string, Function>();

try {
  // ── 语言资源缓存 ──
  let _langCache: { lang: string; resources: Record<string, unknown> } | null = null;
  const _langSubscribers = new Set<(data: { lang: string; resources: Record<string, unknown> }) => void>();

  const events = createEventSystem(ipcRenderer, {
    logPrefix: 'preload-pool',
    extraHandlers: {
      'theme:changed': (payload) => {
        const { themeType, variables } = payload as any;
        try {
          const root = document.documentElement;
          root.setAttribute('data-theme', themeType ?? 'dark');
          for (const [k, v] of Object.entries(variables as Record<string, string>)) {
            root.style.setProperty(`--${k}`, v);
          }
        } catch (e) {
          console.error('[preload-pool] theme:changed CSS 注入失败:', e);
        }
      },
      'accent:changed': (payload) => {
        const { variables } = payload as any;
        try {
          const root = document.documentElement;
          for (const [k, v] of Object.entries(variables as Record<string, string>)) {
            root.style.setProperty(k, v);
          }
        } catch (e) {
          console.error('[preload-pool] accent:changed CSS 注入失败:', e);
        }
      },
      'lang:changed': (payload) => {
        _langCache = payload as { lang: string; resources: Record<string, unknown> };
        for (const fn of _langSubscribers) {
          try { fn(_langCache); } catch (e) {
            console.error('[preload-pool] lang:changed 回调异常:', e);
          }
        }
      },
    },
  });

  // ── 命令对象——池侧注册 + 壳侧 fallback ──
  const commandsObj = {
    /** 注册池侧命令——handler 来自 renderer（React 代码），contextBridge 自动代理函数引用 */
    registerCommand: (id: string, handler: (...args: any[]) => any) => {
      _poolCommands.set(id, handler);
    },
    /** 注销某插件的全部命令（约定：命令 ID 格式为 "pluginId.commandName"） */
    unregisterCommands: (pluginId: string) => {
      for (const [id] of _poolCommands) {
        if (id.startsWith(pluginId + '.')) _poolCommands.delete(id);
      }
    },
    /** 执行命令——先查池侧注册表，未找到则 IPC 到壳 */
    executeCommand: (id: string, ...args: any[]) => {
      const handler = _poolCommands.get(id);
      if (handler) {
        // 壳侧 executeCommand(id, token, ...realArgs) 的 token 是 CancellationToken。
        // 调用方（ContextMenu/CommandPalette）固定传 undefined 占位。
        // 池 handler 不消费 token——剥离后传 realArgs 给 handler。
        const realArgs = args.length > 0 && args[0] === undefined ? args.slice(1) : args;
        return Promise.resolve(handler(...realArgs));
      }
      return ipcRenderer.invoke('commands:execute', id, ...args);
    },
    /** 向后兼容别名 */
    execute: (id: string, ...args: any[]) => {
      const handler = _poolCommands.get(id);
      if (handler) {
        const realArgs = args.length > 0 && args[0] === undefined ? args.slice(1) : args;
        return Promise.resolve(handler(...realArgs));
      }
      return ipcRenderer.invoke('commands:execute', id, ...args);
    },
    getCommands: () => ipcRenderer.invoke('plugins:call', 'getCommands'),
  };

  // ── E5.7 Bug C：壳→池 命令执行请求桥——占位命令的壳侧执行转发到池真实 handler ──
  // 壳 CommandRegistry.executeCommand 遇 placeholder 命令（loader 元数据注册）→
  // events.emit("commands:executeRequest") → 主进程 plugin:push 广播 → 本订阅执行 →
  // invoke("commands:executeResult") → 壳 IpcBridgeHandler resolvePoolExecution 回传。
  // 订阅放 preload 模块级（对标 extraHandlers）：_poolCommands 就在本隔离世界，无 contextBridge 往返。
  // executeLocal 不 fallback 壳——壳侧该命令就是占位元数据，fallback 只会死循环。
  const executeLocal = (id: string, ...args: unknown[]): Promise<unknown> => {
    const handler = _poolCommands.get(id);
    if (!handler) return Promise.reject(new Error(`命令 "${id}" 未在池内注册`));
    return Promise.resolve(handler(...args));
  };
  const sendExecuteResult = (requestId: string, result: { result?: unknown; error?: string }): void => {
    ipcRenderer.invoke('commands:executeResult', requestId, result).catch((e) => {
      console.error(`[preload-pool] commands:executeResult 回传失败 (${requestId}):`, e);
    });
  };
  events.on('commands:executeRequest', async (payload) => {
    const { requestId, commandId, args } = (payload ?? {}) as {
      requestId?: string;
      commandId?: string;
      args?: unknown[];
    };
    if (!requestId || !commandId) return;
    try {
      const result = await executeLocal(commandId, ...(Array.isArray(args) ? args : []));
      sendExecuteResult(requestId, { result });
    } catch (e) {
      sendExecuteResult(requestId, { error: e instanceof Error ? e.message : String(e) });
    }
  });

  // ── 配置对象——settings 在池内渲染（E5.7#44：壳侧 configuration 面已删），全量经此面走 IPC ──
  const configurationObj = {
    get: (key: string) => ipcRenderer.invoke('config:get', key),
    set: (key: string, v: any) => ipcRenderer.invoke('config:set', key, v),
    getSchema: (key?: string) => ipcRenderer.invoke('plugins:call', 'getSchema', key),
    onChange: (key: string, cb: (v: any) => void) => {
      if (key && _configCache.has(key)) {
        try { cb(_configCache.get(key)); } catch { /* contextBridge 回调静默失败 */ }
      }
      return events.on('config:changed', (d: any) => {
        const { key: k, value } = d as { key: string; value: any };
        if (!key || k === key) cb(value);
      });
    },
    getConfigurationContributions: (): Promise<[string, any][]> =>
      ipcRenderer.invoke('plugins:call', 'getConfigurationContributions'),
    inspectConfiguration: (key: string): Promise<any> =>
      ipcRenderer.invoke('plugins:call', 'inspectConfiguration', key),
    getUserSettings: (): Promise<Record<string, unknown>> =>
      ipcRenderer.invoke('plugins:call', 'getUserSettings'),
    onDidChangeConfiguration: (cb: (key: string, value: unknown) => void) => {
      return events.on('config:changed', (d: any) => {
        const { key: k, value } = d as { key: string; value: any };
        try { cb(k, value); } catch { /* contextBridge 回调静默失败 */ }
      });
    },
    onPluginLifecycleChange: (cb: () => void) => {
      return events.on('plugin-lifecycle:changed', () => {
        try { cb(); } catch { /* contextBridge 回调静默失败 */ }
      });
    },
    consumeSettingsGroup: (): Promise<string | null> =>
      ipcRenderer.invoke('plugins:call', 'consumeSettingsGroup'),
    onRequestSettingsGroup: (cb: (pluginId: string) => void) => {
      return events.on('settings:requestGroup', (d: any) => {
        try { cb((d as { pluginId: string }).pluginId); } catch { /* contextBridge 回调静默失败 */ }
      });
    },
    consumeScrollToSetting: (): Promise<string | null> =>
      ipcRenderer.invoke('plugins:call', 'consumeScrollToSetting'),
    onRequestScrollToSetting: (cb: (key: string) => void) => {
      return events.on('settings:scrollTo', (d: any) => {
        try { cb((d as { key: string }).key); } catch { /* contextBridge 回调静默失败 */ }
      });
    },
  };

  contextBridge.exposeInMainWorld(APP_NAMESPACE, {
    // ── 串口（消费端——读/写/监听）──
    serial: {
      listPorts: () => ipcRenderer.invoke('serial:listPorts'),
      getStatus: () => ipcRenderer.invoke('serial:getStatus'),
      openPort: (cfg: any) => ipcRenderer.invoke('serial:openPort', cfg),
      closePort: () => ipcRenderer.invoke('serial:closePort'),
      sendData: (data: number[]) => ipcRenderer.invoke('serial:sendData', data),
      sendText: (text: string, enc: string) => ipcRenderer.invoke('serial:sendText', text, enc),
      setDtr: (enable: boolean) => ipcRenderer.invoke('serial:setDtr', enable),
      setRts: (enable: boolean) => ipcRenderer.invoke('serial:setRts', enable),
      onData: (cb: (d: any) => void) => listenDirect(ipcRenderer, 'serial:data', cb),
      onStats: (cb: (d: any) => void) => listenDirect(ipcRenderer, 'serial:stats', cb),
      onSystem: (cb: (d: any) => void) => listenDirect(ipcRenderer, 'serial:system', cb),
    },

    // ── 配置（读/写/订阅/schema）──
    configuration: configurationObj,
    config: configurationObj,

    // ── 命令（池侧注册 + 壳侧 fallback）──
    commands: commandsObj,

    // ── 文件系统（受限——主进程校验路径）──
    filesystem: {
      readTextFile: (p: string) => ipcRenderer.invoke('filesystem:readTextFile', p),
      writeTextFile: (p: string, d: string) => ipcRenderer.invoke('filesystem:writeTextFile', p, d),
      readBinaryFile: (p: string) => ipcRenderer.invoke('filesystem:readBinaryFile', p),
      writeBinaryFile: (p: string, d: Uint8Array) => ipcRenderer.invoke('filesystem:writeBinaryFile', p, d),
      listDir: (p: string) => ipcRenderer.invoke('filesystem:listDir', p),
      exists: (p: string) => ipcRenderer.invoke('filesystem:exists', p),
      createDir: (p: string) => ipcRenderer.invoke('filesystem:createDir', p),
      copy: (src: string, dest: string) => ipcRenderer.invoke('filesystem:copy', src, dest),
      remove: (p: string) => ipcRenderer.invoke('filesystem:remove', p),
      stat: (p: string) => ipcRenderer.invoke('filesystem:stat', p),
      watch: (dirPath: string, onEvent: (e: { path: string; type: string }) => void) => {
        return ipcRenderer.invoke('filesystem:watch', dirPath).then((watcherId: number) => {
          const channel = `filesystem:changed:${watcherId}`;
          const handler = (_event: any, change: any) => onEvent(change);
          ipcRenderer.on(channel, handler);
          return () => {
            ipcRenderer.removeListener(channel, handler);
            ipcRenderer.invoke('filesystem:unwatch', watcherId).catch(() => {});
          };
        });
      },
    },

    // ── 剪贴板 ──
    clipboard: {
      readText: () => ipcRenderer.invoke('clipboard:readText'),
      writeText: (text: string) => ipcRenderer.invoke('clipboard:writeText', text),
      writeFileList: (paths: string[]) => ipcRenderer.invoke('clipboard:writeFileList', paths),
    },

    // ── E5.6#11.5a：扩展 workspace——池插件完整工作区操作 ──
    workspace: {
      getFolders: (): Promise<any[]> => ipcRenderer.invoke('workspace:getFolders'),
      getActive: (): Promise<string | undefined> => ipcRenderer.invoke('workspace:getActive'),
      setActive: (uri: string) => ipcRenderer.invoke('workspace:setActive', uri),
      openFolder: () => ipcRenderer.invoke('workspace:openFolder'),
      addFolder: (path: string) => ipcRenderer.invoke('workspace:addFolder', path),
      removeFolder: (path: string) => ipcRenderer.invoke('workspace:removeFolder', path),
      onDidChangeFolders: (cb: () => void) => events.on('workspace:changed', cb),
      onDidChangeActiveWorkspace: (cb: (uri: string | null) => void) => {
        return events.on('workspace:activeChanged', (d: any) => {
          try { cb((d as { uri: string | null })?.uri ?? null); } catch { /* contextBridge 回调静默失败 */ }
        });
      },
    },

    // ── 环境信息 ──
    env: {
      get: () => ipcRenderer.invoke('env:get'),
    },

    // ── 通知 ──
    notifications: {
      show: (message: string, options?: { type?: string; progress?: boolean }) => {
        return ipcRenderer.invoke('plugins:call', 'showNotification', message, options)
          .then((handleId: string | undefined) => {
            if (!handleId) return undefined;
            return {
              update: (msg: string) => ipcRenderer.invoke('plugins:call', 'updateNotification', handleId, msg),
              finish: (msg?: string) => ipcRenderer.invoke('plugins:call', 'finishNotification', handleId, msg),
              cancel: () => ipcRenderer.invoke('plugins:call', 'cancelNotification', handleId),
            };
          });
      },
    },

    // ── 插件管理 ──
    pluginManager: {
      list: () => ipcRenderer.invoke('plugins:call', 'list'),
      enable: (id: string) => ipcRenderer.invoke('plugins:call', 'enable', id),
      disable: (id: string) => ipcRenderer.invoke('plugins:call', 'disable', id),
      uninstall: (id: string) => ipcRenderer.invoke('plugins:call', 'uninstall', id),
      install: (path: string) => ipcRenderer.invoke('plugins:call', 'install', path),
      reinstall: (id: string) => ipcRenderer.invoke('plugins:call', 'reinstall', id),
      getDisabled: () => ipcRenderer.invoke('plugins:call', 'getDisabled'),
      getUninstalled: () => ipcRenderer.invoke('plugins:call', 'getUninstalled'),
      isDisabled: (id: string) => ipcRenderer.invoke('plugins:call', 'isDisabled', id),
    },

    // ── 🔥 E5.6#11.5-fix：plugins 辅助——池侧动态 import 运行时安装的插件 ──
    // PluginComponent.tsx 的 import.meta.glob 是构建时扫描，运行时安装的插件不在 glob 中。
    // 提供 resolvePath 让 PluginComponent 在 glob 查找失败时 fallback 到动态 import()。
    plugins: {
      resolvePath: (id: string) => ipcRenderer.invoke('plugins:resolvePath', id),
    },

    // ── 主题查询 ──
    theme: {
      getCurrent: () => ipcRenderer.invoke('plugins:call', 'getCurrentTheme'),
      getAvailable: () => ipcRenderer.invoke('plugins:call', 'getAvailableThemes'),
      apply: (themeId: string) => ipcRenderer.invoke('config:set', 'app.theme', themeId),
    },

    // ── 语言查询 ──
    language: {
      getCurrent: () => ipcRenderer.invoke('plugins:call', 'getCurrentLanguage'),
      getAvailable: () => ipcRenderer.invoke('plugins:call', 'getAvailableLanguages'),
      set: (langId: string) => ipcRenderer.invoke('config:set', 'app.language', langId),
      getInitial: () => _langCache,
      onChange: (cb: (data: { lang: string; resources: Record<string, unknown> }) => void) => {
        _langSubscribers.add(cb);
        return () => { _langSubscribers.delete(cb); };
      },
    },

    // ── 快捷键 ──
    keybindings: {
      getKeybindings: () => ipcRenderer.invoke('plugins:call', 'getKeybindings'),
      getConflicts: () => ipcRenderer.invoke('plugins:call', 'getKeybindingConflicts'),
      registerKeybinding: (binding: unknown) => ipcRenderer.invoke('plugins:call', 'registerKeybinding', binding),
      saveUserKeybindings: () => ipcRenderer.invoke('plugins:call', 'saveUserKeybindings'),
      removeKeybindingForCommand: (commandId: string) => ipcRenderer.invoke('plugins:call', 'removeKeybindingForCommand', commandId),
      resetKeybindingToDefault: (commandId: string) => ipcRenderer.invoke('plugins:call', 'resetKeybindingToDefault', commandId),
      findKeybindingForCommand: (commandId: string) => ipcRenderer.invoke('plugins:call', 'findKeybindingForCommand', commandId),
      setKeybindingCaptureActive: (active: boolean) => ipcRenderer.invoke('plugins:call', 'setKeybindingCaptureActive', active),
      keyboardEventToKeyString: (e: KeyboardEvent): string => {
        const parts: string[] = [];
        if (e.ctrlKey) parts.push('ctrl');
        if (e.shiftKey) parts.push('shift');
        if (e.altKey) parts.push('alt');
        if (e.metaKey) parts.push('meta');
        const keyMap: Record<string, string> = {
          ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
          Escape: 'escape', Enter: 'enter', Tab: 'tab', Backspace: 'backspace',
          Delete: 'delete', Home: 'home', End: 'end', PageUp: 'pageup', PageDown: 'pagedown',
          ' ': 'space',
        };
        if (!e?.key) return '';
        const key = keyMap[e.key] ?? e.key.toLowerCase();
        if (['control', 'shift', 'alt', 'meta'].includes(key)) return '';
        parts.push(key);
        const order = ['ctrl', 'shift', 'alt', 'meta'];
        return parts.sort((a, b) => {
          const ai = order.indexOf(a), bi = order.indexOf(b);
          if (ai !== -1 && bi !== -1) return ai - bi;
          if (ai !== -1) return -1;
          if (bi !== -1) return 1;
          return a.localeCompare(b);
        }).join('+');
      },
      onChange: (cb: () => void) => events.on('keybindings:changed', cb),
    },

    // ── 插件持久化存储 ──
    pluginState: {
      get: (pluginId: string, key: string): Promise<unknown> =>
        ipcRenderer.invoke('pluginState:get', pluginId, key),
      set: (pluginId: string, key: string, value: unknown): Promise<void> =>
        ipcRenderer.invoke('pluginState:set', pluginId, key, value),
      onChange: (pluginId: string, key: string, cb: (value: unknown) => void) => {
        return events.on('plugin-state:changed', (data: any) => {
          if (data?.pluginId === pluginId && data?.key === key) {
            cb(data.value);
          }
        });
      },
    },

    // ── E5.7#38：Hot Exit 备份——脏内容落盘走主进程（池渲染进程零直写 %APPDATA%，审计约束）。
    // 路径约定单源在主进程 hot-exit-handlers.ts：<sha256(filePath)>.dirty。
    // 只读 load（不消费）——StrictMode 双 mount / 跨组移动 remount 都要能重复读。
    hotExit: {
      save: (filePath: string, content: string): Promise<void> =>
        ipcRenderer.invoke('hot-exit:save', filePath, content),
      load: (filePath: string): Promise<string | null> =>
        ipcRenderer.invoke('hot-exit:load', filePath),
      clear: (filePath: string): Promise<void> =>
        ipcRenderer.invoke('hot-exit:clear', filePath),
    },

    // ── 菜单 ──
    menu: {
      registerItems: (menuId: string, pluginId: string, items: unknown[]) =>
        ipcRenderer.invoke('menu:registerItems', menuId, pluginId, items),
      getItems: (menuId: string, context?: Record<string, unknown>): Promise<unknown[]> =>
        ipcRenderer.invoke('menu:getItems', menuId, context),
    },

    // ── ContextKey ──
    contextKey: {
      set: (key: string, value: unknown) => {
        _contextKeyStore.set(key, value);
        ipcRenderer.invoke('contextKey:set', key, value);
      },
      _getValue: (key: string) => _contextKeyStore.get(key),
    },

    // ── 标签页操作 ──
    tabs: {
      create: (type: string, opts?: Record<string, unknown>) =>
        ipcRenderer.invoke('tabs:create', type, opts),
      openOrFocus: (type: string, opts?: Record<string, unknown>) =>
        ipcRenderer.invoke('tabs:openOrFocus', type, opts),
      focus: (tabId: string) => ipcRenderer.invoke('tabs:focus', tabId),
      close: (tabId: string) => ipcRenderer.invoke('tabs:close', tabId),
      focusBySourceId: (sourceId: string) => ipcRenderer.invoke('tabs:focusBySourceId', sourceId),
      updateLabelBySourceId: (sourceId: string, label: string) =>
        ipcRenderer.invoke('tabs:updateLabelBySourceId', sourceId, label),
      closeBySourceId: (sourceId: string) => ipcRenderer.invoke('tabs:closeBySourceId', sourceId),
      // E5.6#11.5g3: autoReveal——文件树随标签页切换自动定位
      onDidChangeActiveTab: (cb: (data: { tabId: string; pluginId?: string; filePath?: string }) => void) => {
        return events.on('tab:activated', (d: any) => {
          try { cb(d as { tabId: string; pluginId?: string; filePath?: string }); } catch { /* contextBridge 回调静默失败 */ }
        });
      },
    },

    // ── p2p ──
    p2p: {
      send: (target: string, channel: string, data: unknown) => {
        ipcRenderer.send('p2p:send', { target, channel, data });
      },
      on: (channel: string, cb: (data: unknown) => void) =>
        listenDirect(ipcRenderer, 'p2p:data', (d: { channel: string; data: unknown }) => {
          if (d.channel === channel) cb(d.data);
        }),
    },

    // ── 弹窗 ──
    dialog: {
      confirm: (message: string): Promise<boolean> => ipcRenderer.invoke('dialog:confirm', message),
      alert: (message: string): Promise<void> => ipcRenderer.invoke('dialog:alert', message),
      open: (opts: any): Promise<any> => ipcRenderer.invoke('dialog:open', opts),
    },

    // ── path 工具函数 ──
    path: {
      normalize: (p: string) => p.replace(/\\/g, '/'),
      join: (...parts: string[]) => parts.map(p => p.replace(/\\/g, '/')).join('/').replace(/\/+/g, '/'),
      basename: (p: string) => { const s = p.replace(/\\/g, '/').split('/'); return s[s.length - 1] || ''; },
      dirname: (p: string) => { const s = p.replace(/\\/g, '/').split('/'); s.pop(); return s.join('/') || '.'; },
      extname: (p: string) => { const b = p.replace(/\\/g, '/').split('/').pop() || ''; const i = b.lastIndexOf('.'); return i > 0 ? b.slice(i) : ''; },
    },

    // ── Pool 专属 API ──
    pool: {
      onLayout: (cb: (layout: any) => void) => {
        _onLayoutCallback = cb;
        _onLayoutActive = true;
        for (const layout of _layoutBuffer) {
          try { cb(layout); } catch { /* contextBridge 回调静默失败 */ }
        }
        _layoutBuffer.length = 0;
        return () => {
          _onLayoutCallback = null;
          _onLayoutActive = false;
        };
      },
      ready: () => ipcRenderer.send('pool:ready', _poolZone),
      sidebarAction: (action: unknown) => ipcRenderer.send('pool:sidebar-action', action),
      // E5.6#16.5：池→壳 tab 操作（切标签/关闭/拖拽排序/分屏/右键菜单等）
      tabAction: (action: unknown) => ipcRenderer.send('pool:tab-action', action),
    },

    // ── E5.7#15：QuickPick 哑渲染订阅——池 QuickPickHost 消费 ──
    quickPick: {
      /** 订阅壳推送的 QuickPick 数据（缓冲+回放，只保留最后一份）。返回 unsubscribe */
      onShow: (cb: (data: PoolQuickPickDataShape) => void) => {
        _quickPickCallback = cb;
        _quickPickActive = true;
        if (_quickPickBuffer.length > 0) {
          for (const data of _quickPickBuffer) {
            try { cb(data); } catch { /* contextBridge 回调静默失败 */ }
          }
          _quickPickBuffer.length = 0;
        }
        return () => {
          _quickPickCallback = null;
          _quickPickActive = false;
        };
      },
      /** 选中条目——壳按 key 重解析 item 执行 onSelect */
      select: (key: string) => ipcRenderer.send('pool:quickpick-action', { type: 'select', key }),
      /** 高亮条目——壳按 key 重解析 item 执行 onHighlight */
      highlight: (key: string) => ipcRenderer.send('pool:quickpick-action', { type: 'highlight', key }),
      /** 关闭（Escape / 点击 backdrop）——壳执行 onClose */
      close: () => ipcRenderer.send('pool:quickpick-action', { type: 'close' }),
      /** 行内按钮——壳按 key 重解析 item 执行 onItemAction(item, actionId) */
      itemAction: (key: string, actionId: string) =>
        ipcRenderer.send('pool:quickpick-action', { type: 'itemAction', key, actionId }),
    },

    // ── E5.7#16：Toast 哑渲染订阅——池 ToastHost 消费 ──
    toast: {
      /** 订阅壳推送的 Toast 全量快照（缓冲+回放，只保留最后一份）。返回 unsubscribe */
      onShow: (cb: (data: PoolToastDataShape) => void) => {
        _toastCallback = cb;
        _toastActive = true;
        if (_toastBuffer.length > 0) {
          for (const data of _toastBuffer) {
            try { cb(data); } catch { /* contextBridge 回调静默失败 */ }
          }
          _toastBuffer.length = 0;
        }
        return () => {
          _toastCallback = null;
          _toastActive = false;
        };
      },
      /** 关闭单条——壳按 id 重解析执行 dismissToast */
      dismiss: (id: string) => ipcRenderer.send('pool:toast-action', { type: 'dismiss', id }),
      /** 行内操作按钮——壳按 id + actionId（位置序号）重解析 onClick */
      action: (id: string, actionId: string) =>
        ipcRenderer.send('pool:toast-action', { type: 'action', id, actionId }),
    },

    // ── E5.7#17：Dialog 哑渲染订阅——池 DialogHost 消费 ──
    // 命名 dialogHost——dialog 命名空间已是插件侧 dialog.confirm/alert/open API
    dialogHost: {
      /** 订阅壳推送的 Dialog 数据（缓冲+回放，只保留最后一份）。返回 unsubscribe */
      onShow: (cb: (data: PoolDialogDataShape) => void) => {
        _dialogCallback = cb;
        _dialogActive = true;
        if (_dialogBuffer.length > 0) {
          for (const data of _dialogBuffer) {
            try { cb(data); } catch { /* contextBridge 回调静默失败 */ }
          }
          _dialogBuffer.length = 0;
        }
        return () => {
          _dialogCallback = null;
          _dialogActive = false;
        };
      },
      /** 确认（确定按钮 / Enter）——壳侧 settle(true) */
      confirm: () => ipcRenderer.send('pool:dialog-action', { type: 'confirm' }),
      /** 取消（取消按钮 / Escape / backdrop）——壳侧 settle(false) */
      cancel: () => ipcRenderer.send('pool:dialog-action', { type: 'cancel' }),
    },

    // ── 🆕 E5.6#11.5a：文件关联——扩展名→插件ID ──
    fileAssociation: {
      getPluginFor: (ext: string): Promise<string | undefined> =>
        ipcRenderer.invoke('fileAssociation:getPluginFor', ext),
    },

    // ── 🆕 E5.6#11.5a：文件搜索——全文搜索/替换（IPC 到壳/主进程执行）──
    // E5.6#11.5g5：searchFiles API 对齐 FileSearcher.SearchOptions——pool/plugin 零差异迁移
    search: {
      searchFiles: (opts: {
        roots: string[];
        query: string;
        include?: string;
        exclude?: string;
        caseSensitive?: boolean;
        wholeWord?: boolean;
        useRegex?: boolean;
        maxResults?: number;
        // signal 本地消费——IPC 不传，调用方拿到结果后检查 AbortSignal.aborted 自行丢弃
      }): Promise<Array<{ filePath: string; matches: Array<{ filePath: string; lineNumber: number; lineText: string; matchStart: number; matchEnd: number }> }>> =>
        ipcRenderer.invoke('search:searchFiles', opts),
    },

    // ── 🆕 E5.6#11.5a：文件装饰——Git 状态图标/颜色等 ──
    decorations: {
      getDecoration: (uri: string): Promise<{ badge?: string; color?: string; tooltip?: string } | null> =>
        ipcRenderer.invoke('decorations:getDecoration', uri),
      onDidChange: (cb: (uris: string[]) => void) => {
        return events.on('decorations:changed', (d: any) => {
          try { cb((d as { uris: string[] })?.uris ?? []); } catch { /* contextBridge 回调静默失败 */ }
        });
      },
    },

    // ── 🆕 E5.6#11.5a：编码检测/转换 ──
    encoding: {
      detect: (buffer: Uint8Array): Promise<string> =>
        ipcRenderer.invoke('encoding:detect', buffer),
      decode: (buffer: Uint8Array, encoding: string): Promise<string> =>
        ipcRenderer.invoke('encoding:decode', buffer, encoding),
      encode: (text: string, encoding: string): Promise<Uint8Array> =>
        ipcRenderer.invoke('encoding:encode', text, encoding),
    },

    // ── 🆕 E5.6#11.5a：viewContainer——池侧 no-op（壳的 loader.ts 已注册视图）──
    viewContainer: {
      registerView: (_pluginId: string, _containerId: string, _descriptor: any) => {
        // 池侧 no-op——壳的 loader.ts 已经在壳进程注册了所有视图
      },
      getView: (_viewId: string) => null,
    },

    // ── 🆕 E5.6#11.5i：langDef——语言定义注册表（壳侧 LangDefRegistry）──
    // E5.6#14-fix：langDef.get 走 plugins:call 代理到壳渲染进程——主进程 LangDefRegistry 为空
    langDef: {
      get: (extension: string): Promise<{ id: string; lsp?: { command: string; args?: string[] } } | null> =>
        ipcRenderer.invoke('plugins:call', 'getLangDef', extension),
    },

    // ── 🆕 E5.6#14-lsp：LSP 桥——编辑器在 MainPool 中需 LSP 通信（自动补全/F12/诊断/重命名）──
    lsp: {
      spawn: (command: string, args: string[] | undefined, pluginId: string) =>
        ipcRenderer.invoke('lsp:spawn', { command, args, pluginId }),
      write: (channelId: string, data: string) =>
        ipcRenderer.send('lsp:write', { channelId, data }),
      dispose: (channelId: string) =>
        ipcRenderer.invoke('lsp:dispose', { channelId }),
      onData: (cb: (channelId: string, data: string) => void) =>
        listenDirect(ipcRenderer, 'lsp:data', ({ channelId, data }: { channelId: string; data: string }) => cb(channelId, data)),
    },

    // ── E5.6#11.5h：protocol——协议注册表（壳侧 ProtocolRegistry）──
    // 🔴 E5.6#14-fix：走 plugins:call 代理到壳渲染进程——壳 loader.ts 注册的协议
    // 在壳渲染进程内存中，主进程 ProtocolRegistry 为空（跨进程模块实例隔离）。
    protocol: {
      listProtocols: (): Promise<Array<{ id: string; name: string; pluginId: string; mode: string }>> =>
        ipcRenderer.invoke('plugins:call', 'protocol:listProtocols'),
      getActiveProtocolId: (): Promise<string> =>
        ipcRenderer.invoke('plugins:call', 'protocol:getActiveProtocolId'),
      setActiveProtocolId: (protocolId: string): Promise<void> =>
        ipcRenderer.invoke('plugins:call', 'protocol:setActiveProtocolId', protocolId),
    },

    // ── 🔥 E5.6#11.5-bug3a：shell 操作——revealInOS / openInTerminal / startDrag ──
    // 这些是主进程 handler（main.ts ipcMain.handle），非壳渲染进程 handler，
    // 因此不走 PROXY_CHANNELS——直接 ipcRenderer.invoke。
    shell: {
      showItemInFolder: (p: string) => ipcRenderer.invoke('shell:showItemInFolder', p),
      openInTerminal: (dirPath: string, terminalExe?: string, customCommand?: string) =>
        ipcRenderer.invoke('shell:openInTerminal', dirPath, terminalExe, customCommand),
      startDrag: (filePath: string, iconPath?: string) =>
        ipcRenderer.send('shell:startDrag', filePath, iconPath),
    },

    // ── 🔥 E5.6#11.5-bug4：getFilePath——桥接 Chromium File API 与沙箱文件系统 ──
    // 被 FileTreeDnD.ts 的 handleDrop 用于解析外部拖入文件的真实路径。
    // 设计文档误将其归类为"per-tab 概念"——实际是通用工具，非 per-tab。
    getFilePath: (file: File) => webUtils.getPathForFile(file),

    // ── E5.7#5：窗口控制——TitleBarZone 的自定义 ─ □ × 按钮（preload-shell 同款搬入）──
    // 通道是主进程 handler（window:minimize 等）——非壳渲染进程 handler，不走 PROXY_CHANNELS。
    window: {
      minimize:  () => ipcRenderer.send('window:minimize'),
      maximize:  () => ipcRenderer.send('window:maximize'),
      unmaximize:() => ipcRenderer.send('window:unmaximize'),
      close:     () => ipcRenderer.send('window:close'),
      toggleDevTools: () => ipcRenderer.invoke('window:toggleDevTools'),
      isMaximized:() => ipcRenderer.invoke('window:isMaximized'),
      onMaximizeChange: (cb: (maximized: boolean) => void) =>
        listenDirect(ipcRenderer, 'window:maximize-change', (m: boolean) => cb(m)),
    },

    events,
  });

  // 通知主进程 preload 成功
  ipcRenderer.send('preload-pool-ready');
} catch (err) {
  contextBridge.exposeInMainWorld('__linkdesk_preload_error__', {
    message: String(err),
  });
  console.error('[preload-pool] 暴露 window.linkdesk 失败:', err);
}
