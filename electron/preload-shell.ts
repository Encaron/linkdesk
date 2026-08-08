/**
 * 壳窗口 preload 脚本
 *
 * 通过 contextBridge 向渲染进程暴露 window.linkdesk API。
 * E1 步 1：API 结构为空壳——具体实现在步 2-4 逐步接入。
 *
 * 安全模型：
 *   - contextIsolation: true → 渲染进程无法直接访问 Node.js/Electron API
 *   - contextBridge → 精确控制暴露哪些 API
 *   - 插件 WebView 用独立的 preload-plugin.ts（E3a），API 子集更小
 */

import { contextBridge, ipcRenderer, webUtils } from 'electron';
import { APP_NAMESPACE } from './constants';
import { createEventSystem, listenDirect } from './event-system';

// ── E5#19b fix: ContextKey 本地同步 store——IPC 回路延迟致键盘分发读不到最新值 ──
const _contextKeyStore = new Map<string, unknown>();
// 监听主进程回传的 context key 变更——其他 WebView 写入后主进程广播
ipcRenderer.on('contextKey:changed', (_event, { key, value }: { key: string; value: unknown }) => {
  _contextKeyStore.set(key, value);
});

// ── E3a #26：bridge 请求处理器——主进程转发插件 IPC 到壳侧服务 ──
let bridgeRequestHandler: ((req: { requestId: string; channel: string; args: any[] }) => void) | null = null;

ipcRenderer.on('bridge:request', (_event, req: any) => {
  if (bridgeRequestHandler !== null) {
    bridgeRequestHandler(req);
  } else {
    console.warn('[preload-shell] 收到 bridge:request 但壳侧处理器未注册——IpcBridgeHandler 未初始化？');
  }
});

// E5#11l fix：模块级缓冲 plugin-view:ready——notifyReady 可能在 React useEffect 之前到达
// E5.5#9f：ready 事件现在携带 (instanceId, pluginId)，缓冲 instanceId
const _readyBuffer: string[] = [];
let _onReadyActive = false;
ipcRenderer.on('plugin-view:ready', (_event, instanceId: string, _pluginId: string) => {
  if (!_onReadyActive) {
    _readyBuffer.push(instanceId);
  }
});

// E5.5#7-p6：键盘路由——接收主进程 before-input-event 转发的快捷键
let _keyboardForwardHandler: ((input: any) => void) | null = null;
ipcRenderer.on('keyboard:executeShortcut', (_event, input: any) => {
  if (_keyboardForwardHandler) _keyboardForwardHandler(input);
});

// ── E3j #77a：归一化事件系统——由 event-system.ts 提供 ──
const events = createEventSystem(ipcRenderer, {
  logPrefix: 'preload-shell',
});

