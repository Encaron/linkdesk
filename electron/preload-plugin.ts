/**
 * 插件 WebView preload 脚本
 *
 * E1 步 5 + E3a #28 细化：比 preload-shell.ts 更窄——核心无知原则：插件不知道壳的存在。
 * E3a 生产使用时，此文件直接作为 PluginWebContentsView 的 preload。
 *
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * 🔥🔥🔥 IPC 通道铁律——新 AI / 任何人修改此文件前必读（E5.5#7b）
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *
 * 插件 WebView 接收壳推送事件的通道只有两种。选错 = 静默失效（不报错，事件永远收不到）。
 *
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │ 铁律 1：IpcBridge.broadcast 推送 → 插件侧 events.on(channel, cb)             │
 * │                                                                             │
 * │   壳侧调用链：IpcBridge.broadcast('config:changed', payload)                  │
 * │            → view.webContents.send('plugin:push', {channel, payload})        │
 * │                                                                             │
 * │   插件侧必须：events.on('config:changed', cb)                                 │
 * │            → 内部注册 ipcRenderer.on('plugin:push', handler)                 │
 * │            → handler 内匹配 data.channel === 'config:changed' → 调 cb        │
 * │                                                                             │
 * │   ✅ 正确：configuration.onChange → events.on('config:changed', cb)           │
 * │   ✅ 正确：pluginState.onChange  → events.on('plugin-state:changed', cb)     │
 * │   ✅ 正确：theme.onChange（通过 extraHandlers）                               │
 * │   ❌ 错误：listenDirect(ipcRenderer, 'config:changed', cb)                   │
 * │           → 监听直接 IPC 通道 'config:changed'，但事件在 'plugin:push' 上到达  │
 * │           → 永远收不到。不报错。静默失效。                                    │
 * └─────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │ 铁律 2：主进程直接 send → 插件侧 listenDirect(ipcRenderer, channel, cb)       │
 * │                                                                             │
 * │   主进程调用：view.webContents.send('serial:data', payload)                   │
 * │             （不经过 plugin:push 包装，直发到插件 WebView）                    │
 * │                                                                             │
 * │   插件侧必须：listenDirect(ipcRenderer, 'serial:data', cb)                    │
 * │            → 内部注册 ipcRenderer.on('serial:data', handler)                 │
 * │                                                                             │
 * │   ✅ 正确：serial.onData  → listenDirect(ipcRenderer, 'serial:data', cb)     │
 * │   ✅ 正确：serial.onStats → listenDirect(ipcRenderer, 'serial:stats', cb)    │
 * │   ✅ 正确：p2p.on         → listenDirect(ipcRenderer, 'p2p:data', cb)        │
 * └─────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │ 铁律 3：event-system.ts 的 listenDirect 会对已知 plugin:push 通道打印 error   │
 * │         新加直接通道 → channel 名加 `:direct` 后缀以跳过告警                   │
 * └─────────────────────────────────────────────────────────────────────────────┘
 *
 * 快速自查（新加 IPC 订阅时问自己 3 个问题）：
 *   Q1: 壳侧谁发这个事件？→ IpcBridge.broadcast() 还是 view.webContents.send()？
 *   Q2: 经过 plugin:push 分发吗？→ broadcast → 是（用 events.on）；直发 → 否（用 listenDirect）
 *   Q3: 有模块级缓存防竞态吗？→ React mount 前事件可能已到达 → 需 Map 缓存 + onXxx 时立即回放
 *
 * 📖 完整根因分析 + 审计：docs/02-Electron架构/E5.5_多WebView恢复/02-IPC事件推送-插件WebView修复.md
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *
 * 🔒 安全边界（contextBridge 白名单审计）：
 *   ✅ serial      — 消费端（读/写/监听，含 DTR/RTS 控制）
 *   ✅ config      — 读/写/订阅配置变更
 *   ✅ commands    — 执行壳侧命令（不含 register——handler 不可序列化）
 *   ✅ filesystem  — 受限文件读写（主进程执行路径校验）
 *   ✅ clipboard   — 读写剪贴板
 *   ✅ env         — 读取环境信息
 *   ✅ events      — 通用事件订阅（壳推送→插件接收）
 *   ❌ plugins.*   — 不能安装/卸载插件（壳操作）
 *   ❌ window.*    — 不能创建/关闭 WebView（壳操作）
 *   ❌ dialog.*    — 不能弹系统对话框（走壳的 toast/ConfirmDialog）
 *   ❌ path.*      — 不能获取系统路径（壳操作）
 */

