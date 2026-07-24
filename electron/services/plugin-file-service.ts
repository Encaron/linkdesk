/**
 * 插件文件服务——插件目录扫描/安装/卸载/重装
 *
 * E1 步 3：逐函数映射 Rust `src-tauri/src/plugins.rs`。
 *
 * 关键行为：
 *   - 卸载走 cp+rm（不用 rename）——Windows 文件锁根因修复（卸载 9 轮反复）
 *   - core: true 插件不可卸载
 *   - 安装前校验 plugin.json 存在且 JSON 合法
 *   - 正斜杠路径（Windows 兼容 Vite /@fs/ URL）
 */

import * as fs from 'fs/promises';
import { existsSync, readFileSync } from 'fs';
import * as path from 'path';
import { fileService } from './file-service';

class PluginFileService {
  // ── 工具 ──

  /** 解析 plugins/ 目录路径 */
  private pluginsDir(): string {
    return fileService.pluginsDir();
  }

  /** 读取 plugin.json 并校验 JSON 合法性 */
  private readManifestSync(dirPath: string): Record<string, unknown> | null {
    const manifestPath = path.join(dirPath, 'plugin.json');
    if (!existsSync(manifestPath)) return null;
    try {
      return JSON.parse(readFileSync(manifestPath, 'utf-8'));
    } catch {
      return null;
    }
  }

  /** 检查是否为 core 插件（不可卸载） */
  private isCorePlugin(dirPath: string): boolean {
    const manifest = this.readManifestSync(dirPath);
    return manifest?.core === true;
  }

  // ── 列出插件（对标 Rust list_plugin_dirs）──

  async listPluginDirs(): Promise<string[]> {
    const dir = this.pluginsDir();
    if (!existsSync(dir)) return [];

    const entries = await fs.readdir(dir, { withFileTypes: true });
    const names: string[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith('.')) continue;
      if (existsSync(path.join(dir, entry.name, 'plugin.json'))) {
        names.push(entry.name);
      }
    }

    names.sort();
    return names;
  }

  // ── 列出已卸载插件（对标 Rust list_disabled_plugin_dirs）──

  async listDisabledPluginDirs(): Promise<string[]> {
    const dir = path.join(this.pluginsDir(), '.disabled');
    if (!existsSync(dir)) return [];

    const entries = await fs.readdir(dir, { withFileTypes: true });
    const names: string[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith('.')) continue;
      if (existsSync(path.join(dir, entry.name, 'plugin.json'))) {
        names.push(entry.name);
      }
    }

    names.sort();
    return names;
  }

  // ── 安装（对标 Rust install_plugin）──

  async installPlugin(source: string): Promise<string> {
    if (!existsSync(source)) {
      throw new Error(`源路径不存在: ${source}`);
    }

    const name = path.basename(source);

    // 校验 plugin.json
    const manifestPath = path.join(source, 'plugin.json');
    if (!existsSync(manifestPath)) {
      throw new Error(`不是有效插件（缺少 plugin.json）: ${source}`);
    }
    try {
      JSON.parse(await fs.readFile(manifestPath, 'utf-8'));
    } catch (e: any) {
      throw new Error(`plugin.json 格式错误: ${e.message}`);
    }

    const destDir = path.join(this.pluginsDir(), name);
    if (existsSync(destDir)) {
      throw new Error(`插件 "${name}" 已存在。请先卸载旧版本。`);
    }

    await fileService.copyDir(source, destDir);
    return name;
  }

  // ── 卸载（对标 Rust uninstall_plugin——cp+rm，不用 rename）──

  async uninstallPlugin(pluginId: string): Promise<void> {
    const dir = this.pluginsDir();
    const src = path.join(dir, pluginId);

    if (!existsSync(src)) {
      throw new Error(`插件 "${pluginId}" 不存在`);
    }

    // 检查是否 core 插件
    if (this.isCorePlugin(src)) {
      throw new Error(`核心插件 "${pluginId}" 不可卸载`);
    }

    const disabledDir = path.join(dir, '.disabled');
    await fs.mkdir(disabledDir, { recursive: true });

    const dest = path.join(disabledDir, pluginId);
    if (existsSync(dest)) {
      await fs.rm(dest, { recursive: true, force: true });
    }

    // 先复制到 .disabled/——文件拷贝不触发 Windows 跨目录 rename 的权限错误
    await fileService.copyDir(src, dest);

    // 再删原目录——Vite 可能锁住部分文件，删不掉的忽略
    await fileService.remove(src);
  }

  // ── 重装（对标 Rust reinstall_plugin——从 .disabled/ 移回）──

  async reinstallPlugin(pluginId: string): Promise<void> {
    const dir = this.pluginsDir();
    const disabledDir = path.join(dir, '.disabled');
    const src = path.join(disabledDir, pluginId);

    if (!existsSync(src)) {
      throw new Error(`已卸载的插件 "${pluginId}" 未找到`);
    }

    const dest = path.join(dir, pluginId);
    if (existsSync(dest)) {
      throw new Error(`插件 "${pluginId}" 已存在`);
    }

    // 从 .disabled/ 移回 plugins/——同级目录 rename 不受跨目录限制
    await fs.rename(src, dest);
  }

  // ── 读取 manifest（对标 Rust read_plugin_manifest）──

  async readManifest(pluginId: string): Promise<string> {
    const manifestPath = path.join(this.pluginsDir(), pluginId, 'plugin.json');
    // 如果不在主目录，检查 .disabled/
    if (!existsSync(manifestPath)) {
      const disabledPath = path.join(this.pluginsDir(), '.disabled', pluginId, 'plugin.json');
      if (!existsSync(disabledPath)) {
        throw new Error(`插件 "${pluginId}" 的 plugin.json 不存在`);
      }
      return fs.readFile(disabledPath, 'utf-8');
    }
    return fs.readFile(manifestPath, 'utf-8');
  }

  // ── 解析路径（对标 Rust resolve_plugin_path——返回正斜杠路径）──

  resolvePath(pluginId: string): string {
    const p = path.join(this.pluginsDir(), pluginId);
    // 正斜杠——Windows 反斜杠在 Vite /@fs/ URL 中不兼容
    return p.replace(/\\/g, '/');
  }
}

export const pluginFileService = new PluginFileService();