try {
  // E5#85：壳 preload 也暴露配置读写——侧栏组件（file-tree 等）调 lk.configuration.get()
  const shellConfiguration = {
    get: (key: string) => ipcRenderer.invoke('config:get', key),
    set: (key: string, v: any) => ipcRenderer.invoke('config:set', key, v),
    getSchema: (key?: string) => ipcRenderer.invoke('plugins:call', 'getSchema', key),
    // E5.5#7c：壳侧 config:changed 走主进程直发 mainWindow.webContents.send → listenDirect 正确
    onChange: (key: string, cb: (v: any) => void) =>
      listenDirect(ipcRenderer, 'config:changed', (d: { key: string; value: any }) => {
        if (!key || d.key === key) cb(d.value);
      }, { skipPushWarning: true }),
  };

  contextBridge.exposeInMainWorld(APP_NAMESPACE, {
    /** OS 拖入——从 File 对象取真实路径。Electron 43 contextIsolation 下 File.path 为空，必须走 webUtils。 */
    getFilePath: (file: File) => webUtils.getPathForFile(file),

    // ── 串口（步 2 接入）──
    serial: {
      listPorts:  ()                    => ipcRenderer.invoke('serial:listPorts'),
      getStatus:  ()                    => ipcRenderer.invoke('serial:getStatus'),
      openPort:   (cfg: any)            => ipcRenderer.invoke('serial:openPort', cfg),
      closePort:  ()                    => ipcRenderer.invoke('serial:closePort'),
      sendData:   (data: number[])      => ipcRenderer.invoke('serial:sendData', data),
      sendText:   (text: string, enc: string) => ipcRenderer.invoke('serial:sendText', text, enc),
      setDtr:     (enable: boolean)     => ipcRenderer.invoke('serial:setDtr', enable),
      setRts:     (enable: boolean)     => ipcRenderer.invoke('serial:setRts', enable),
      // 数据推送监听——对标 Tauri listen("serial-data/stats/system")
      onData:     (cb: (...args: any[]) => void) => listenDirect(ipcRenderer, 'serial:data', cb),
      onStats:    (cb: (...args: any[]) => void) => listenDirect(ipcRenderer, 'serial:stats', cb),
      onSystem:   (cb: (...args: any[]) => void) => listenDirect(ipcRenderer, 'serial:system', cb),
    },

    // ── 文件系统（步 3 接入——对标 @tauri-apps/plugin-fs）──
    filesystem: {
      readTextFile:  (p: string)           => ipcRenderer.invoke('filesystem:readTextFile', p),
      writeTextFile: (p: string, d: string) => ipcRenderer.invoke('filesystem:writeTextFile', p, d),
      exists:        (p: string)           => ipcRenderer.invoke('filesystem:exists', p),
      createDir:     (p: string)           => ipcRenderer.invoke('filesystem:createDir', p),
      readdir:       (p: string)           => ipcRenderer.invoke('filesystem:readdir', p),
      copy:          (src: string, dest: string) => ipcRenderer.invoke('filesystem:copy', src, dest),
      remove:        (p: string)           => ipcRenderer.invoke('filesystem:remove', p),
      // E2c #13 新增：listDir / readBinaryFile / watch
      listDir:       (p: string)           => ipcRenderer.invoke('filesystem:listDir', p),
      readBinaryFile:(p: string)           => ipcRenderer.invoke('filesystem:readBinaryFile', p),
      // E4V#40w——GBK 编码保存
      writeBinaryFile:(p: string, d: Uint8Array) => ipcRenderer.invoke('filesystem:writeBinaryFile', p, d),
      // E4V#fix: watch 一步完成——内部走 filesystem:changed:${watcherId}，自动隔离
      watch: (dirPath: string, onEvent: (e: { path: string; type: string }) => void) => {
        return ipcRenderer.invoke('filesystem:watch', dirPath).then((watcherId: number) => {
          const channel = `filesystem:changed:${watcherId}`;
          const handler = (_event: Electron.IpcRendererEvent, change: any) => onEvent(change);
          ipcRenderer.on(channel, handler);
          return () => {
            ipcRenderer.removeListener(channel, handler);
            ipcRenderer.invoke('filesystem:unwatch', watcherId).catch(() => {}); // 非关键操作——清理 watcher，窗口关闭时失败不阻塞
          };
        });
      },
    },

    // ── 路径（步 3 接入——对标 @tauri-apps/api/path）+ E5#85 扩展 ──
    path: {
      appDataDir: () => ipcRenderer.invoke('path:appDataDir'),
      normalize: (p: string) => p.replace(/\\/g, "/"),
      join: (...parts: string[]) => parts.map(p => String(p).replace(/\\/g, "/")).join("/").replace(/\/+/g, "/"),
      basename: (p: string) => { const s = p.replace(/\\/g, "/").split("/"); return s[s.length - 1] || ""; },
      dirname: (p: string) => { const s = p.replace(/\\/g, "/").split("/"); s.pop(); return s.join("/") || "."; },
      extname: (p: string) => { const b = p.replace(/\\/g, "/").split("/").pop() || ""; const i = b.lastIndexOf("."); return i > 0 ? b.slice(i) : ""; },
    },

    // ── 插件管理（步 3 接入——对标 Rust plugins.rs）──
    plugins: {
      listDirs:     () => ipcRenderer.invoke('plugins:listDirs'),
      readManifest: (id: string) => ipcRenderer.invoke('plugins:readManifest', id),
      resolvePath:  (id: string) => ipcRenderer.invoke('plugins:resolvePath', id),
    },

    // ── E3a #31：插件管理（桥接——走 IpcBridge → IpcBridgeHandler → loader 函数）──
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

    // ── 命令（E5#85 补全——同步 plugin preload）──
    commands: {
      execute: (id: string, ...args: any[]) => ipcRenderer.invoke('commands:execute', id, ...args),
      executeCommand: (id: string, ...args: any[]) => ipcRenderer.invoke('commands:execute', id, ...args),
      getCommands: () => ipcRenderer.invoke('plugins:call', 'getCommands'),
    },

    // ── 配置（E5#85 补全——同步 plugin preload）──
    config: shellConfiguration,
    configuration: shellConfiguration,
    // ── 对话框（步 4 接入——对标 @tauri-apps/plugin-dialog）──
    dialog: {
      open: (opts?: any) => ipcRenderer.invoke('dialog:open', opts),
      // E5#67：确认/提示弹窗——统一 API，走 PROXY_CHANNELS → IpcBridgeHandler → DialogService
      confirm: (message: string): Promise<boolean> =>
        ipcRenderer.invoke('dialog:confirm', message),
      alert: (message: string): Promise<void> =>
        ipcRenderer.invoke('dialog:alert', message),
    },

    // ── E5#71：插件持久化存储 ──
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

    // ── E5#69：菜单——
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
      // 供 ContextKeyService 同步读取——零延迟，解决键盘分发竞态
      _getValue: (key: string) => _contextKeyStore.get(key),
    },

    // ── E5.5#7-p2：快捷键——壳侧共享组件走 linkdesk.keybindings.*（零 @src/core import）──
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
      onChange: (cb: () => void) => events.on("keybindings:changed", cb),
      // E5.5#7-p7：壳→主进程同步快捷键表
      syncToMainProcess: (data: any) => ipcRenderer.invoke('keyboard:syncShortcuts', data),
      // E5.5#7-p7：接收主进程转发的 before-input-event 拦截事件
      onForwardedEvent: (cb: (input: any) => void) => {
        _keyboardForwardHandler = cb;
        return () => { _keyboardForwardHandler = null; };
      },
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
    p2p: {
      send: (target: string, channel: string, data: unknown) => {
        ipcRenderer.send('p2p:send', { target, channel, data });
      },
      on: (channel: string, cb: (data: unknown) => void) =>
        listenDirect(ipcRenderer, 'p2p:data', (d: { channel: string; data: unknown }) => {
          if (d.channel === channel) cb(d.data);
        }),
    },
    clipboard: {
      writeText: (text: string) => ipcRenderer.invoke('clipboard:writeText', text),
      writeFileList: (paths: string[]) => ipcRenderer.invoke('clipboard:writeFileList', paths),
    },
    // ── Shell（E4V#18-#19——revealInOS / openInTerminal / startDrag）──
    shell: {
      showItemInFolder:(p: string) => ipcRenderer.invoke('shell:showItemInFolder', p),
      // E5#22: 第二参数 terminalExe + 第三参数 customCommand 由调用方从 ConfigurationService 读取后传入
      openInTerminal:  (dirPath: string, terminalExe?: string, customCommand?: string) => ipcRenderer.invoke('shell:openInTerminal', dirPath, terminalExe, customCommand),
      // E5#108c：拖出到桌面
      startDrag: (filePath: string, iconPath?: string) => ipcRenderer.send('shell:startDrag', filePath, iconPath),
    },
    // ── E5#85：workspace——工作区信息查询 ──
    workspace: {
      getFolders: (): Promise<any[]> => ipcRenderer.invoke('workspace:getFolders'),
      getActive: (): Promise<string | undefined> => ipcRenderer.invoke('workspace:getActive'),
    },

    // ── 环境信息（E2c #13b——对标 VS Code ExtensionContext）──
    env: {
      get: (pluginId?: string) => ipcRenderer.invoke('env:get', pluginId),
    },

    // ── 事件（E2a #5 心跳 + E3j #77a on/emit 归一化）──
    events: {
      ...events, // on + emit 由 createEventSystem() 提供
      heartbeat: () => ipcRenderer.send('app:heartbeat'),
      notifyTheme: (isDark: boolean) => ipcRenderer.send('theme:changed', isDark),
    },

    // ── E3a #26-#27：bridge——壳侧处理插件 IPC 请求/推送的中继 API ──
    bridge: {
      // React 侧 IpcBridgeHandler 注册请求处理器（#26）
      onRequest: (cb: (req: { requestId: string; channel: string; args: any[] }) => void) => {
        bridgeRequestHandler = cb;
        return () => { bridgeRequestHandler = null; };
      },
      // React 侧 IpcBridgeHandler 响应请求（#26）
      respond: (requestId: string, result?: unknown, error?: string) => {
        ipcRenderer.send('bridge:response', { requestId, result, error });
      },
      // 壳侧推送事件到插件 WebView（#27）——串口数据、配置变更等
      pushToPlugin: (instanceId: string, channel: string, payload: unknown) => {
        ipcRenderer.send('bridge:pushToPlugin', { instanceId, channel, payload });
      },
      // E5#62：壳→插件请求-响应——等插件处理完返回结果
      requestToPlugin: (instanceId: string, channel: string, payload: unknown): Promise<unknown> => {
        return ipcRenderer.invoke('bridge:request-to-plugin', instanceId, channel, payload);
      },
      // E3b #35：广播到所有插件 WebView——主题切换、语言切换等全局事件
      broadcast: (channel: string, payload: unknown) => {
        ipcRenderer.send('bridge:broadcast', { channel, payload });
      },
      // 通知主进程配置变更——SettingsView 直调 setConfigurationValue 时绕过了 IPC proxy
      notifyConfigChanged: (key: string, value: unknown) => {
        ipcRenderer.send('config:changed-notify', { key, value });
      },
    },

    // ── E3a #29 + E5.5#9f：插件视图管理——壳侧控制插件 WebContentsView（instanceId 路由）──
    pluginViews: {
      setVisible: (instanceId: string, v: boolean) => ipcRenderer.invoke('plugin-view:setVisible', instanceId, v),
      setBounds: (instanceId: string, b: { x: number; y: number; width: number; height: number }) =>
        ipcRenderer.invoke('plugin-view:setBounds', instanceId, b),
      getAllIds: () => ipcRenderer.invoke('plugin-view:getAllIds'),
      getInstanceIdsForPlugin: (pluginId: string) => ipcRenderer.invoke('plugin-view:getInstanceIdsForPlugin', pluginId),
      toggleDevTools: (instanceId: string) => ipcRenderer.invoke('plugin-view:toggleDevTools', instanceId),
      create: (instanceId: string, pluginId: string) => ipcRenderer.invoke('plugin-view:create', instanceId, pluginId),
      destroy: (instanceId: string) => ipcRenderer.invoke('plugin-view:destroy', instanceId),
      // E5.5#3c：保活宽限期——关闭标签页不立即销毁，60s 内重开复用
      scheduleDestroy: (instanceId: string) => ipcRenderer.invoke('plugin-view:scheduleDestroy', instanceId),
      cancelDestroy: (instanceId: string) => ipcRenderer.invoke('plugin-view:cancelDestroy', instanceId),
      // E5.5#7 Bug B fix：切换标签页后转移键盘焦点到插件 WebView
      focus: (instanceId: string) => ipcRenderer.invoke('plugin-view:focus', instanceId),
      // #58e 修复 + E5.5#9f：订阅插件 WebView 渲染完成——callback 接收 instanceId
      // E5#11l fix：模块级缓冲——notifyReady 可能在 React useEffect 注册 onReady 之前到达
      onReady: (cb: (instanceId: string) => void) => {
        _onReadyActive = true;
        const handler = (_event: Electron.IpcRendererEvent, instanceId: string) => cb(instanceId);
        // 回放缓冲的 ready 事件（在 onReady 注册前到达的）
        for (const iid of _readyBuffer) cb(iid);
        _readyBuffer.length = 0;
        ipcRenderer.on('plugin-view:ready', handler);
        return () => ipcRenderer.removeListener('plugin-view:ready', handler);
      },
    },

    // ── E4V#40s2：LSP 桥——渲染进程 ↔ main process 语言服务器通信 ──
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

    // ── E3f #52f：窗口控制——TitleBar 的自定义 ─ □ × 按钮 ──
    window: {
      minimize:  () => ipcRenderer.send('window:minimize'),
      maximize:  () => ipcRenderer.send('window:maximize'),
      unmaximize:() => ipcRenderer.send('window:unmaximize'),
      close:     () => ipcRenderer.send('window:close'),
      toggleDevTools: () => ipcRenderer.invoke('window:toggleDevTools'), // E3f #58
      isMaximized:() => ipcRenderer.invoke('window:isMaximized'),
      onMaximizeChange: (cb: (maximized: boolean) => void) =>
        listenDirect(ipcRenderer, 'window:maximize-change', (m: boolean) => cb(m)),
    },
  });

  // 通知主进程 preload 加载成功
  // 为什么：新风险 3——preload 抛异常不进 ErrorBoundary。主进程需要知道
  // window.linkdesk 是否成功暴露，否则所有调用白屏无诊断
  ipcRenderer.send('app:preloadReady');
} catch (err) {
  // preload 失败时暴露诊断信息——比白屏好
  // 渲染进程 App.tsx 最早执行时会检查此字段
  contextBridge.exposeInMainWorld('__linkdesk_preload_error__', {
    message: String(err),
  });
  console.error('[preload-shell] 暴露 window.linkdesk 失败:', err);
}
