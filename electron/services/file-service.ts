/**
 * 文件服务——fs 模块封装
 *
 * E1 步 3：对标 Tauri @tauri-apps/plugin-fs + @tauri-apps/api/path。
 * E2c 后将成为所有持久化的唯一入口（FileService 归一化）。
 *
 * 安全：不使用同步 API（fs.readFileSync 等）——避免阻塞主进程。
 */

import * as fs from 'fs/promises';
import { existsSync } from 'fs';
import * as path from 'path';
import { app } from 'electron';

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

  /** 插件目录 */
  pluginsDir(): string {
    return path.join(app.getAppPath(), 'plugins');
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

  async mkdir(dirPath: string): Promise<void> {
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
}

export const fileService = new FileService();
