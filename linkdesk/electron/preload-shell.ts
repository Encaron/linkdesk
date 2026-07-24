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

    // ── 以下命名空间在步 3-4 逐步接入 ──
    filesystem: {},
    path: {},
    plugins: {},
    commands: {},
    config: {},
    dialog: {},
    clipboard: {},
    env: {},
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
