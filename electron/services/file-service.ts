/**
 * 文件服务——fs 模块封装
 *
 * E1 步 3：对标 Tauri @tauri-apps/plugin-fs + @tauri-apps/api/path。
 * E2c 后将成为所有持久化的唯一入口（FileService 归一化）。
 *
 * 安全：不使用同步 API（fs.readFileSync 等）——避免阻塞主进程。
 */

import * as fs from 'fs/promises';
import { existsSync, watch as fsWatch } from 'fs';
import * as path from 'path';
import { app } from 'electron';
import type { FileEntry } from '../../src/core/types/fileEntry'; // E5.7#45.5：shared/types.ts 迁入 src/core/types/


class FileService {
  // ── 路径工具（对标 @tauri-apps/api/path）──

  /** 应用数据目录——对标 Tauri appDataDir() */
  appDataDir(): string {
    return app.getPath('userData');
  }

  /** 路径拼接——对标 Tauri path.join() */
  join(...parts: string[]): string {
    return path.join(...parts);
  }

  /** 插件目录——打包后 plugins 在 extraResources，不在 ASAR 内 */
  pluginsDir(): string {
    return app.isPackaged
      ? path.join(process.resourcesPath, 'plugins')
      : path.join(app.getAppPath(), 'plugins');
  }

  // ── 文件操作（对标 @tauri-apps/plugin-fs）──

  async readTextFile(filePath: string): Promise<string> {
    return fs.readFile(filePath, 'utf-8');
  }

  async writeTextFile(filePath: string, data: string): Promise<void> {
    // 确保父目录存在
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(filePath, data, 'utf-8');
  }

  exists(filePath: string): boolean {
    return existsSync(filePath);
  }

  async createDir(dirPath: string): Promise<void> {
    await fs.mkdir(dirPath, { recursive: true });
  }

  async readdir(dirPath: string): Promise<string[]> {
    return fs.readdir(dirPath);
  }

  /** 递归复制目录——对标 Rust copy_dir() */
  async copyDir(src: string, dest: string): Promise<void> {
    await fs.mkdir(dest, { recursive: true });
    const entries = await fs.readdir(src, { withFileTypes: true });
    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);
      if (entry.isDirectory()) {
        await this.copyDir(srcPath, destPath);
      } else {
        await fs.copyFile(srcPath, destPath);
      }
    }
  }

  /** 复制文件或目录——自动判断源类型 */
  async copy(src: string, dest: string): Promise<void> {
    const s = await fs.stat(src);
    if (s.isDirectory()) {
      await this.copyDir(src, dest);
    } else {
      await fs.copyFile(src, dest);
    }
  }

  /** E5.8#25.2：重命名/移动文件或目录——fs.rename 原子操作（同盘内；对标 POSIX rename / VS Code fs.rename） */
  async rename(src: string, dest: string): Promise<void> {
    await fs.rename(src, dest);
  }

  async remove(dirPath: string): Promise<void> {
    // 忽略不存在的路径（对标 Rust remove_dir_all + 容忍失败）
    try {
      await fs.rm(dirPath, { recursive: true, force: true });
    } catch {
      // 文件可能被占用——静默忽略
    }
  }

  /** 获取文件/目录状态 */
  async stat(filePath: string): Promise<{ isDirectory: boolean; isFile: boolean }> {
    const s = await fs.stat(filePath);
    return { isDirectory: s.isDirectory(), isFile: s.isFile() };
  }

  /** 列出目录内容——返回 FileEntry[]（含 isDirectory/isFile/size/modifiedAt） */
  async listDir(dirPath: string): Promise<FileEntry[]> {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    const result: FileEntry[] = [];
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      const entryData: FileEntry = {
        name: entry.name,
        path: fullPath,
        isDirectory: entry.isDirectory(),
        isFile: entry.isFile(),
      };
      // 文件补充 size + modifiedAt + readonly（目录跳过——stat 目录性能无意义）
      if (entry.isFile()) {
        try {
          const s = await fs.stat(fullPath);
          entryData.size = s.size;
          entryData.modifiedAt = s.mtimeMs;
          // E4V#10: 检查写权限——Windows 兼容（mode 0o222 = owner/group/other write）
          entryData.isReadonly = (s.mode & 0o222) === 0;
        } catch { /* 文件可能刚被删除 */ }
      }
      result.push(entryData);
    }
    return result;
  }

  /** 读取二进制文件——返回 Buffer（Electron IPC 原生支持 Buffer 传输） */
  async readBinaryFile(filePath: string): Promise<Buffer> {
    return fs.readFile(filePath);
  }

  /** E4V#40w——写入二进制文件（GBK/UTF-16 编码保存） */
  async writeBinaryFile(filePath: string, data: Buffer): Promise<void> {
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(filePath, data);
  }

  /** 开始监听文件/目录变化——返回 watcherId */
  watch(
    dirPath: string,
    onEvent: (event: { path: string; type: "created" | "changed" | "deleted" }) => void,
  ): number {
    const watcher = fsWatch(dirPath, { recursive: false }, (eventType, filename) => {
      if (!filename) return;
      const fullPath = path.join(dirPath, filename);
      onEvent({ path: fullPath, type: eventType as "created" | "changed" | "deleted" });
    });
    const id = this._nextWatcherId++;
    this._watchers.set(id, watcher);
    return id;
  }

  /** 停止监听 */
  unwatchFile(watcherId: number): void {
    const watcher = this._watchers.get(watcherId);
    if (watcher) {
      watcher.close();
      this._watchers.delete(watcherId);
    }
  }

  /** 关闭所有 watcher——app 退出前调用，防止 fs.watch 回调在窗口销毁后触发 */
  closeAllWatchers(): void {
    for (const [id, watcher] of this._watchers) {
      watcher.close();
    }
    this._watchers.clear();
  }

  private _nextWatcherId = 1;
  private _watchers = new Map<number, ReturnType<typeof fsWatch>>();
}

export const fileService = new FileService();
