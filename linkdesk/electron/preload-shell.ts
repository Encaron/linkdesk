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
import { createEventSystem } from './event-system';


// ── E3a #26：bridge 请求处理器——主进程转发插件 IPC 到壳侧服务 ──
let bridgeRequestHandler: ((req: { requestId: string; channel: string; args: any[] }) => void) | null = null;

ipcRenderer.on('bridge:request', (_event, req: any) => {
  if (bridgeRequestHandler !== null) {
    bridgeRequestHandler(req);
  } else {
    console.warn('[preload-shell] 收到 bridge:request 但壳侧处理器未注册——IpcBridgeHandler 未初始化？');
  }
});

// ── E3j #77a：归一化事件系统——由 event-system.ts 提供 ──
const events = createEventSystem(ipcRenderer, {
  logPrefix: 'preload-shell',
});

try {
  // ── 事件监听辅助（对标 Tauri listen() / useTauriEvent）──
  // 每个 on*() 返回 unsubscribe 函数，支持 generation counter 模式

  const makeListener = (channel: string) => {
    return (cb: (...args: any[]) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, ...args: any[]) => cb(...args);
      ipcRenderer.on(channel, handler);
      return () => {
        ipcRenderer.removeListener(channel, handler);
      };
    };
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
      onData:     makeListener('serial:data'),
      onStats:    makeListener('serial:stats'),
      onSystem:   makeListener('serial:system'),
    },

    // ── 文件系统（步 3 接入——对标 @tauri-apps/plugin-fs）──
    filesystem: {
      readTextFile:  (p: string)           => ipcRenderer.invoke('filesystem:readTextFile', p),
      writeTextFile: (p: string, d: string) => ipcRenderer.invoke('filesystem:writeTextFile', p, d),
      exists:        (p: string)           => ipcRenderer.invoke('filesystem:exists', p),
      mkdir:         (p: string)           => ipcRenderer.invoke('filesystem:mkdir', p),
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
            ipcRenderer.invoke('filesystem:unwatch', watcherId).catch(() => {});
          };
        });
      },
    },

    // ── 路径（步 3 接入——对标 @tauri-apps/api/path）──
    path: {
      appDataDir: () => ipcRenderer.invoke('path:appDataDir'),
      join: (...parts: string[]) => ipcRenderer.invoke('path:join', ...parts),
    },

    // ── 插件管理（步 3 接入——对标 Rust plugins.rs）──
    plugins: {
      listDirs:     () => ipcRenderer.invoke('plugins:listDirs'),
      install:      (src: string) => ipcRenderer.invoke('plugins:install', src),
      uninstall:    (id: string) => ipcRenderer.invoke('plugins:uninstall', id),
      reinstall:    (id: string) => ipcRenderer.invoke('plugins:reinstall', id),
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

    // ── 以下命名空间在步 4 接入 ──
    commands: {},
    config: {},
    // ── 对话框（步 4 接入——对标 @tauri-apps/plugin-dialog）──
    dialog: {
      open: (opts?: any) => ipcRenderer.invoke('dialog:open', opts),
      // E5#67：确认/提示弹窗——统一 API，走 PROXY_CHANNELS → IpcBridgeHandler → DialogService
      confirm: (message: string): Promise<boolean> =>
        ipcRenderer.invoke('dialog:confirm', message),
      alert: (message: string): Promise<void> =>
        ipcRenderer.invoke('dialog:alert', message),
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
    },
    clipboard: {},
    // ── Shell（E4V#18-#19——revealInOS / openInTerminal）──
    shell: {
      showItemInFolder:(p: string) => ipcRenderer.invoke('shell:showItemInFolder', p),
      openInTerminal:  (p: string) => ipcRenderer.invoke('shell:openInTerminal', p),
    },
    // ── 环境信息（E2c #13b——对标 VS Code ExtensionContext）──
    env: {
      get: (pluginId?: string) => ipcRenderer.invoke('env:get', pluginId),
    },

    // ── 事件（E2a #5 心跳 + E3j #77a on/emit 归一化）──
    events: {
      ...events, // on + emit 由 createEventSystem() 提供
      heartbeat: () => ipcRenderer.send('heartbeat'),
      notifyTheme: (isDark: boolean) => ipcRenderer.send('theme-changed', isDark),
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
      pushToPlugin: (pluginId: string, channel: string, payload: unknown) => {
        ipcRenderer.send('bridge:push-to-plugin', { pluginId, channel, payload });
      },
      // E5#62：壳→插件请求-响应——等插件处理完返回结果
      requestToPlugin: (pluginId: string, channel: string, payload: unknown): Promise<unknown> => {
        return ipcRenderer.invoke('bridge:request-to-plugin', pluginId, channel, payload);
      },
      // E3b #35：广播到所有插件 WebView——主题切换、语言切换等全局事件
      broadcast: (channel: string, payload: unknown) => {
        ipcRenderer.send('bridge:broadcast', { channel, payload });
      },
    },

    // ── E3a #29：插件视图管理——壳侧控制插件 WebContentsView 的显隐和位置 ──
    pluginViews: {
      setVisible: (id: string, v: boolean) => ipcRenderer.invoke('plugin-view:setVisible', id, v),
      setBounds: (id: string, b: { x: number; y: number; width: number; height: number }) =>
        ipcRenderer.invoke('plugin-view:setBounds', id, b),
      getAllIds: () => ipcRenderer.invoke('plugin-view:getAllIds'),
      toggleDevTools: (id: string) => ipcRenderer.invoke('plugin-view:toggleDevTools', id), // E3f #58
      create: (id: string) => ipcRenderer.invoke('plugin-view:create', id), // E3f #58a
      destroy: (id: string) => ipcRenderer.invoke('plugin-view:destroy', id), // E3f #58d
      // #58e 修复：订阅插件 WebView 渲染完成通知——壳收到后才关 React fallback
      onReady: (cb: (pluginId: string) => void) => {
        const handler = (_event: Electron.IpcRendererEvent, pluginId: string) => cb(pluginId);
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
      onData: (cb: (channelId: string, data: string) => void) => {
        const handler = (_event: Electron.IpcRendererEvent, { channelId, data }: { channelId: string; data: string }) => cb(channelId, data);
        ipcRenderer.on('lsp:data', handler);
        return () => ipcRenderer.removeListener('lsp:data', handler);
      },
    },

    // ── E3f #52f：窗口控制——TitleBar 的自定义 ─ □ × 按钮 ──
    window: {
      minimize:  () => ipcRenderer.send('window:minimize'),
      maximize:  () => ipcRenderer.send('window:maximize'),
      unmaximize:() => ipcRenderer.send('window:unmaximize'),
      close:     () => ipcRenderer.send('window:close'),
      toggleDevTools: () => ipcRenderer.invoke('window:toggleDevTools'), // E3f #58
      isMaximized:() => ipcRenderer.invoke('window:isMaximized'),
      onMaximizeChange: (cb: (maximized: boolean) => void) => {
        const h = (_e: any, m: boolean) => cb(m);
        ipcRenderer.on('window:maximize-change', h);
        return () => ipcRenderer.removeListener('window:maximize-change', h);
      },
    },
  });

  // 通知主进程 preload 加载成功
  // 为什么：新风险 3——preload 抛异常不进 ErrorBoundary。主进程需要知道
  // window.linkdesk 是否成功暴露，否则所有调用白屏无诊断
  ipcRenderer.send('preload-ready');
} catch (err) {
  // preload 失败时暴露诊断信息——比白屏好
  // 渲染进程 App.tsx 最早执行时会检查此字段
  contextBridge.exposeInMainWorld('__linkdesk_preload_error__', {
    message: String(err),
  });
  console.error('[preload-shell] 暴露 window.linkdesk 失败:', err);
}
