/**
 * 对话框 IPC 处理器
 *
 * E1 步 4：对标 Tauri @tauri-apps/plugin-dialog。
 * 提供文件/文件夹选择对话框。
 */

import { dialog, ipcMain, type OpenDialogOptions, type SaveDialogOptions } from 'electron';
import * as fs from 'node:fs';
import { IPC } from '../channels.js';
// E5.7#97：DialogOpenOptions 归口 src/core/types/ipc/dialogs.ts（与 linkdesk-api 同源——原双份手工对齐）
import type { DialogOpenOptions, DialogSaveOptions } from '../../../src/core/types/ipc/dialogs';
// 2026-11-24 语义归属：起始目录/过滤器的唯一语义源（与 appearance.pickImage 同源）
import { getAppearanceDefaults } from '../../services/hostAssets/appearance';
// E5.8#62 审计#4：对话框父窗绑定——sender 反查宿主窗传 parent（脱出窗选图 modal 到脱出窗）
import type { WindowManager } from '../../windows/window-manager.js';
import { fileService } from '../../services/file-service.js';

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
    // 2026-11-23：已知文件夹令牌 → 主进程解析初始目录（插件只给令牌，不给绝对路径）。
    // 2026-11-24 语义归属：令牌映射的唯一源迁至 hostAssets/appearance/defaults（与 appearance.pickImage 同源）。
    // ⚠️ 兼容期：`defaultPathKind` 是旧路（设置插件 0.2.60 壳仍会传）；新路 = appearance.pickImage({domain,target})。
    // 到期条件 = 设置插件 minAppVersion 抬到含 pickImage 的壳版本后，本分支与契约字段一并删（K2 豁免账本登记）。
    if (options?.defaultPathKind === 'appearance') {
      const dir = getAppearanceDefaults(fileService.appDataDir()).dir;
      await fileService.createDir(dir);
      opts.defaultPath = dir;
    }
    const result = hostWindow
      ? await dialog.showOpenDialog(hostWindow, opts)
      : await dialog.showOpenDialog(opts);
    return result.canceled ? null : result.filePaths[0] ?? null;
  });

  // 2026-11-24（D12）：保存对话框——只选落盘路径，壳不代写内容（插件随后走 filesystem.writeTextFile）。
  // 起始目录/覆盖确认 = OS 原生（defaultName 只给建议名）；取消 → null。
  // 为什么归壳：串口已自造 showSaveFilePicker + <a download> 兜底，第二只插件必然再抄一份（判据 A）。
  ipcMain.handle(IPC.dialog.save, async (event, options?: DialogSaveOptions) => {
    const windowId = _windowManager?.getWindowIdByWebContents(event.sender) ?? 'main';
    const hostWindow = _windowManager?.getHostWindow(windowId) ?? undefined;
    const opts: SaveDialogOptions = {
      title: options?.title ?? '保存文件',
      filters: options?.filters,
      defaultPath: options?.defaultName,
    };
    const result = hostWindow
      ? await dialog.showSaveDialog(hostWindow, opts)
      : await dialog.showSaveDialog(opts);
    return result.canceled ? null : result.filePath ?? null;
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