import { contextBridge, ipcRenderer, webUtils } from 'electron';
import { APP_NAMESPACE } from './constants';
import { createEventSystem, listenDirect } from './event-system';

// ── E5.5#9j：从 URL query 解析 pluginId + instanceId ——
// URL 格式：plugin-view.html?pluginId=xxx&instanceId=yyy
const _urlParams = new URLSearchParams(globalThis.location?.search ?? '');
const _pluginInstanceId = _urlParams.get('instanceId') ?? '';
const _urlPluginId = _urlParams.get('pluginId') ?? '';

// ── E5.6#8b：pool:layout 缓冲回放——IPC 可能在 React mount 前到达 ──
// E5#11l Bug 4 教训：IPC 监听器必须在模块顶层，不是 useEffect 内
const _poolZone = _urlParams.get('zone') ?? '';
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

// ── E5#19b fix: ContextKey 本地同步 store——IPC 回路延迟致键盘分发读不到最新值 ──
const _contextKeyStore = new Map<string, unknown>();
ipcRenderer.on('contextKey:changed', (_event, { key, value }: { key: string; value: unknown }) => {
  _contextKeyStore.set(key, value);
});

// ── E5.5#7a: 配置缓存——防 React mount 前事件竞态（同 _langCache 模式）──
//          ipcRenderer.on 模块顶层常驻 → 事件可在任何时刻安全到达，不依赖 React 生命周期。
const _configCache = new Map<string, unknown>();
ipcRenderer.on('plugin:push', (_event, data: any) => {
  if (data?.channel === 'config:changed') {
    const { key, value } = data.payload as { key: string; value: any };
    _configCache.set(key, value);
  }
});


