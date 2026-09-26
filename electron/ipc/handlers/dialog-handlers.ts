/**
 * 对话框 IPC 处理器
 *
 * E1 步 4：对标 Tauri @tauri-apps/plugin-dialog。
 * 提供文件/文件夹选择对话框。
 */

import { dialog, ipcMain, type OpenDialogOptions } from 'electron';
import * as fs from 'node:fs';
import { IPC } from '../channels.js';
// E5.7#97：DialogOpenOptions 归口 src/core/types/ipc/dialogs.ts（与 linkdesk-api 同源——原双份手工对齐）
import type { DialogOpenOptions } from '../../../src/core/types/ipc/dialogs';
// E5.8#62 审计#4：对话框父窗绑定——sender 反查宿主窗传 parent（脱出窗选图 modal 到脱出窗）
import type { WindowManager } from '../../windows/window-manager.js';

// E5.7#36：壳崩重建复用本函数——无状态 handler，IPC 通道只注册一次。
// E5.8#62 审计#4：windowManager 引用每次调用刷新（file-handlers 同款模式）——壳崩重建后
// 新 WindowManager 实例（getHostWindow 反查宿主窗）跨重建存活，否则对话框永远绑旧壳宿主。
let _windowManager: WindowManager | undefined;
let _registered = false;

export function registerDialogHandlers(windowManager?: WindowManager): void {
  _windowManager = windowManager;
  if (_registered) return;
  _registered = true;
  // 打开选择对话框（文件或目录）——对标 Tauri dialog.open()
  ipcMain.handle(IPC.dialog.open, async (event, options?: DialogOpenOptions) => {
    // E5.8#62 审计#4：原无 parent → 对话框不 modal 任何窗（脱出窗选图对话框悬主窗之上、可被盖住）。
    // sender 反查所属 Pool 宿主窗传 parent：池插件（脱出窗池/主池）→ 其宿主窗；壳渲染进程 sender
    // 非池 → 回退主窗。宿主窗未知/已销毁 → 无 parent（Electron 居中于活动屏，兜底不崩）。
    const windowId = _windowManager?.getWindowIdByWebContents(event.sender) ?? 'main';
    const hostWindow = _windowManager?.getHostWindow(windowId) ?? undefined;
    const opts: OpenDialogOptions = {
      title: options?.title ?? (options?.directory ? '选择目录' : '选择文件'),
      filters: options?.filters,
      properties: options?.directory ? ['openDirectory'] : ['openFile'],
    };
    const result = hostWindow
      ? await dialog.showOpenDialog(hostWindow, opts)
      : await dialog.showOpenDialog(opts);
    return result.canceled ? null : result.filePaths[0] ?? null;
  });

  // 04「工作区导入导出-布局恢复断线」：选工作区文件 + 读回文本——**一条通道做完选与读**。
  // 🔴 为什么不是壳渲染 input.click()：点击手势在 pool 树（菜单），文件对话框要在壳树弹——
  //    user gesture 不跨 WebContents ⇒ Chromium 静默拒绝（04 实测「点了没反应」）。主进程
  //    showOpenDialog 无手势约束、modal 到宿主窗、永远置顶可见。读不出/取消一律 null（渲染侧反馈）。
  ipcMain.handle(IPC.dialog.openWorkspaceImport, async (event) => {
    const windowId = _windowManager?.getWindowIdByWebContents(event.sender) ?? 'main';
    const hostWindow = _windowManager?.getHostWindow(windowId) ?? undefined;
    const opts: OpenDialogOptions = {
      title: '导入工作区',
      filters: [{ name: 'LinkDesk 工作区', extensions: ['linkdesk-workspace'] }],
      properties: ['openFile'],
    };
    const result = hostWindow
      ? await dialog.showOpenDialog(hostWindow, opts)
      : await dialog.showOpenDialog(opts);
    if (result.canceled || result.filePaths.length === 0) return null;
    try {
      const content = await fs.promises.readFile(result.filePaths[0], 'utf8');
      return { path: result.filePaths[0], content };
    } catch {
      return null; // 文件读不出（被删/无权限）——渲染侧按「无效文件」反馈
    }
  });
}
