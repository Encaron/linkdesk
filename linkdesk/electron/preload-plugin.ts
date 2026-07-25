/**
 * 插件 WebView preload 脚本
 *
 * E1 步 5：比 preload-shell.ts 更窄——核心无知原则：插件不知道壳的存在。
 * E3a 生产使用时，此文件直接作为 PluginWebContentsView 的 preload。
 *
 * 只暴露"消费核心服务"的 API——不暴露壳操作。
 * ⚠️ 不暴露 plugins.*（不能自己安装/卸载插件）
 * ⚠️ 不暴露 window.*（不能创建/关闭 WebView）
 * ⚠️ 不暴露 dialog.*（不能弹系统对话框——走壳的 toast/ConfirmDialog）
 */

import { contextBridge, ipcRenderer } from 'electron';

try {
  contextBridge.exposeInMainWorld('linkdesk', {
    // ── 串口（消费端——读/写/监听，不含管理）──
    serial: {
      getPorts:  () => ipcRenderer.invoke('serial:listPorts'),
      getStatus: () => ipcRenderer.invoke('serial:getStatus'),
      openPort:  (cfg: any) => ipcRenderer.invoke('serial:openPort', cfg),
      closePort: () => ipcRenderer.invoke('serial:closePort'),
      sendData:  (data: number[]) => ipcRenderer.invoke('serial:sendData', data),
      sendText:  (text: string, enc: string) => ipcRenderer.invoke('serial:sendText', text, enc),
      // 事件监听（对标 Tauri listen）
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
      setDtr: (enable: boolean) => ipcRenderer.invoke('serial:setDtr', enable),
      setRts: (enable: boolean) => ipcRenderer.invoke('serial:setRts', enable),
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

    // ── 命令（注册/执行）──
    commands: {
      register: (id: string, handler: (...args: any[]) => any) =>
        ipcRenderer.invoke('commands:register', id),
      execute:  (id: string, ...args: any[]) =>
        ipcRenderer.invoke('commands:execute', id, ...args),
    },

    // ── 文件系统（受限——插件只能读写自己的数据目录）──
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

    // ── E3a #27：通用事件订阅——壳推送事件到插件 WebView ──
    events: {
      // 订阅事件——对标 VS Code onDidChangeXxx
      on: (channel: string, cb: (payload: any) => void) => {
        const handler = (_event: any, data: { channel: string; payload: any }) => {
          if (data.channel === channel) cb(data.payload);
        };
        ipcRenderer.on('plugin:push', handler);
        return () => ipcRenderer.removeListener('plugin:push', handler);
      },
      // 取消某 channel 的全部订阅
      off: (channel: string) => {
        // removeAllListeners 不支持按 channel 过滤——手动遍历
        // 注意：这会移除该 channel 的所有 listener（包括其他组件的）
        // 对标 VS Code：每个 dispose 只移除自己注册的 listener
        // 所以推荐使用 on() 返回的 unsubscribe 函数，而不是 off()
        const listeners = (ipcRenderer as any).rawListeners?.('plugin:push') ?? [];
        for (const fn of listeners) {
          ipcRenderer.removeListener('plugin:push', fn);
        }
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
