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
  // E1 步 1：暴露空 API 结构——handler 在步 2-4 逐个接入
  // 每个命名空间 = 一组相关的系统级能力
  contextBridge.exposeInMainWorld('linkdesk', {
    serial: {
      // 步 2 接入——serialport npm 包
    },
    filesystem: {
      // 步 3 接入——fs 模块封装
    },
    path: {
      // 步 3 接入——Node.js path 模块
    },
    plugins: {
      // 步 3 接入——插件目录扫描/安装/卸载
    },
    commands: {
      // 步 4 接入——命令执行
    },
    config: {
      // 步 4 接入——配置读写
    },
    dialog: {
      // 步 3 接入——文件选择对话框
    },
    clipboard: {
      // 步 4 接入——剪贴板
    },
    env: {
      // 步 4 接入——环境信息
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
