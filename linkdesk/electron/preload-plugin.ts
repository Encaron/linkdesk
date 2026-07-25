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

import { contextBridge, ipcRenderer } from 'electron';

try {
  // ═══════════════════════════════════════════════════════
  // E3a #28：集中式事件分发——单个 ipcRenderer.on('plugin:push')
  // 路由到各 channel 的订阅者。避免每个订阅注册一个 ipcRenderer 监听器。
  // ═══════════════════════════════════════════════════════

  const eventSubscriptions = new Map<string, Set<(payload: any) => void>>();

  ipcRenderer.on('plugin:push', (_event, data: { channel: string; payload: any }) => {
    const handlers = eventSubscriptions.get(data.channel);
    if (!handlers) return;
    for (const fn of handlers) {
      try { fn(data.payload); } catch (e) {
        console.error(`[preload-plugin] 事件回调异常 (channel=${data.channel}):`, e);
      }
    }
  });

  contextBridge.exposeInMainWorld('linkdesk', {
    // ── 串口（消费端——读/写/监听，不含管理）──
    // 注意：serial.onData/onStats/onSystem 直接监听主进程推送（与 E1-E2 兼容），
    // 不经过 events channel。E3a #30 终端迁移后，数据走 bridge:push-to-plugin →
    // plugin:push → events.on('serial:data', ...) 路径。
    serial: {
      getPorts:  () => ipcRenderer.invoke('serial:listPorts'),
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

    // ── 配置（读/写/订阅）──
    config: {
      get:  (key: string) => ipcRenderer.invoke('config:get', key),
      set:  (key: string, v: any) => ipcRenderer.invoke('config:set', key, v),
      onChange: (key: string, cb: (v: any) => void) => {
        const handler = (_: any, d: { key: string; value: any }) => {
          if (d.key === key) cb(d.value);
        };
        ipcRenderer.on('config:changed', handler);
        return () => ipcRenderer.removeListener('config:changed', handler);
      },
    },

    // ── 命令（执行壳侧命令）──
    // 🔒 不含 register——handler 函数无法通过 IPC 序列化。
    // 命令注册走 plugin.json 的 contributes.commands 声明。
    commands: {
      execute: (id: string, ...args: any[]) =>
        ipcRenderer.invoke('commands:execute', id, ...args),
    },

    // ── 文件系统（受限——主进程校验路径，仅允许读写插件数据目录）──
    // 🔒 插件只能读写 .linkdesk/plugins/<pluginId>/ 下的文件，
    // 路径校验由 file-handlers.ts 在主进程侧执行（根据 event.sender 的 WebContents 判断调用方）。
    filesystem: {
      readTextFile:  (p: string) => ipcRenderer.invoke('filesystem:readTextFile', p),
      writeTextFile: (p: string, d: string) => ipcRenderer.invoke('filesystem:writeTextFile', p, d),
    },

    // ── 剪贴板 ──
    clipboard: {
      readText:  () => ipcRenderer.invoke('clipboard:readText'),
      writeText: (text: string) => ipcRenderer.invoke('clipboard:writeText', text),
    },

    // ── 环境信息 ──
    env: {
      get: () => ipcRenderer.invoke('env:get'),
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

    // ── 对话框（同壳 preload——直接走 main process handler，不经过 bridge）──
    dialog: {
      open: (opts?: any) => ipcRenderer.invoke('dialog:open', opts),
    },

    // ── E3a #27-#28：通用事件订阅——壳推送→集中分发→插件回调 ──
    // IPC 回调模板（ref 桥接 + cleanup + 超时）的消费入口。
    // React 侧推荐使用 usePluginIpcEvent() hook（src/core/usePluginIpcEvent.ts）。
    events: {
      /**
       * 订阅壳推送事件。
       * @returns unsubscribe 函数——组件 unmount 时调用以清理。
       *
       * 使用示例：
       *   const unsub = window.linkdesk.events.on('serial:data', (data) => {
       *     setText(prev => prev + data);  // ⚠️ 注意闭包过期——推荐用 ref 桥接
       *   });
       *   // 组件清理时：
       *   unsub();
       */
      on: (channel: string, cb: (payload: any) => void) => {
        let set = eventSubscriptions.get(channel);
        if (!set) {
          set = new Set();
          eventSubscriptions.set(channel, set);
        }
        set.add(cb);
        return () => {
          set?.delete(cb);
          if (set && set.size === 0) eventSubscriptions.delete(channel);
        };
      },
    },
  });

  // 通知主进程 preload 成功
  ipcRenderer.send('preload-plugin-ready');
} catch (err) {
  contextBridge.exposeInMainWorld('__linkdesk_preload_error__', {
    message: String(err),
  });
  console.error('[preload-plugin] 暴露 window.linkdesk 失败:', err);
}