try {
  // ── 语言资源缓存（E3c #40：接收壳广播的初始语言数据）──
  let _langCache: { lang: string; resources: Record<string, unknown> } | null = null;
  const _langSubscribers = new Set<(data: { lang: string; resources: Record<string, unknown> }) => void>();


  const events = createEventSystem(ipcRenderer, {
    logPrefix: 'preload-plugin',
    extraHandlers: {
      // E3b #35：theme:changed 自动注入 CSS 变量，插件无需手动订阅
      // E5.5#7-fix：改用 root.style.setProperty——行内样式优先级 > index.css :root 规则。
      // 旧方案用 <style> 元素会被 index.css 的 :root 覆盖（同优先级，后加载者胜）。
      'theme:changed': (payload) => {
        const { themeType, variables } = payload as any;
        try {
          const root = document.documentElement;
          root.setAttribute('data-theme', themeType ?? 'dark');
          // 直接设行内样式——最高优先，index.css :root 无法覆盖
          for (const [k, v] of Object.entries(variables as Record<string, string>)) {
            root.style.setProperty(`--${k}`, v);
          }
        } catch (e) {
          console.error('[preload-plugin] theme:changed CSS 注入失败:', e);
        }
      },
      // E5.5#7-fix：强调色广播——accent:changed 自动注入 CSS 变量，对标 theme:changed
      // 同样用 root.style.setProperty——行内样式优先级 > index.css :root 规则
      'accent:changed': (payload) => {
        const { variables } = payload as any;
        try {
          const root = document.documentElement;
          for (const [k, v] of Object.entries(variables as Record<string, string>)) {
            root.style.setProperty(k, v); // variables 的 key 已是 "--accent" 格式
          }
        } catch (e) {
          console.error('[preload-plugin] accent:changed CSS 注入失败:', e);
        }
      },
      // E3c #40：lang:changed 缓存 + 通知订阅者
      'lang:changed': (payload) => {
        _langCache = payload as { lang: string; resources: Record<string, unknown> };
        for (const fn of _langSubscribers) {
          try { fn(_langCache); } catch (e) {
            console.error('[preload-plugin] lang:changed 回调异常:', e);
          }
        }
      },
    },
  });

  // E3j #75：commands 对象——execute（向后兼容别名）+ executeCommand + getCommands
  const commandsObj = {
    execute: (id: string, ...args: any[]) =>
      ipcRenderer.invoke('commands:execute', id, ...args),
    executeCommand: (id: string, ...args: any[]) =>
      ipcRenderer.invoke('commands:execute', id, ...args),
    getCommands: () => ipcRenderer.invoke('plugins:call', 'getCommands'),
  };

  // E3j #75：configuration 对象——config 为向后兼容别名
  // E5.5#7：补全设置页所需 API——getConfigurationContributions / inspectConfiguration / getUserSettings / onDidChangeConfiguration / onPluginLifecycleChange
  const configurationObj = {
    get:  (key: string) => ipcRenderer.invoke('config:get', key),
    set:  (key: string, v: any) => ipcRenderer.invoke('config:set', key, v),
    getSchema: (key?: string) => ipcRenderer.invoke('plugins:call', 'getSchema', key),
    // E5.5#7a：listenDirect → events.on——config:changed 经 IpcBridge.broadcast 走 plugin:push 分发，非直接 IPC 通道
    onChange: (key: string, cb: (v: any) => void) => {
      // 模块级缓存已有 → 立即回调解耦 React mount 时序
      if (key && _configCache.has(key)) {
        try { cb(_configCache.get(key)); } catch { /* contextBridge 回调静默失败 */ }
      }
      return events.on("config:changed", (d: any) => {
        const { key: k, value } = d as { key: string; value: any };
        if (!key || k === key) cb(value);
      });
    },
    // ── E5.5#7：设置页 IPC 化——以下 5 个 API 替代 SettingsView 的直接 @src/core import ──
    /** 获取所有插件的配置贡献（分组列表+属性）。返回 entries 数组，插件侧需 new Map(entries) */
    getConfigurationContributions: (): Promise<[string, any][]> =>
      ipcRenderer.invoke('plugins:call', 'getConfigurationContributions'),
    /** 检视单个配置项——返回 { key, defaultValue, globalValue, workspaceValue, userValue } */
    inspectConfiguration: (key: string): Promise<any> =>
      ipcRenderer.invoke('plugins:call', 'inspectConfiguration', key),
    /** 获取用户设置 JSON——用于 "打开设置 (JSON)" 弹窗 */
    getUserSettings: (): Promise<Record<string, unknown>> =>
      ipcRenderer.invoke('plugins:call', 'getUserSettings'),
    /** 全局配置变更——不传 key 则所有变更都通知 */
    onDidChangeConfiguration: (cb: (key: string, value: unknown) => void) => {
      return events.on("config:changed", (d: any) => {
        const { key: k, value } = d as { key: string; value: any };
        try { cb(k, value); } catch { /* contextBridge 回调静默失败 */ }
      });
    },
    /** 插件生命周期变更——插件安装/卸载时通知，设置页等保姆插件刷新分组列表 */
    onPluginLifecycleChange: (cb: () => void) => {
      return events.on("plugin-lifecycle:changed", () => {
        try { cb(); } catch { /* contextBridge 回调静默失败 */ }
      });
    },
    // ── E5.5#7：壳→设置页导航——M1 双通道（齿轮"设置"跳转到指定分组/配置项）──
    /** A 通道（mount 消费 pending）——设置未打开时齿轮"设置"跳转到指定分组 */
    consumeSettingsGroup: (): Promise<string | null> =>
      ipcRenderer.invoke('plugins:call', 'consumeSettingsGroup'),
    /** B 通道（Emitter 订阅）——设置已打开时齿轮"设置"实时跳转 */
    onRequestSettingsGroup: (cb: (pluginId: string) => void) => {
      return events.on("settings:requestGroup", (d: any) => {
        try { cb((d as { pluginId: string }).pluginId); } catch { /* contextBridge 回调静默失败 */ }
      });
    },
    /** A 通道（mount 消费 pending）——命令面板齿轮跳转到指定配置项 */
    consumeScrollToSetting: (): Promise<string | null> =>
      ipcRenderer.invoke('plugins:call', 'consumeScrollToSetting'),
    /** B 通道（Emitter 订阅）——已打开时实时滚动到指定配置项 */
    onRequestScrollToSetting: (cb: (key: string) => void) => {
      return events.on("settings:scrollTo", (d: any) => {
        try { cb((d as { key: string }).key); } catch { /* contextBridge 回调静默失败 */ }
      });
    },
  };

  contextBridge.exposeInMainWorld(APP_NAMESPACE, {
    /** OS 拖入——从 File 对象取真实路径。Electron 43 contextIsolation 下 File.path 为空，必须走 webUtils。 */
    getFilePath: (file: File) => webUtils.getPathForFile(file),

    // ── E5.5#9j：插件实例身份——URL 解析的 instanceId + pluginId
    // 插件侧：window.linkdesk.pluginInstance.id / .pluginId
    pluginInstance: {
      /** 实例 ID = tab.id——每个标签页唯一。用于 pluginState key / IPC 路由。 */
      id: _pluginInstanceId,
      /** 插件 ID——从 URL query 解析，与 plugin.json 的 id 一致 */
      pluginId: _urlPluginId,
    },

    // ── 串口（消费端——读/写/监听，不含管理）──
    // 注意：serial.onData/onStats/onSystem 直接监听主进程推送（与 E1-E2 兼容），
    // 不经过 events channel。E3a #30 终端迁移后，数据走 bridge:pushToPlugin →
    // plugin:push → events.on('serial:data', ...) 路径。
    serial: {
      listPorts: () => ipcRenderer.invoke('serial:listPorts'),
      getStatus: () => ipcRenderer.invoke('serial:getStatus'),
      openPort:  (cfg: any) => ipcRenderer.invoke('serial:openPort', cfg),
      closePort: () => ipcRenderer.invoke('serial:closePort'),
      sendData:  (data: number[]) => ipcRenderer.invoke('serial:sendData', data),
      sendText:  (text: string, enc: string) => ipcRenderer.invoke('serial:sendText', text, enc),
      setDtr:    (enable: boolean) => ipcRenderer.invoke('serial:setDtr', enable),
      setRts:    (enable: boolean) => ipcRenderer.invoke('serial:setRts', enable),
      // 直接 IPC 监听——归一化走 listenDirect
      onData:   (cb: (d: any) => void) => listenDirect(ipcRenderer, 'serial:data', cb),
      onStats:  (cb: (d: any) => void) => listenDirect(ipcRenderer, 'serial:stats', cb),
      onSystem: (cb: (d: any) => void) => listenDirect(ipcRenderer, 'serial:system', cb),
    },

    // ── 配置（读/写/订阅/schema）──
    // E3j #74：新名 configuration——对标 VS Code vscode.workspace.getConfiguration
    // E3j #75：旧名 config 为向后兼容别名
    configuration: configurationObj,
    config: configurationObj,

    // ── 命令（执行/查询壳侧命令）──
    // 🔒 不含 register——handler 函数无法通过 IPC 序列化。
    // E3j #74：新名 executeCommand——对标 VS Code vscode.commands.executeCommand
    // E3j #75：旧名 execute 为向后兼容别名
    commands: commandsObj,

    // ── 文件系统（受限——主进程校验路径，仅允许读写插件数据目录）──
    // 🔒 插件只能读写 .linkdesk/plugins/<pluginId>/ 下的文件，
    // 路径校验由 file-handlers.ts 在主进程侧执行（根据 event.sender 的 WebContents 判断调用方）。
    filesystem: {
      readTextFile:  (p: string) => ipcRenderer.invoke('filesystem:readTextFile', p),
      writeTextFile: (p: string, d: string) => ipcRenderer.invoke('filesystem:writeTextFile', p, d),
      readBinaryFile: (p: string) => ipcRenderer.invoke('filesystem:readBinaryFile', p),
      writeBinaryFile: (p: string, d: Uint8Array) => ipcRenderer.invoke('filesystem:writeBinaryFile', p, d),
      // E5#85 扩展
      listDir: (p: string) => ipcRenderer.invoke('filesystem:listDir', p),
      exists:  (p: string) => ipcRenderer.invoke('filesystem:exists', p),
      createDir: (p: string) => ipcRenderer.invoke('filesystem:createDir', p),
      copy:    (src: string, dest: string) => ipcRenderer.invoke('filesystem:copy', src, dest),
      remove:  (p: string) => ipcRenderer.invoke('filesystem:remove', p),
      watch: (dirPath: string, onEvent: (e: { path: string; type: string }) => void) => {
        return ipcRenderer.invoke('filesystem:watch', dirPath).then((watcherId: number) => {
          const channel = `filesystem:changed:${watcherId}`;
          const handler = (_event: any, change: any) => onEvent(change);
          ipcRenderer.on(channel, handler);
          return () => {
            ipcRenderer.removeListener(channel, handler);
            ipcRenderer.invoke('filesystem:unwatch', watcherId).catch(() => {}); // 非关键操作——清理 watcher，窗口关闭时失败不阻塞
          };
        });
      },
    },

    // ── 剪贴板 ──
    clipboard: {
      readText:  () => ipcRenderer.invoke('clipboard:readText'),
      writeText: (text: string) => ipcRenderer.invoke('clipboard:writeText', text),
    },

    // ── E5#85：workspace——工作区信息查询 ──
    workspace: {
      getFolders: (): Promise<any[]> => ipcRenderer.invoke('workspace:getFolders'),
      getActive: (): Promise<string | undefined> => ipcRenderer.invoke('workspace:getActive'),
    },

    // ── 环境信息 ──
    env: {
      get: () => ipcRenderer.invoke('env:get'),
    },

    // ── E3j #76：通知——插件弹出壳侧 toast，对标 VS Code vscode.window.showInformationMessage ──
    notifications: {
      /** 弹出通知。progress=true 时返回 ProgressHandle */
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

    // ── E3a #31：插件管理——list/enable/disable/install/uninstall/reinstall ──
    pluginManager: {
      list:           () => ipcRenderer.invoke('plugins:call', 'list'),
      enable:         (id: string) => ipcRenderer.invoke('plugins:call', 'enable', id),
      disable:        (id: string) => ipcRenderer.invoke('plugins:call', 'disable', id),
      uninstall:      (id: string) => ipcRenderer.invoke('plugins:call', 'uninstall', id),
      install:        (path: string) => ipcRenderer.invoke('plugins:call', 'install', path),
      reinstall:      (id: string) => ipcRenderer.invoke('plugins:call', 'reinstall', id),
      getDisabled:    () => ipcRenderer.invoke('plugins:call', 'getDisabled'),
      getUninstalled: () => ipcRenderer.invoke('plugins:call', 'getUninstalled'),
      isDisabled:     (id: string) => ipcRenderer.invoke('plugins:call', 'isDisabled', id),
    },

    // ── E3j #74：主题查询——跨进程读 ThemeEngine ──
    theme: {
      getCurrent: () => ipcRenderer.invoke('plugins:call', 'getCurrentTheme'),
      getAvailable: () => ipcRenderer.invoke('plugins:call', 'getAvailableThemes'),
      apply: (themeId: string) => ipcRenderer.invoke('config:set', 'app.theme', themeId),
    },

    // ── E3j #74：语言查询 + E3c #40 广播缓存 ──
    language: {
      /** 获取当前语言 */
      getCurrent: () => ipcRenderer.invoke('plugins:call', 'getCurrentLanguage'),
      /** 获取所有可用语言列表 */
      getAvailable: () => ipcRenderer.invoke('plugins:call', 'getAvailableLanguages'),
      /** 切换语言 */
      set: (langId: string) => ipcRenderer.invoke('config:set', 'app.language', langId),
      /** 获取初始语言数据（WebView 加载时壳已推送） */
      getInitial: () => _langCache,
      /** 订阅语言变更——返回 unsubscribe */
      onChange: (cb: (data: { lang: string; resources: Record<string, unknown> }) => void) => {
        _langSubscribers.add(cb);
        return () => { _langSubscribers.delete(cb); };
      },
    },

    // ── E5.5#7-p2：快捷键——插件零 @src/core import，全走 IPC ──
    keybindings: {
      getKeybindings: () => ipcRenderer.invoke('plugins:call', 'getKeybindings'),
      getConflicts: () => ipcRenderer.invoke('plugins:call', 'getKeybindingConflicts'),
      registerKeybinding: (binding: unknown) => ipcRenderer.invoke('plugins:call', 'registerKeybinding', binding),
      saveUserKeybindings: () => ipcRenderer.invoke('plugins:call', 'saveUserKeybindings'),
      removeKeybindingForCommand: (commandId: string) => ipcRenderer.invoke('plugins:call', 'removeKeybindingForCommand', commandId),
      resetKeybindingToDefault: (commandId: string) => ipcRenderer.invoke('plugins:call', 'resetKeybindingToDefault', commandId),
      findKeybindingForCommand: (commandId: string) => ipcRenderer.invoke('plugins:call', 'findKeybindingForCommand', commandId),
      setKeybindingCaptureActive: (active: boolean) => ipcRenderer.invoke('plugins:call', 'setKeybindingCaptureActive', active),
      /** 纯函数——KeyboardEvent → "ctrl+shift+k"。不需 IPC，preload 本地执行。 */
      keyboardEventToKeyString: (e: KeyboardEvent): string => {
        const parts: string[] = [];
        if (e.ctrlKey) parts.push("ctrl");
        if (e.shiftKey) parts.push("shift");
        if (e.altKey) parts.push("alt");
        if (e.metaKey) parts.push("meta");
        const keyMap: Record<string, string> = {
          ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right",
          Escape: "escape", Enter: "enter", Tab: "tab", Backspace: "backspace",
          Delete: "delete", Home: "home", End: "end", PageUp: "pageup", PageDown: "pagedown",
          " ": "space",
        };
        // 🔥 防御：contextBridge 结构化克隆可能丢掉 KeyboardEvent 原生属性，e.key 为 undefined 时直接返回空
        if (!e?.key) return "";
        const key = keyMap[e.key] ?? e.key.toLowerCase();
        if (["control", "shift", "alt", "meta"].includes(key)) return "";
        parts.push(key);
        const order = ["ctrl", "shift", "alt", "meta"];
        return parts.sort((a, b) => {
          const ai = order.indexOf(a), bi = order.indexOf(b);
          if (ai !== -1 && bi !== -1) return ai - bi;
          if (ai !== -1) return -1;
          if (bi !== -1) return 1;
          return a.localeCompare(b);
        }).join("+");
      },
      /** 订阅快捷键变更——设置页快捷键子栏实时刷新 */
      onChange: (cb: () => void) => events.on("keybindings:changed", cb),
    },

    // E5.5#9j：插件 WebView 渲染完成 → 通知壳 (instanceId, pluginId)
    // instanceId 从 URL 解析，pluginId 可从参数覆盖或也从 URL 解析。
    pluginViews: {
      notifyReady: (pluginId?: string) => ipcRenderer.send('plugin-view:ready', _pluginInstanceId, pluginId ?? _urlPluginId),
    },

    // ── E5#71：插件持久化存储——集中缓存 + 文件持久化 ──
    pluginState: {
      get: (pluginId: string, key: string): Promise<unknown> =>
        ipcRenderer.invoke('pluginState:get', pluginId, key),
      set: (pluginId: string, key: string, value: unknown): Promise<void> =>
        ipcRenderer.invoke('pluginState:set', pluginId, key, value),
      // E5#84f：订阅变更——跨 WebView 状态同步原语
      onChange: (pluginId: string, key: string, cb: (value: unknown) => void) => {
        return events.on("plugin-state:changed", (data: any) => {
          if (data?.pluginId === pluginId && data?.key === key) {
            cb(data.value);
          }
        });
      },
    },

    // ── E5#69：菜单——插件声明式读写 ──
    // 插件直接传字符串 menuId（如 "editorContext"、"settingItemGear"）→ 对标 VS Code 的 "editor/context"。
    // menuId 是 API 契约的一部分——不提供 enum/常量对象。单一真源：字符串字面量本身。
    menu: {
      registerItems: (menuId: string, pluginId: string, items: unknown[]) =>
        ipcRenderer.invoke('menu:registerItems', menuId, pluginId, items),
      getItems: (menuId: string, context?: Record<string, unknown>): Promise<unknown[]> =>
        ipcRenderer.invoke('menu:getItems', menuId, context),
    },

    // ── E5#70：ContextKey——本地同步 store + IPC 广播（多 WebView 火种）──
    contextKey: {
      set: (key: string, value: unknown) => {
        _contextKeyStore.set(key, value);
        ipcRenderer.invoke('contextKey:set', key, value);
      },
      _getValue: (key: string) => _contextKeyStore.get(key),
    },

    // ── E5#68：标签页操作——插件调壳的 tabs API ──
    tabs: {
      create: (type: string, opts?: Record<string, unknown>) =>
        ipcRenderer.invoke('tabs:create', type, opts),
      openOrFocus: (type: string, opts?: Record<string, unknown>) =>
        ipcRenderer.invoke('tabs:openOrFocus', type, opts),
      focus: (tabId: string) =>
        ipcRenderer.invoke('tabs:focus', tabId),
      close: (tabId: string) =>
        ipcRenderer.invoke('tabs:close', tabId),
      focusBySourceId: (sourceId: string) =>
        ipcRenderer.invoke('tabs:focusBySourceId', sourceId),
      updateLabelBySourceId: (sourceId: string, label: string) =>
        ipcRenderer.invoke('tabs:updateLabelBySourceId', sourceId, label),
      closeBySourceId: (sourceId: string) =>
        ipcRenderer.invoke('tabs:closeBySourceId', sourceId),
    },

    // ── E5#74e: p2p.on 用独立 IPC 通道——和 serial.onData 同模式（已验证通）──
    p2p: {
      send: (target: string, channel: string, data: unknown) => {
        ipcRenderer.send('p2p:send', { target, channel, data });
      },
      on: (channel: string, cb: (data: unknown) => void) =>
        listenDirect(ipcRenderer, 'p2p:data', (d: { channel: string; data: unknown }) => {
          if (d.channel === channel) cb(d.data);
        }),
    },

    // ── E5#67：弹窗——插件 WebView 调壳的 ConfirmDialog，走 IPC ──
    dialog: {
      confirm: (message: string): Promise<boolean> =>
        ipcRenderer.invoke('dialog:confirm', message),
      alert: (message: string): Promise<void> =>
        ipcRenderer.invoke('dialog:alert', message),
    },

    // ── E5#62：壳→插件请求处理——handle 注册 channel handler，unhandle 注销 ──
    pluginRequest: {
      handle(channel: string, handler: (payload: unknown) => unknown) {
        pluginRequestHandlers.set(channel, async (p) => handler(p));
        // E5.5#1：回放 handler 注册前缓冲的请求
        _replayPending(channel);
      },
      unhandle(channel: string) {
        pluginRequestHandlers.delete(channel);
      },
    },

    // ── E5#85：path——纯工具函数，同步无 IPC ──
    path: {
      normalize: (p: string) => p.replace(/\\/g, "/"),
      join: (...parts: string[]) => parts.map(p => p.replace(/\\/g, "/")).join("/").replace(/\/+/g, "/"),
      basename: (p: string) => { const s = p.replace(/\\/g, "/").split("/"); return s[s.length - 1] || ""; },
      dirname: (p: string) => { const s = p.replace(/\\/g, "/").split("/"); s.pop(); return s.join("/") || "."; },
      extname: (p: string) => { const b = p.replace(/\\/g, "/").split("/").pop() || ""; const i = b.lastIndexOf("."); return i > 0 ? b.slice(i) : ""; },
    },

    // ── E5.5#7 Bug B fix：LSP 桥——插件 WebView 内编辑器连接语言服务器 ──
    // E5.5#7 Bug B fix：多 WebView 下编辑器在独立 WebView 中运行，必须通过 IPC 与主进程 LSP 通信。
    // onData 用 listenDirect——主进程 view.webContents.send("lsp:data") 直发，不经 IpcBridge.broadcast。
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

    // ── E5.5#7 Bug B fix：LangDefRegistry 跨 WebView 同步 ──
    // 多 WebView 下编辑器在独立 WebView 中运行，LangDefRegistry 为空。
    // 语言插件（Python/Rust/C++）的 LangDefContribution 在壳侧 JS 上下文注册，
    // 编辑器需要这些信息来启动 LSP 客户端。通过 IPC 从壳侧获取全部 LangDef。
    langDef: {
      getAll: (): Promise<[string, any][]> =>
        ipcRenderer.invoke('plugins:call', 'getAllLangDefs'),
    },

    // ── E3a #27-#28：通用事件订阅 + E3j #77 emit——插件间数据管道 ──
    // IPC 回调模板（ref 桥接 + cleanup + 超时）的消费入口。
    // ── E3j #77a：归一化——events 对象由 createEventSystem() 生成 ──
    // ── E5.6#8b：pool API——池接收布局、通知壳就绪 ──
    // ── E5.6#11k：pool.sidebarAction——池→壳侧栏写操作（reorder/setCollapsed/setVisible）──
    pool: {
      /** 注册布局回调——返回 unsubscribe。首次注册时回放缓冲的 layout。 */
      onLayout: (cb: (layout: any) => void) => {
        _onLayoutCallback = cb;
        _onLayoutActive = true;
        // 回放缓冲——preload 就位 ~ React mount 之间到达的 layout
        for (const layout of _layoutBuffer) {
          try { cb(layout); } catch { /* contextBridge 回调静默失败 */ }
        }
        _layoutBuffer.length = 0;
        return () => {
          _onLayoutCallback = null;
          _onLayoutActive = false;
        };
      },
      /** 池就绪通知——壳收到 pool:ready 后开始 pushLayout */
      ready: () => ipcRenderer.send('pool:ready', _poolZone),
      /** E5.6#11k：侧栏写操作——池→主进程→壳→ViewContainerService */
      sidebarAction: (action: unknown) => ipcRenderer.send('pool:sidebar-action', action),
    },

    events,
  });

  // E5#62：模块级 handler 表——contextBridge 隔离世界和 ipcRenderer 共用
  const pluginRequestHandlers = new Map<string, (payload: unknown) => Promise<unknown>>();

  // E5.5#1：缓冲 handler 注册前到达的请求——多 WebView 下壳可能比插件模块先发请求
  // handler 注册后通过 _replayPending 回放。
  const _pendingRequests: Array<{
    requestId: string;
    channel: string;
    payload: unknown;
    timestamp: number;
  }> = [];

  function _replayPending(channel: string): void {
    const matches = _pendingRequests.filter((r) => r.channel === channel);
    if (matches.length === 0) return;
    for (const req of matches) {
      const h = pluginRequestHandlers.get(req.channel);
      if (!h) continue;
      h(req.payload)
        .then((result) => ipcRenderer.send("bridge:plugin-response", { requestId: req.requestId, result }))
        .catch((err: any) =>
          ipcRenderer.send("bridge:plugin-response", {
            requestId: req.requestId,
            error: err?.message ?? String(err),
          }),
        );
    }
    // 清理已回放的
    const ids = new Set(matches.map((r) => r.requestId));
    for (let i = _pendingRequests.length - 1; i >= 0; i--) {
      if (ids.has(_pendingRequests[i].requestId)) _pendingRequests.splice(i, 1);
    }
    // 清理过期（>10s 未匹配——主进程侧也已超时）
    const now = Date.now();
    for (let i = _pendingRequests.length - 1; i >= 0; i--) {
      if (now - _pendingRequests[i].timestamp > 10000) _pendingRequests.splice(i, 1);
    }
  }

  // E5#62：壳→插件请求——收到 plugin:request → 调 handler → 回传 bridge:plugin-response
  ipcRenderer.on("plugin:request", async (_event, { requestId, channel, payload }: {
    requestId: string;
    channel: string;
    payload: unknown;
  }) => {
    const handler = pluginRequestHandlers.get(channel);
    if (!handler) {
      // E5.5#1：handler 尚未注册——缓冲等待，由 _replayPending 在 handle() 时回放
      _pendingRequests.push({ requestId, channel, payload, timestamp: Date.now() });
      return;
    }
    try {
      const result = await handler(payload);
      ipcRenderer.send("bridge:plugin-response", { requestId, result });
    } catch (err: any) {
      ipcRenderer.send('bridge:plugin-response', {
        requestId,
        error: err?.message ?? String(err),
      });
    }
  });

  // 通知主进程 preload 成功
  ipcRenderer.send('preload-plugin-ready');
} catch (err) {
  contextBridge.exposeInMainWorld('__linkdesk_preload_error__', {
    message: String(err),
  });
  console.error('[preload-plugin] 暴露 window.linkdesk 失败:', err);
}
