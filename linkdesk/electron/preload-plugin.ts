/**
 * 插件 WebView preload 脚本
 *
 * E1 步 5 + E3a #28 细化：比 preload-shell.ts 更窄——核心无知原则：插件不知道壳的存在。
 * E3a 生产使用时，此文件直接作为 PluginWebContentsView 的 preload。
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
import { createEventSystem } from './event-system';

// ── E5#19b fix: ContextKey 本地同步 store——IPC 回路延迟致键盘分发读不到最新值 ──
const _contextKeyStore = new Map<string, unknown>();
ipcRenderer.on('contextKey:changed', (_event, { key, value }: { key: string; value: unknown }) => {
  _contextKeyStore.set(key, value);
});


try {
  // ── 语言资源缓存（E3c #40：接收壳广播的初始语言数据）──
  let _langCache: { lang: string; resources: Record<string, unknown> } | null = null;
  const _langSubscribers = new Set<(data: { lang: string; resources: Record<string, unknown> }) => void>();


  const events = createEventSystem(ipcRenderer, {
    logPrefix: 'preload-plugin',
    extraHandlers: {
      // E3b #35：theme:changed 自动注入 CSS 变量，插件无需手动订阅
      'theme:changed': (payload) => {
        const { themeId, themeType, variables } = payload as any;
        try {
          document.documentElement.setAttribute('data-theme', themeType ?? 'dark');
          let style = document.getElementById('linkdesk-theme') as HTMLStyleElement | null;
          if (!style) {
            style = document.createElement('style');
            style.id = 'linkdesk-theme';
            document.head.appendChild(style);
          }
          style.textContent = `:root { ${
            Object.entries(variables as Record<string, string>).map(([k, v]) => `--${k}:${v};`).join(' ')
          } }`;
        } catch (e) {
          console.error('[preload-plugin] theme:changed CSS 注入失败:', e);
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
  const configurationObj = {
    get:  (key: string) => ipcRenderer.invoke('config:get', key),
    set:  (key: string, v: any) => ipcRenderer.invoke('config:set', key, v),
    getSchema: (key?: string) => ipcRenderer.invoke('plugins:call', 'getSchema', key),
    onChange: (key: string, cb: (v: any) => void) => {
      const handler = (_: any, d: { key: string; value: any }) => {
        if (!key || d.key === key) cb(d.value);
      };
      ipcRenderer.on('config:changed', handler);
      return () => ipcRenderer.removeListener('config:changed', handler);
    },
  };

  contextBridge.exposeInMainWorld(APP_NAMESPACE, {
    /** OS 拖入——从 File 对象取真实路径。Electron 43 contextIsolation 下 File.path 为空，必须走 webUtils。 */
    getFilePath: (file: File) => webUtils.getPathForFile(file),

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
      // 直接 IPC 监听（主进程 serial-service → 插件 WebView）
      onData:   (cb: (d: any) => void) => {
        const handler = (_: any, d: any) => cb(d);
        ipcRenderer.on('serial:data', handler);
        return () => ipcRenderer.removeListener('serial:data', handler);
      },
      onStats:  (cb: (d: any) => void) => {
        const handler = (_: any, d: any) => cb(d);
        ipcRenderer.on('serial:stats', handler);
        return () => ipcRenderer.removeListener('serial:stats', handler);
      },
      onSystem: (cb: (d: any) => void) => {
        const handler = (_: any, d: any) => cb(d);
        ipcRenderer.on('serial:system', handler);
        return () => ipcRenderer.removeListener('serial:system', handler);
      },
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
            ipcRenderer.invoke('filesystem:unwatch', watcherId).catch(() => {});
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

    // #58e 修复：插件 WebView 渲染完成 → 通知壳，壳收到后才关 React fallback
    pluginViews: {
      notifyReady: (pluginId: string) => ipcRenderer.send('plugin-view:ready', pluginId),
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
    menu: {
      registerItems: (menuId: string, pluginId: string, items: unknown[]) =>
        ipcRenderer.invoke('menu:registerItems', menuId, pluginId, items),
      getItems: (menuId: string): Promise<unknown[]> =>
        ipcRenderer.invoke('menu:getItems', menuId),
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
      on: (channel: string, cb: (data: unknown) => void) => {
        const handler = (_event: any, d: { channel: string; data: unknown }) => {
          if (d.channel === channel) cb(d.data);
        };
        ipcRenderer.on('p2p:data', handler);
        return () => { ipcRenderer.removeListener('p2p:data', handler); };
      },
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

    // ── E3a #27-#28：通用事件订阅 + E3j #77 emit——插件间数据管道 ──
    // IPC 回调模板（ref 桥接 + cleanup + 超时）的消费入口。
    // ── E3j #77a：归一化——events 对象由 createEventSystem() 生成 ──
    events,
  });

  // E5#62：模块级 handler 表——contextBridge 隔离世界和 ipcRenderer 共用
  const pluginRequestHandlers = new Map<string, (payload: unknown) => Promise<unknown>>();

  // E5#62：壳→插件请求——收到 plugin:request → 调 handler → 回传 bridge:plugin-response
  ipcRenderer.on('plugin:request', async (_event, { requestId, channel, payload }: {
    requestId: string;
    channel: string;
    payload: unknown;
  }) => {
    const handler = pluginRequestHandlers.get(channel);
    if (!handler) {
      ipcRenderer.send('bridge:plugin-response', {
        requestId,
        error: `[pluginRequest] 无 handler 处理 channel "${channel}"`,
      });
      return;
    }
    try {
      const result = await handler(payload);
      ipcRenderer.send('bridge:plugin-response', { requestId, result });
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
