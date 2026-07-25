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

import { contextBridge, ipcRenderer } from 'electron';

// ── E3a #26：bridge 请求处理器——主进程转发插件 IPC 到壳侧服务 ──
let bridgeRequestHandler: ((req: { requestId: string; channel: string; args: any[] }) => void) | null = null;

ipcRenderer.on('bridge:request', (_event, req: any) => {
  if (bridgeRequestHandler !== null) {
    bridgeRequestHandler(req);
  } else {
    console.warn('[preload-shell] 收到 bridge:request 但壳侧处理器未注册——IpcBridgeHandler 未初始化？');
  }
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

  const makeOff = (channel: string) => {
    return () => ipcRenderer.removeAllListeners(channel);
  };

  contextBridge.exposeInMainWorld('linkdesk', {
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
      offData:    makeOff('serial:data'),
      offStats:   makeOff('serial:stats'),
      offSystem:  makeOff('serial:system'),
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
      watch:         (p: string)           => ipcRenderer.invoke('filesystem:watch', p),
      unwatch:       (id: number)          => ipcRenderer.invoke('filesystem:unwatch', id),
      onFileChange:  makeListener('filesystem:changed'),
      offFileChange: makeOff('filesystem:changed'),
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
    },
    clipboard: {},
    // ── 环境信息（E2c #13b——对标 VS Code ExtensionContext）──
    env: {
      get: (pluginId?: string) => ipcRenderer.invoke('env:get', pluginId),
    },

    // ── 事件（E2a #5 心跳看门狗等）──
    events: {
      heartbeat: () => ipcRenderer.send('heartbeat'),
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
