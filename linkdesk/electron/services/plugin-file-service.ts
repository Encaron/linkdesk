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
import { existsSync, readFileSync, readdirSync } from 'fs';
import * as path from 'path';
import { fileService } from './file-service.js';

/**
 * E5.7#69：插件子目录白名单消灭——运行时扫描全部子目录，不再写死 ['builtin', 'user']。
 * 唯一保留的政策常量（政策 ≠ 能力限制）：
 *   - SUBDIR_PRIORITY：同名插件冲突时的优先级——builtin > user > 其他（字母序）
 *   - INSTALL_SUBDIR：安装/重装目标永远 user/（分发政策，消毒写 distribution 同源）
 */
const SUBDIR_PRIORITY = ['builtin', 'user'] as const;
const INSTALL_SUBDIR = 'user';

/**
 * 扫描 plugins/ 下所有插件子目录。
 * 排除 . 开头（.disabled 卸载坟场等）；顺序 = SUBDIR_PRIORITY 在前 + 其余字母序。
 * protocol.ts 同源复用——协议解析与文件服务一致（新子目录插件两端同时可见）。
 */
export function scanPluginSubdirs(pluginsDir: string): string[] {
  if (!existsSync(pluginsDir)) return [];
  const priority: string[] = [];
  const others: string[] = [];
  for (const entry of readdirSync(pluginsDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
    if ((SUBDIR_PRIORITY as readonly string[]).includes(entry.name)) priority.push(entry.name);
    else others.push(entry.name);
  }
  others.sort();
  return [...priority, ...others];
}

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

  /** 查找插件所在的子目录——E5.7#69 扫描全部子目录，未找到返回 null */
  private _findPluginDir(pluginId: string): string | null {
    const dir = this.pluginsDir();
    for (const sub of scanPluginSubdirs(dir)) {
      if (existsSync(path.join(dir, sub, pluginId))) return sub;
    }
    return null;
  }

  // ── 列出插件（对标 Rust list_plugin_dirs）──

  async listPluginDirs(): Promise<string[]> {
    const dir = this.pluginsDir();
    if (!existsSync(dir)) return [];

    const names: string[] = [];
    // E5.7#69：扫描全部子目录（新子目录插件自动可见，无需改代码）
    for (const sub of scanPluginSubdirs(dir)) {
      const subDir = path.join(dir, sub);

      const entries = await fs.readdir(subDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        if (entry.name.startsWith('.')) continue;
        if (existsSync(path.join(subDir, entry.name, 'plugin.json'))) {
          names.push(entry.name);
        }
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

    const destDir = path.join(this.pluginsDir(), INSTALL_SUBDIR, name);
    if (existsSync(destDir)) {
      throw new Error(`插件 "${name}" 已存在。请先卸载旧版本。`);
    }

    await fileService.copyDir(source, destDir);

    // 安装后强制消毒——市场下载的插件永远不是 builtin/core
    const destManifestPath = path.join(destDir, 'plugin.json');
    try {
      const raw = await fs.readFile(destManifestPath, 'utf-8');
      const manifest = JSON.parse(raw);
      if (manifest.distribution !== INSTALL_SUBDIR || manifest.core === true) {
        manifest.distribution = INSTALL_SUBDIR;
        manifest.core = false;
        await fs.writeFile(destManifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
      }
    } catch { /* 消毒失败不阻断安装 */ }

    return name;
  }

  // ── 卸载（对标 Rust uninstall_plugin——cp+rm，不用 rename）──

  async uninstallPlugin(pluginId: string): Promise<void> {
    const dir = this.pluginsDir();
    const subdir = this._findPluginDir(pluginId);
    if (!subdir) {
      throw new Error(`插件 "${pluginId}" 不存在`);
    }
    const src = path.join(dir, subdir, pluginId);

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

    // 重装到 INSTALL_SUBDIR（user/）——用户主动操作，变更为用户管理
    const dest = path.join(dir, INSTALL_SUBDIR, pluginId);
    if (existsSync(dest)) {
      throw new Error(`插件 "${pluginId}" 已存在`);
    }

    // 从 .disabled/ 移回 plugins/user/——同级目录 rename 不受跨目录限制
    await fs.rename(src, dest);
  }

  // ── 读取 manifest（对标 Rust read_plugin_manifest）──

  async readManifest(pluginId: string): Promise<string> {
    const subdir = this._findPluginDir(pluginId);
    const manifestPath = subdir
      ? path.join(this.pluginsDir(), subdir, pluginId, 'plugin.json')
      : path.join(this.pluginsDir(), pluginId, 'plugin.json');

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
    const subdir = this._findPluginDir(pluginId);
    const p = subdir
      ? path.join(this.pluginsDir(), subdir, pluginId)
      : path.join(this.pluginsDir(), pluginId);
    // 正斜杠——Windows 反斜杠在 Vite /@fs/ URL 中不兼容
    return p.replace(/\\/g, '/');
  }
}

export const pluginFileService = new PluginFileService();
