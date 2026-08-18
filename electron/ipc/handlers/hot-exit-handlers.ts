/**
 * E5.7#38：Hot Exit——Monaco 脏内容异步落盘（设计 §3.2）。
 *
 * 路径约定单源在本模块：%APPDATA%/linkdesk/hot-exit/<sha256(filePath)>.dirty——
 * 渲染进程（池沙箱）绝不直写 %APPDATA%（审计约束）；插件只传 filePath + content。
 *
 * 设计 §3.2 写 {workspaceId}/{filePath}.dirty——LinkDesk 文件路径恒为绝对路径（全局唯一），
 * workspaceId 分层冗余；sha256 扁平命名等价且免路径长度/非法字符/目录穿越问题，
 * 对标 VS Code Backups/ 同款 hashing。执行注已在 E5.7-执行清单 #38 说明。
 */

import { ipcMain, app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { IPC } from '../channels.js';

// E5.7#36：无状态 handler——IPC 通道只注册一次（壳崩重建 createWindow 会再次经过）
let _registered = false;

export function registerHotExitHandlers(): void {
  if (_registered) return;
  _registered = true;

  ipcMain.handle(IPC.hotExit.save, async (_event, filePath: string, content: string) => {
    // 防御守卫：filePath 拒绝空/null；content 只拒绝 null/undefined——'' 合法（清空内容也要备份）
    if (!filePath) return;
    if (content == null) return;
    await fs.promises.mkdir(hotExitDir(), { recursive: true });
    await fs.promises.writeFile(hotExitPath(filePath), content, 'utf-8');
  });

  ipcMain.handle(IPC.hotExit.load, async (_event, filePath: string) => {
    if (!filePath) return null;
    try {
      return await fs.promises.readFile(hotExitPath(filePath), 'utf-8');
    } catch {
      return null; // 无备份——正常路径
    }
  });

  ipcMain.handle(IPC.hotExit.clear, async (_event, filePath: string) => {
    if (!filePath) return;
    try {
      await fs.promises.unlink(hotExitPath(filePath));
    } catch {
      /* 不存在即成功 */
    }
  });
}

function hotExitDir(): string {
  return path.join(app.getPath('userData'), 'hot-exit');
}

/** 绝对路径 → 扁平安全文件名：sha256 十六进制 + .dirty */
function hotExitPath(filePath: string): string {
  const hash = crypto.createHash('sha256').update(filePath).digest('hex');
  return path.join(hotExitDir(), `${hash}.dirty`);
}
